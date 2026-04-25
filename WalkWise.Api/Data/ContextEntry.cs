using System.ComponentModel.DataAnnotations;

/// <summary>
/// Key/value store for QR-code-addressable context data.
/// The Key is the raw text decoded from a QR code.
/// JsonData is an arbitrary JSON string you supply — it is injected into Gemini prompts
/// when the matching QR code is found in an image.
/// </summary>
public class ContextEntry
{
    [Key]
    [MaxLength(512)]
    public string Key { get; set; } = "";

    public string JsonData { get; set; } = "{}";

    public DateTime UpdatedAt { get; set; }
}
