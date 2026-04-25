using Microsoft.EntityFrameworkCore;

public class UserService(ContextDbContext db)
{
    // Each level costs (level * 100) exp to reach the next
    private const int ExpPerLevelMultiplier = 100;

    public Task<ContextEntry?> FindByKeyAsync(string key) =>
        db.ContextEntries.FindAsync(key).AsTask();

    public Task<ContextEntry?> FindByUsernameAsync(string username) =>
        db.ContextEntries.FirstOrDefaultAsync(e => e.Username == username);

    public async Task<ContextEntry?> CreateUserAsync(string username)
    {
        if (await FindByUsernameAsync(username) is not null) return null; // taken

        var user = new ContextEntry
        {
            Key       = Guid.NewGuid().ToString(),
            Username  = username,
            Level     = 1,
            Exp       = 0,
            JsonData  = "{}",
            UpdatedAt = DateTime.UtcNow,
        };
        db.ContextEntries.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    public async Task<List<UserQuestDto>> GetUserQuestsAsync(string userId)
    {
        // Return ALL quests; completions for this user determine finished status.
        var allQuests = await db.Quests.OrderBy(q => q.QuestId).ToListAsync();
        var completions = await db.UserQuests
            .Where(uq => uq.UserId == userId && uq.IsFinished)
            .ToDictionaryAsync(uq => uq.QuestId, uq => uq.FinishedAt);

        return allQuests.Select(q => new UserQuestDto(
            q.QuestId,
            q.Description,
            q.ExpReward,
            completions.ContainsKey(q.QuestId),
            completions.GetValueOrDefault(q.QuestId)
        )).ToList();
    }

    public async Task<(bool ok, bool leveled, int newLevel)> CompleteQuestAsync(string userId, int questId)
    {
        var quest = await db.Quests.FindAsync(questId);
        if (quest is null) return (false, false, 0);

        var uq = await db.UserQuests.FindAsync(userId, questId);
        if (uq?.IsFinished == true) return (false, false, 0); // already done

        if (uq is null)
            db.UserQuests.Add(new UserQuest { UserId = userId, QuestId = questId, IsFinished = true, FinishedAt = DateTime.UtcNow });
        else
        {
            uq.IsFinished = true;
            uq.FinishedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();

        var (leveled, newLevel) = await AddExpAsync(userId, quest.ExpReward);
        return (true, leveled, newLevel);
    }

    private async Task<(bool leveled, int newLevel)> AddExpAsync(string userId, int exp)
    {
        var user = await FindByKeyAsync(userId);
        if (user is null) return (false, 0);

        user.Exp += exp;
        var leveled = false;
        while (user.Exp >= user.Level * ExpPerLevelMultiplier)
        {
            user.Exp  -= user.Level * ExpPerLevelMultiplier;
            user.Level += 1;
            leveled     = true;
        }
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return (leveled, user.Level);
    }
}

public record UserQuestDto(int QuestId, string Description, int ExpReward, bool IsFinished, DateTime? FinishedAt);
