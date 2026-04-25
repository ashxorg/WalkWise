using System.ComponentModel.DataAnnotations;

public class Quest
{
    public int QuestId { get; set; }

    [MaxLength(512)]
    public string Description { get; set; } = "";

    public int ExpReward { get; set; }
}
