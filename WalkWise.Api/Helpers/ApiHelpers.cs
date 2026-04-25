using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using WalkWise.Api.Models;

namespace WalkWise.Api.Helpers;

static class ApiHelpers
{
    public static string ComputeCacheKey(string voiceId, string text)
    {
        var input = Encoding.UTF8.GetBytes($"{voiceId}:{text}");
        var hash  = SHA256.HashData(input);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public static string FormatVision(VisionResultDto v)
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

    public static (string question, string answer) ParseGeminiJson(string raw)
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

    public static object MapUser(ContextEntry u) => new
    {
        id             = u.Key,
        username       = u.Username,
        level          = u.Level,
        exp            = u.Exp,
        expToNextLevel = u.Level * 100,
    };
}
