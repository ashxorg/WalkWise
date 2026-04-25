using System.ComponentModel.DataAnnotations;

public class SpeechCacheEntry
{
    public int Id { get; set; }

    /// <summary>SHA-256 hex of "{voiceId}:{text}" — used as the fast lookup key.</summary>
    [MaxLength(64)]
    public string CacheKey { get; set; } = "";

    [MaxLength(128)]
    public string VoiceId { get; set; } = "";

    public string Text { get; set; } = "";

    /// <summary>Raw MP3 bytes returned by ElevenLabs.</summary>
    public byte[] AudioData { get; set; } = [];

    public DateTime CreatedAt { get; set; }
}
