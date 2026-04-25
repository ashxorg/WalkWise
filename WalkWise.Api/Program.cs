using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
});

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("SpeechCache") ?? "Data Source=speech-cache.db"));

builder.Services.AddDbContext<ContextDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("ContextStore") ?? "Data Source=context-store.db"));

builder.Services.AddSingleton<QrScanService>();
builder.Services.AddScoped<ContextService>();

var app = builder.Build();

// Ensure both SQLite schemas exist on startup (no migrations needed)
using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
    scope.ServiceProvider.GetRequiredService<ContextDbContext>().Database.EnsureCreated();
}

app.UseCors();

var cfg = app.Configuration;
var visionKey       = cfg["ApiKeys:GoogleVision"] ?? "";
var geminiKey       = cfg["ApiKeys:Gemini"]       ?? "";
var elevenKey       = cfg["ApiKeys:ElevenLabs"]   ?? "";
var characterPrompt = cfg["CharacterPrompt"]       ?? "";

// ── POST /api/vision ────────────────────────────────────────────────────────
app.MapPost("/api/vision", async (VisionRequest req, IHttpClientFactory factory) =>
{
    if (string.IsNullOrEmpty(visionKey))
        return Results.Problem("GoogleVision API key is not configured on the server.", statusCode: 500);

    var client = factory.CreateClient();
    var url = $"https://vision.googleapis.com/v1/images:annotate?key={Uri.EscapeDataString(visionKey)}";

    var body = new
    {
        requests = new[]
        {
            new
            {
                image    = new { content = req.ImageBase64 },
                features = new[]
                {
                    new { type = "LABEL_DETECTION",     maxResults = 10 },
                    new { type = "OBJECT_LOCALIZATION", maxResults = 10 },
                    new { type = "TEXT_DETECTION",      maxResults = 1  },
                },
            }
        }
    };

    var res = await client.PostAsJsonAsync(url, body);
    if (!res.IsSuccessStatusCode)
        return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

    var data = await res.Content.ReadFromJsonAsync<JsonElement>();
    var r = data.GetProperty("responses")[0];

    var labels = r.TryGetProperty("labelAnnotations", out var la)
        ? la.EnumerateArray()
            .Select(l => new
            {
                description = l.GetProperty("description").GetString(),
                score       = l.TryGetProperty("score", out var s) ? s.GetDouble() : 0.0,
            })
            .ToArray<object>()
        : [];

    var objects = r.TryGetProperty("localizedObjectAnnotations", out var oa)
        ? oa.EnumerateArray()
            .Select(o => new
            {
                name  = o.GetProperty("name").GetString(),
                score = o.TryGetProperty("score", out var s) ? s.GetDouble() : 0.0,
            })
            .ToArray<object>()
        : [];

    var text = r.TryGetProperty("fullTextAnnotation", out var fta) && fta.TryGetProperty("text", out var ft)
        ? ft.GetString()?.Trim() ?? ""
        : r.TryGetProperty("textAnnotations", out var ta) && ta.GetArrayLength() > 0 &&
          ta[0].TryGetProperty("description", out var td)
            ? td.GetString()?.Trim() ?? ""
            : "";

    return Results.Ok(new { labels, objects, text });
});

