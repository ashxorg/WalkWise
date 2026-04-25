public class UserQuest
{
    public string UserId  { get; set; } = "";
    public int    QuestId { get; set; }

    public bool      IsFinished { get; set; }
    public DateTime? FinishedAt { get; set; }

    public ContextEntry? User  { get; set; }
    public Quest?        Quest { get; set; }
}
