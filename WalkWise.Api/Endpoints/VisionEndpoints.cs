using System.Text.Json;
using WalkWise.Api.Models;

namespace WalkWise.Api.Endpoints;

static class VisionEndpoints
{
    public static void MapVisionEndpoints(this WebApplication app)
    {
        var visionKey = app.Configuration["ApiKeys:GoogleVision"] ?? "";

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
    }
}
