using Microsoft.EntityFrameworkCore;

/// <summary>
/// Thin service layer over ContextDbContext.
/// Keeps context-store logic out of endpoint handlers.
/// </summary>
public class ContextService(ContextDbContext db)
{
    /// <summary>Look up a context entry by QR key. Returns null if not found.</summary>
    public Task<ContextEntry?> FindAsync(string key) =>
        db.ContextEntries.FindAsync(key).AsTask();

    /// <summary>Insert or update a context entry.</summary>
    public async Task UpsertAsync(string key, string jsonData)
    {
        var entry = await db.ContextEntries.FindAsync(key);
        if (entry is null)
        {
            db.ContextEntries.Add(new ContextEntry { Key = key, JsonData = jsonData, UpdatedAt = DateTime.UtcNow });
        }
        else
        {
            entry.JsonData   = jsonData;
            entry.UpdatedAt  = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    /// <summary>Delete a context entry. No-op if the key does not exist.</summary>
    public async Task DeleteAsync(string key)
    {
        var entry = await db.ContextEntries.FindAsync(key);
        if (entry is not null)
        {
            db.ContextEntries.Remove(entry);
            await db.SaveChangesAsync();
        }
    }

    public Task<List<ContextEntry>> ListAllAsync() =>
        db.ContextEntries.OrderBy(e => e.Key).ToListAsync();

    /// <summary>
    /// Scan an image for a QR code, then return the matching context entry's JSON data
    /// as a formatted prompt block — or an empty string if nothing is found.
    /// </summary>
    public async Task<string> GetPromptBlockAsync(string? imageBase64, QrScanService qrScanner)
    {
        var key = qrScanner.ScanBase64Image(imageBase64);
        if (key is null) return "";

        var entry = await FindAsync(key);
        if (entry is null) return "";

        return $"\n\nQR Code context (key: \"{key}\"):\n{entry.JsonData}\nUse this information to enrich your response. Do not mention or reference the QR code itself — treat this data as background knowledge.";
    }
}
