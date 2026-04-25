using Microsoft.EntityFrameworkCore;

/// <summary>
/// Separate DbContext for the QR context store so it can live in its own SQLite file
/// and be swapped/extended independently of the speech cache.
/// </summary>
public class ContextDbContext(DbContextOptions<ContextDbContext> options) : DbContext(options)
{
    public DbSet<ContextEntry> ContextEntries => Set<ContextEntry>();
}
