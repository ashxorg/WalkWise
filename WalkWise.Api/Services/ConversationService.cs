using Microsoft.EntityFrameworkCore;

/// <summary>
/// Manages per-user conversation history so Gemini calls maintain context across turns.
/// Keeps only the most recent MaxTurns entries per user.
/// </summary>
public class ConversationService(ContextDbContext db)
{
    private const int MaxTurns = 20;

    /// <summary>Returns the last MaxTurns turns for a user, oldest-first.</summary>
    public Task<List<ConversationTurn>> GetHistoryAsync(string userId) =>
        db.ConversationTurns
          .Where(t => t.UserId == userId)
          .OrderByDescending(t => t.CreatedAt)
          .Take(MaxTurns)
          .OrderBy(t => t.CreatedAt)
          .ToListAsync();

    /// <summary>Persists a completed Q&A exchange.</summary>
    public async Task AddTurnAsync(string userId, string question, string answer)
    {
        db.ConversationTurns.Add(new ConversationTurn
        {
            UserId    = userId,
            Question  = question,
            Answer    = answer,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    /// <summary>Deletes all conversation history for a user (begin new adventure).</summary>
    public async Task ClearAsync(string userId)
    {
        var turns = db.ConversationTurns.Where(t => t.UserId == userId);
        db.ConversationTurns.RemoveRange(turns);
        await db.SaveChangesAsync();
    }
}
