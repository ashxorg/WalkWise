using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WalkWise.Api.Helpers;
using WalkWise.Api.Models;

namespace WalkWise.Api.Endpoints;

static class SpeakEndpoints
{
    public static void MapSpeakEndpoints(this WebApplication app)
    {
        var elevenKey = app.Configuration["ApiKeys:ElevenLabs"] ?? "";

        app.MapPost("/api/speak", async (SpeakRequest req, IHttpClientFactory factory, AppDbContext db) =>
        {
            if (string.IsNullOrEmpty(elevenKey))
                return Results.Problem("ElevenLabs API key is not configured on the server.", statusCode: 500);

            var voiceId  = string.IsNullOrWhiteSpace(req.VoiceId) ? "flHkNRp1BlvT73UL6gyz" : req.VoiceId;
            var cacheKey = ApiHelpers.ComputeCacheKey(voiceId, req.Text);

            var cached = await db.SpeechCache.FirstOrDefaultAsync(e => e.CacheKey == cacheKey);
            if (cached is not null)
                return Results.Bytes(cached.AudioData, "audio/mpeg");

            var url     = $"https://api.elevenlabs.io/v1/text-to-speech/{Uri.EscapeDataString(voiceId)}?optimize_streaming_latency=2&output_format=mp3_44100_128";
            var client  = factory.CreateClient();
            var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("xi-api-key", elevenKey);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("audio/mpeg"));

            var speakBody = new
            {
                text       = req.Text,
                model_id   = "eleven_turbo_v2_5",
                voice_settings = new
                {
                    stability         = 0.45,
                    similarity_boost  = 0.75,
                    style             = 0.2,
                    use_speaker_boost = true,
                },
            };
            request.Content = new StringContent(JsonSerializer.Serialize(speakBody), Encoding.UTF8, "application/json");

            var res = await client.SendAsync(request);
            if (!res.IsSuccessStatusCode)
                return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

            var audioBytes = await res.Content.ReadAsByteArrayAsync();

            db.SpeechCache.Add(new SpeechCacheEntry
            {
                CacheKey  = cacheKey,
                VoiceId   = voiceId,
                Text      = req.Text,
                AudioData = audioBytes,
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();

            return Results.Bytes(audioBytes, "audio/mpeg");
        });
    }
}
