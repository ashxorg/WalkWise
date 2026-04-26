using System.Text.Json;

/// <summary>
/// Loads object metadata from object-properties.json at startup and
/// exposes a fast dictionary lookup by label name.
/// </summary>
public class ObjectPropertyService
{
    private readonly Dictionary<string, Dictionary<string, string>> _props;

    public ObjectPropertyService(IWebHostEnvironment env)
    {
        var path = Path.Combine(env.ContentRootPath, "object-properties.json");
        if (!File.Exists(path)) { _props = []; return; }

        try
        {
            var json = File.ReadAllText(path);
            _props = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, string>>>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            ) ?? [];
        }
        catch { _props = []; }
    }

    /// <summary>
    /// Returns the property dictionary for a label, or an empty dictionary if unknown.
    /// Lookup is case-insensitive and trims whitespace.
    /// </summary>
    public Dictionary<string, string> GetProperties(string label)
    {
        var key = label.ToLowerInvariant().Trim();
        return _props.TryGetValue(key, out var props) ? props : [];
    }
}