// ── POST /api/gemini/ask ─────────────────────────────────────────────────────
app.MapPost("/api/gemini/ask", async (GeminiAskRequest req, IHttpClientFactory factory, ContextService ctx, QrScanService qrScanner) =>
{
    if (string.IsNullOrEmpty(geminiKey))
        return Results.Problem("Gemini API key is not configured on the server.", statusCode: 500);

    var client = factory.CreateClient();
    var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={Uri.EscapeDataString(geminiKey)}";

    var detectionList = req.DetectedLabels?.Length > 0
        ? string.Join("\n", req.DetectedLabels.Select(l => $"- {l}"))
        : "(none)";

    var visionBlurb = req.VisionResults is not null
        ? $"\n\nGoogle Vision results for this frame:\n{FormatVision(req.VisionResults)}"
        : "";

    var qrBlock        = await ctx.GetPromptBlockAsync(req.ImageBase64, qrScanner);
    var jsonShape      = """{"question":"<verbatim transcription>","answer":"<spoken reply>"}""";
    var characterBlock = string.IsNullOrWhiteSpace(characterPrompt) ? "" : $"\n\n{characterPrompt}";
    var systemText = $"""
        You are a visual assistant helping a user understand what's around them.{characterBlock}

        The user just asked a question by voice. The audio is attached. You also have:
        - A snapshot of what the user is looking at right now.
        - The list of objects YOLO has currently detected in that snapshot.{(visionBlurb.Length > 0 ? "\n- Additional Google Vision analysis of the same frame." : "")}{qrBlock}

        Currently detected objects:
        {detectionList}{visionBlurb}

        TASK: Transcribe the spoken question, then answer it directly — always address what was actually asked, grounded in the image.
        Keep your answer to 1-3 short sentences. No markdown, no lists. Don't preface with "You asked..." — just answer naturally.
        Respond as JSON only, with this exact shape:
        {jsonShape}
        """;

    var body = new
    {
        contents = new[]
        {
            new
            {
                role  = "user",
                parts = new object[]
                {
                    new { text = systemText },
                    new { inline_data = new { mime_type = "image/jpeg",    data = req.ImageBase64 } },
                    new { inline_data = new { mime_type = req.AudioMime,   data = req.AudioBase64 } },
                },
            }
        },
        generationConfig = new
        {
            temperature        = 0.4,
            response_mime_type = "application/json",
        },
    };

    var res = await client.PostAsJsonAsync(url, body);
    if (!res.IsSuccessStatusCode)
        return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

    var data = await res.Content.ReadFromJsonAsync<JsonElement>();
    var raw  = data.GetProperty("candidates")[0]
                   .GetProperty("content")
                   .GetProperty("parts")[0]
                   .GetProperty("text").GetString() ?? "";

    var (question, answer) = ParseGeminiJson(raw);
    return Results.Ok(new { question, answer });
});

// ── POST /api/gemini/describe ────────────────────────────────────────────────
app.MapPost("/api/gemini/describe", async (GeminiDescribeRequest req, IHttpClientFactory factory, ContextService ctx, QrScanService qrScanner) =>
{
    if (string.IsNullOrEmpty(geminiKey))
        return Results.Problem("Gemini API key is not configured on the server.", statusCode: 500);

    var client = factory.CreateClient();
    var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={Uri.EscapeDataString(geminiKey)}";

    var visionBlurb = req.VisionResults is not null
        ? $"\n\nGoogle Vision analysis:\n{FormatVision(req.VisionResults)}"
        : "";

    var qrBlock        = await ctx.GetPromptBlockAsync(req.ImageBase64, qrScanner);
    var characterBlock = string.IsNullOrWhiteSpace(characterPrompt) ? "" : $"\n\n{characterPrompt}";
    var prompt = $"""
        You are a visual assistant helping a user understand what's around them.{characterBlock}

        The user tapped on an object detected as "{req.Label}".{visionBlurb}{qrBlock}

        TASK: Look at the cropped image and write 2-4 short sentences describing what you see: what it is, any notable details (color, brand, text, condition), and one piece of useful context. No lists, no markdown, no headings. Speak directly to the user.
        """;

    var body = new
    {
        contents = new[]
        {
            new
            {
                role  = "user",
                parts = new object[]
                {
                    new { text = prompt },
                    new { inline_data = new { mime_type = "image/jpeg", data = req.ImageBase64 } },
                },
            }
        },
        generationConfig = new { temperature = 0.5 },
    };

    var res = await client.PostAsJsonAsync(url, body);
    if (!res.IsSuccessStatusCode)
        return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

    var data = await res.Content.ReadFromJsonAsync<JsonElement>();
    var text = data.GetProperty("candidates")[0]
                   .GetProperty("content")
                   .GetProperty("parts")[0]
                   .GetProperty("text").GetString() ?? "";

    return Results.Ok(new { text = text.Trim() });
});

