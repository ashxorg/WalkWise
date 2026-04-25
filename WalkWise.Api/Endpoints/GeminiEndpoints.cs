using System.Text.Json;
using WalkWise.Api.Helpers;
using WalkWise.Api.Models;

namespace WalkWise.Api.Endpoints;

static class GeminiEndpoints
{
    public static void MapGeminiEndpoints(this WebApplication app)
    {
        var geminiKey       = app.Configuration["ApiKeys:Gemini"]   ?? "";
        var characterPrompt = app.Configuration["CharacterPrompt"]  ?? "";

        var geminiUrl = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={Uri.EscapeDataString(geminiKey)}";

        // ── Ask (voice Q&A with persistent conversation history) ──────────────
        app.MapPost("/api/gemini/ask", async (GeminiAskRequest req, IHttpClientFactory factory, ContextService ctx, QrScanService qrScanner, ConversationService conv) =>
        {
            if (string.IsNullOrEmpty(geminiKey))
                return Results.Problem("Gemini API key is not configured on the server.", statusCode: 500);

            var detectionList = req.DetectedLabels?.Length > 0
                ? string.Join("\n", req.DetectedLabels.Select(l => $"- {l}"))
                : "(none)";

            var visionBlurb    = req.VisionResults is not null ? $"\n\nGoogle Vision results for this frame:\n{ApiHelpers.FormatVision(req.VisionResults)}" : "";
            var qrBlock        = await ctx.GetPromptBlockAsync(req.ImageBase64, qrScanner);
            var characterBlock = string.IsNullOrWhiteSpace(characterPrompt) ? "" : $"\n\n{characterPrompt}";
            var jsonShape      = """{"question":"<verbatim transcription>","answer":"<spoken reply>"}""";

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

            // Build contents array — prepend history turns if the user is logged in.
            var contents = new List<object>();

            if (!string.IsNullOrWhiteSpace(req.UserId))
            {
                var history = await conv.GetHistoryAsync(req.UserId);
                foreach (var turn in history)
                {
                    contents.Add(new { role = "user",  parts = new object[] { new { text = turn.Question } } });
                    contents.Add(new { role = "model", parts = new object[] { new { text = turn.Answer   } } });
                }
            }

            // Current turn: system context + image + audio
            contents.Add(new
            {
                role  = "user",
                parts = new object[]
                {
                    new { text = systemText },
                    new { inline_data = new { mime_type = "image/jpeg",  data = req.ImageBase64 } },
                    new { inline_data = new { mime_type = req.AudioMime, data = req.AudioBase64 } },
                },
            });

            var body = new
            {
                contents         = contents.ToArray(),
                generationConfig = new
                {
                    temperature        = 0.4,
                    response_mime_type = "application/json",
                },
            };

            var client = factory.CreateClient();
            var res = await client.PostAsJsonAsync(geminiUrl, body);
            if (!res.IsSuccessStatusCode)
                return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

            var data = await res.Content.ReadFromJsonAsync<JsonElement>();
            var raw  = data.GetProperty("candidates")[0]
                           .GetProperty("content")
                           .GetProperty("parts")[0]
                           .GetProperty("text").GetString() ?? "";

            var (question, answer) = ApiHelpers.ParseGeminiJson(raw);

            // Persist this turn to conversation history if the user is logged in.
            if (!string.IsNullOrWhiteSpace(req.UserId) && !string.IsNullOrWhiteSpace(question))
                await conv.AddTurnAsync(req.UserId, question, answer);

            return Results.Ok(new { question, answer });
        });

        // ── Clear conversation (begin new adventure) ───────────────────────────
        app.MapDelete("/api/gemini/conversation/{userId}", async (string userId, ConversationService conv) =>
        {
            await conv.ClearAsync(userId);
            return Results.NoContent();
        });

        // ── Describe object ────────────────────────────────────────────────────
        app.MapPost("/api/gemini/describe", async (GeminiDescribeRequest req, IHttpClientFactory factory, ContextService ctx, QrScanService qrScanner) =>
        {
            if (string.IsNullOrEmpty(geminiKey))
                return Results.Problem("Gemini API key is not configured on the server.", statusCode: 500);

            var visionBlurb    = req.VisionResults is not null ? $"\n\nGoogle Vision analysis:\n{ApiHelpers.FormatVision(req.VisionResults)}" : "";
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

            var client = factory.CreateClient();
            var res = await client.PostAsJsonAsync(geminiUrl, body);
            if (!res.IsSuccessStatusCode)
                return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

            var data = await res.Content.ReadFromJsonAsync<JsonElement>();
            var text = data.GetProperty("candidates")[0]
                           .GetProperty("content")
                           .GetProperty("parts")[0]
                           .GetProperty("text").GetString() ?? "";

            return Results.Ok(new { text = text.Trim() });
        });

        // ── Scene description ──────────────────────────────────────────────────
        app.MapPost("/api/gemini/scene", async (GeminiSceneRequest req, IHttpClientFactory factory, ContextService ctx, QrScanService qrScanner) =>
        {
            if (string.IsNullOrEmpty(geminiKey))
                return Results.Problem("Gemini API key is not configured on the server.", statusCode: 500);

            var visionBlurb    = req.VisionResults is not null ? $"\n\nGoogle Vision analysis:\n{ApiHelpers.FormatVision(req.VisionResults)}" : "";
            var qrBlock        = await ctx.GetPromptBlockAsync(req.ImageBase64, qrScanner);
            var characterBlock = string.IsNullOrWhiteSpace(characterPrompt) ? "" : $"\n\n{characterPrompt}";

            var prompt = $"""
                You are a visual assistant helping a user understand what's around them.{characterBlock}

                The user wants to know what they're looking at right now.{visionBlurb}{qrBlock}

                TASK: Describe the scene in 2-4 short sentences. What is the setting, what stands out, any notable details or context? Speak directly to the user. No lists, no markdown.
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

            var client = factory.CreateClient();
            var res = await client.PostAsJsonAsync(geminiUrl, body);
            if (!res.IsSuccessStatusCode)
                return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

            var data = await res.Content.ReadFromJsonAsync<JsonElement>();
            var text = data.GetProperty("candidates")[0]
                           .GetProperty("content")
                           .GetProperty("parts")[0]
                           .GetProperty("text").GetString() ?? "";

            return Results.Ok(new { text = text.Trim() });
        });
    }
}
