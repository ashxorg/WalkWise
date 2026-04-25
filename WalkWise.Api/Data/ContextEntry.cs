using System.ComponentModel.DataAnnotations;

/// <summary>
/// Dual-purpose table: QR-code context entries AND user profiles.
/// QR entries have null Username. User entries are identified by a UUID Key
/// and carry Username, Level, and Exp.
/// </summary>
public class ContextEntry
{
    [Key]
    [MaxLength(512)]
    public string Key { get; set; } = "";

    public string JsonData { get; set; } = "{}";

    // User profile fields — null for non-user QR entries
    [MaxLength(64)]
    public string? Username { get; set; }
    public int Level { get; set; } = 1;
    public int Exp   { get; set; } = 0;

    public DateTime UpdatedAt { get; set; }
}
