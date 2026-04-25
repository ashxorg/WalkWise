using Microsoft.EntityFrameworkCore;

/// <summary>
/// Hosts the QR context store, user profiles, quests, and user-quest mappings.
/// </summary>
public class ContextDbContext(DbContextOptions<ContextDbContext> options) : DbContext(options)
{
    public DbSet<ContextEntry>    ContextEntries    => Set<ContextEntry>();
    public DbSet<Quest>           Quests            => Set<Quest>();
    public DbSet<UserQuest>       UserQuests        => Set<UserQuest>();
    public DbSet<ConversationTurn> ConversationTurns => Set<ConversationTurn>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserQuest>()
            .HasKey(uq => new { uq.UserId, uq.QuestId });

        modelBuilder.Entity<ContextEntry>()
            .HasIndex(e => e.Username)
            .IsUnique()
            .HasFilter("\"Username\" IS NOT NULL");

        modelBuilder.Entity<ConversationTurn>()
            .HasIndex(t => new { t.UserId, t.CreatedAt });
    }
}
