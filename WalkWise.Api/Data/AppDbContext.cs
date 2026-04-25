using Microsoft.EntityFrameworkCore;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<SpeechCacheEntry> SpeechCache => Set<SpeechCacheEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SpeechCacheEntry>()
            .HasIndex(e => e.CacheKey)
            .IsUnique();
    }
}
