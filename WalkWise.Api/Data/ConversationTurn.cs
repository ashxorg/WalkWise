using System.ComponentModel.DataAnnotations;

public class ConversationTurn
{
    public int Id { get; set; }

    [MaxLength(512)]
    public string UserId { get; set; } = "";

    public string Question { get; set; } = "";
    public string Answer   { get; set; } = "";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