// ── POST /api/speak ──────────────────────────────────────────────────────────
app.MapPost("/api/speak", async (SpeakRequest req, IHttpClientFactory factory, AppDbContext db) =>
{
    if (string.IsNullOrEmpty(elevenKey))
        return Results.Problem("ElevenLabs API key is not configured on the server.", statusCode: 500);

    var voiceId  = string.IsNullOrWhiteSpace(req.VoiceId) ? "flHkNRp1BlvT73UL6gyz" : req.VoiceId;
    var cacheKey = ComputeCacheKey(voiceId, req.Text);

    // Return cached audio if available — no ElevenLabs call needed
    var cached = await db.SpeechCache.FirstOrDefaultAsync(e => e.CacheKey == cacheKey);
    if (cached is not null)
        return Results.Bytes(cached.AudioData, "audio/mpeg");

    // Cache miss — call ElevenLabs
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

    // Persist to cache for future requests
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

// ── GET    /api/context       — list all entries ─────────────────────────────
app.MapGet("/api/context", async (ContextService ctx) =>
    Results.Ok(await ctx.ListAllAsync()));

// ── GET    /api/context/{key} — fetch one entry ──────────────────────────────
app.MapGet("/api/context/{key}", async (string key, ContextService ctx) =>
{
    var entry = await ctx.FindAsync(Uri.UnescapeDataString(key));
    return entry is not null ? Results.Ok(entry) : Results.NotFound();
});

// ── POST   /api/context       — upsert an entry ──────────────────────────────
app.MapPost("/api/context", async (ContextUpsertRequest req, ContextService ctx) =>
{
    if (string.IsNullOrWhiteSpace(req.Key))
        return Results.BadRequest("Key is required.");
    await ctx.UpsertAsync(req.Key.Trim(), req.JsonData ?? "{}");
    return Results.Ok(new { req.Key });
});

// ── DELETE /api/context/{key} — remove an entry ──────────────────────────────
app.MapDelete("/api/context/{key}", async (string key, ContextService ctx) =>
{
    await ctx.DeleteAsync(Uri.UnescapeDataString(key));
    return Results.NoContent();
});

app.Run();

// ── Helpers ──────────────────────────────────────────────────────────────────

static string ComputeCacheKey(string voiceId, string text)
{
    var input = Encoding.UTF8.GetBytes($"{voiceId}:{text}");
    var hash  = SHA256.HashData(input);
    return Convert.ToHexString(hash).ToLowerInvariant();
}

static string FormatVision(VisionResultDto v)
{
    var parts = new List<string>();
    if (v.Labels?.Length > 0)
        parts.Add($"Labels: {string.Join(", ", v.Labels.Take(8).Select(l => $"{l.Description} ({(int)Math.Round(l.Score * 100)}%)"))}");
    if (v.Objects?.Length > 0)
        parts.Add($"Objects: {string.Join(", ", v.Objects.Take(8).Select(o => $"{o.Name} ({(int)Math.Round(o.Score * 100)}%)"))}");
    if (!string.IsNullOrWhiteSpace(v.Text))
        parts.Add($"Detected text: \"{v.Text[..Math.Min(v.Text.Length, 200)]}\"");
    return string.Join("\n", parts);
}

static (string question, string answer) ParseGeminiJson(string raw)
{
    if (string.IsNullOrWhiteSpace(raw)) return ("", "");
    try
    {
        var j = JsonDocument.Parse(raw).RootElement;
        return (
            j.TryGetProperty("question", out var q) ? q.GetString()?.Trim() ?? "" : "",
            j.TryGetProperty("answer",   out var a) ? a.GetString()?.Trim() ?? "" : raw.Trim()
        );
    }
    catch { }

    // Fallback: extract JSON object from a possibly-fenced block
    var m = System.Text.RegularExpressions.Regex.Match(raw, @"\{[\s\S]*\}");
    if (m.Success)
    {
        try
        {
            var j = JsonDocument.Parse(m.Value).RootElement;
            return (
                j.TryGetProperty("question", out var q) ? q.GetString()?.Trim() ?? "" : "",
                j.TryGetProperty("answer",   out var a) ? a.GetString()?.Trim() ?? "" : raw.Trim()
            );
        }
        catch { }
    }

    return ("", raw.Trim());
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

record VisionRequest(string ImageBase64);
record ContextUpsertRequest(string Key, string? JsonData);

record GeminiAskRequest(
    string      AudioBase64,
    string      AudioMime,
    string      ImageBase64,
    string[]?   DetectedLabels,
    VisionResultDto? VisionResults);

record GeminiDescribeRequest(
    string      Label,
    string      ImageBase64,
    VisionResultDto? VisionResults);

record SpeakRequest(string Text, string? VoiceId);

record VisionResultDto(LabelDto[]? Labels, ObjectDto[]? Objects, string? Text);
record LabelDto(string Description, double Score);
record ObjectDto(string Name, double Score);
