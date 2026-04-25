using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WalkWise.Api.Helpers;
using WalkWise.Api.Models;

namespace WalkWise.Api.Endpoints;

static class QuestEndpoints
{
    public static void MapQuestEndpoints(this WebApplication app)
    {
        var geminiKey       = app.Configuration["ApiKeys:Gemini"]   ?? "";
        var characterPrompt = app.Configuration["CharacterPrompt"] ?? "";
        var geminiUrl = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={Uri.EscapeDataString(geminiKey)}";

        app.MapGet("/api/quests", async (ContextDbContext db) =>
            Results.Ok(await db.Quests.OrderBy(q => q.QuestId).ToListAsync()));

        app.MapPost("/api/quests", async (QuestUpsertRequest req, ContextDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Description))
                return Results.BadRequest("Description is required.");

            var quest = new Quest { Description = req.Description.Trim(), ExpReward = req.ExpReward };
            db.Quests.Add(quest);
            await db.SaveChangesAsync();
            return Results.Ok(quest);
        });

        app.MapDelete("/api/quests/{id}", async (int id, ContextDbContext db) =>
        {
            var quest = await db.Quests.FindAsync(id);
            if (quest is null) return Results.NotFound();
            db.Quests.Remove(quest);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        app.MapPost("/api/quests/generate", async (QuestGenerateRequest req, IHttpClientFactory factory, ContextDbContext db, ConversationService conv) =>
        {
            if (string.IsNullOrEmpty(geminiKey))
                return Results.Problem("Gemini API key is not configured on the server.", statusCode: 500);

            var count         = Math.Clamp(req.Count, 1, 10);
            var generateShape = """[{"description": "...", "expReward": <50-150 as integer>}]""";

            // Build a conversation context block if the user has history
            var contextBlock = "";
            if (!string.IsNullOrWhiteSpace(req.UserId))
            {
                var history = await conv.GetHistoryAsync(req.UserId);
                if (history.Count > 0)
                {
                    var summary = string.Join("\n", history.TakeLast(10).Select(t => $"Q: {t.Question}\nA: {t.Answer}"));
                    contextBlock = $"""


                        The adventurer's recent exploration log (use this to inspire contextually relevant quests):
                        {summary}

                        Tailor the quests to fit what the adventurer has been seeing and asking about — if they've been near nature, lean into nature quests; if urban, lean into city quests; etc.
                        """;
                }
            }

            var prompt        = $"""
                Generate {count} original quest objectives for a fantasy adventurer who explores the real world through a camera app.
                Each quest must involve finding or encountering a specific real-world object, place, or scene — described with fantasy flavor.

                Good examples:
                - "Seek the Iron Sentinel — find a vehicle of steel and wheels"
                - "Discover the Alchemist's Den — locate a pharmacy or medical supplies"
                - "Find the Merchant's Square — spot a shop or market stall"
                - "Encounter a Guardian of Nature — find a tree taller than a building"
                - "Locate the Sacred Hearth — find a kitchen appliance or stove"
                - "Behold the Azure Expanse — gaze upon a body of water"
                - "Read the Ancient Runes — find a sign or printed text"

                Rules:
                - Each description must be under 90 characters
                - Mix quest types: objects, places, text/signs, natural things, living creatures
                - Make them achievable both indoors and outdoors
                - Use pure fantasy framing — no modern tech language{contextBlock}

                Return JSON only, no markdown fences: {generateShape}
                """;

            var body = new
            {
                contents         = new[] { new { role = "user", parts = new object[] { new { text = prompt } } } },
                generationConfig = new { temperature = 1.0, response_mime_type = "application/json" },
            };

            var client = factory.CreateClient();
            var res = await client.PostAsJsonAsync(geminiUrl, body);
            if (!res.IsSuccessStatusCode)
                return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

            var data = await res.Content.ReadFromJsonAsync<JsonElement>();
            var raw  = data.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString() ?? "";

            var created = new List<Quest>();
            try
            {
                var json = System.Text.RegularExpressions.Regex.Match(raw, @"\[[\s\S]*\]").Value;
                if (string.IsNullOrWhiteSpace(json)) json = raw.Trim();

                foreach (var item in JsonDocument.Parse(json).RootElement.EnumerateArray())
                {
                    if (!item.TryGetProperty("description", out var dp)) continue;
                    var desc = dp.GetString()?.Trim();
                    if (string.IsNullOrEmpty(desc)) continue;

                    var exp = item.TryGetProperty("expReward", out var ep) ? ep.GetInt32() : 100;
                    var quest = new Quest { Description = desc, ExpReward = Math.Clamp(exp, 25, 200) };
                    db.Quests.Add(quest);
                    created.Add(quest);
                }
            }
            catch { }

            if (created.Count > 0) await db.SaveChangesAsync();
            return Results.Ok(created);
        });

        app.MapPost("/api/quests/verify", async (QuestVerifyRequest req, IHttpClientFactory factory, UserService users, ContextDbContext db) =>
        {
            if (string.IsNullOrEmpty(geminiKey))
                return Results.Problem("Gemini API key is not configured on the server.", statusCode: 500);

            var quest = await db.Quests.FindAsync(req.QuestId);
            if (quest is null) return Results.NotFound();

            // Already done?
            var allQuests   = await users.GetUserQuestsAsync(req.UserId);
            var questStatus = allQuests.FirstOrDefault(q => q.QuestId == req.QuestId);
            if (questStatus?.IsFinished == true)
                return Results.Ok(new { verified = true, message = "This deed is already inscribed in the annals of your legend.", expReward = 0, leveled = false, newLevel = 0 });

            var characterBlock = string.IsNullOrWhiteSpace(characterPrompt) ? "" : $"\n\n{characterPrompt}";
            var verifyShape    = """{"verified": true, "message": "..."}""";
            var prompt = $"""
                You are a Dungeon Master and fantasy game arbiter judging whether an adventurer has completed a quest.{characterBlock}

                The quest: "{quest.Description}"

                The adventurer has presented their scrying-lens image as proof. Examine it carefully.

                TASK: Decide if the image clearly fulfills the quest's requirement.
                - Be generous but fair — if the image reasonably contains the required object, place, or scene, verify it.
                - Write your verdict as a Dungeon Master speaking directly to the player: dramatic, vivid, and in character.
                - Length: 3–4 sentences. Speak aloud-ready prose — no bullet points, no markdown, no parenthetical notes.
                - If VERIFIED: Open with a bold announcement of success. Describe specifically what you see in the image that proves the quest is done. Close with a proclamation of their glory and the reward awaiting them.
                - If NOT VERIFIED: Open with dramatic but encouraging disappointment. Describe what you actually see instead of what was required. Give a clear, evocative hint about what they must find to complete the quest.

                Return JSON only: {verifyShape}
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
                generationConfig = new { temperature = 0.5, response_mime_type = "application/json" },
            };

            var client = factory.CreateClient();
            var res    = await client.PostAsJsonAsync(geminiUrl, body);
            if (!res.IsSuccessStatusCode)
                return Results.Problem(await res.Content.ReadAsStringAsync(), statusCode: (int)res.StatusCode);

            var data = await res.Content.ReadFromJsonAsync<JsonElement>();
            var raw  = data.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString() ?? "";

            bool   verified  = false;
            string message   = "";
            try
            {
                var j   = JsonDocument.Parse(raw).RootElement;
                verified = j.TryGetProperty("verified", out var v) && v.GetBoolean();
                message  = j.TryGetProperty("message",  out var m) ? m.GetString() ?? "" : "";
            }
            catch { }

            int  expReward = 0;
            bool leveled   = false;
            int  newLevel  = 0;

            if (verified)
            {
                var (ok, lv, nl) = await users.CompleteQuestAsync(req.UserId, req.QuestId);
                if (ok) { expReward = quest.ExpReward; leveled = lv; newLevel = nl; }
            }

            return Results.Ok(new { verified, message, expReward, leveled, newLevel });
        });

        app.MapPost("/api/quests/check", async (QuestCheckRequest req, IHttpClientFactory factory, UserService users) =>
        {
            if (string.IsNullOrEmpty(geminiKey) || string.IsNullOrWhiteSpace(req.UserId))
                return Results.Ok(new { completed = Array.Empty<object>() });

            var allQuests    = await users.GetUserQuestsAsync(req.UserId);
            var activeQuests = allQuests.Where(q => !q.IsFinished).ToList();
            if (!activeQuests.Any())
                return Results.Ok(new { completed = Array.Empty<object>() });

            var sceneContext = req.VisionResults is not null
                ? ApiHelpers.FormatVision(req.VisionResults)
                : "(no vision data available)";
            var questList  = string.Join("\n", activeQuests.Select(q => $"- ID {q.QuestId}: {q.Description}"));
            var checkShape = """{"fulfilledQuestIds": [<integer quest IDs>]}""";

            var prompt = $"""
                You are a fantasy game system. The adventurer is looking at a scene through their camera.

                What the camera sees:
                {sceneContext}

                The adventurer's active quests:
                {questList}

                Determine which quests (if any) are clearly and directly fulfilled by what the camera currently sees.
                Be strict — only mark a quest fulfilled if the scene unambiguously contains what is needed.
                Return JSON only: {checkShape}
                """;

            var body = new
            {
                contents         = new[] { new { role = "user", parts = new object[] { new { text = prompt } } } },
                generationConfig = new { temperature = 0.1, response_mime_type = "application/json" },
            };

            var client = factory.CreateClient();
            var res = await client.PostAsJsonAsync(geminiUrl, body);
            if (!res.IsSuccessStatusCode)
                return Results.Ok(new { completed = Array.Empty<object>() });

            var data = await res.Content.ReadFromJsonAsync<JsonElement>();
            var raw  = data.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString() ?? "";

            List<int> fulfilledIds = [];
            try
            {
                var j = JsonDocument.Parse(raw).RootElement;
                if (j.TryGetProperty("fulfilledQuestIds", out var arr))
                    fulfilledIds = [.. arr.EnumerateArray().Select(e => e.GetInt32())];
            }
            catch { }

            var completed = new List<object>();
            foreach (var questId in fulfilledIds)
            {
                var (ok, leveled, newLevel) = await users.CompleteQuestAsync(req.UserId, questId);
                if (!ok) continue;
                var quest = activeQuests.First(q => q.QuestId == questId);
                completed.Add(new { questId, description = quest.Description, expReward = quest.ExpReward, leveled, newLevel });
            }

            return Results.Ok(new { completed });
        });
    }
}
