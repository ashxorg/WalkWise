using WalkWise.Api.Models;

namespace WalkWise.Api.Endpoints;

static class ContextEndpoints
{
    public static void MapContextEndpoints(this WebApplication app)
    {
        app.MapGet("/api/context", async (ContextService ctx) =>
            Results.Ok(await ctx.ListAllAsync()));

        app.MapGet("/api/context/{key}", async (string key, ContextService ctx) =>
        {
            var entry = await ctx.FindAsync(Uri.UnescapeDataString(key));
            return entry is not null ? Results.Ok(entry) : Results.NotFound();
        });

        app.MapPost("/api/context", async (ContextUpsertRequest req, ContextService ctx) =>
        {
            if (string.IsNullOrWhiteSpace(req.Key))
                return Results.BadRequest("Key is required.");
            await ctx.UpsertAsync(req.Key.Trim(), req.JsonData ?? "{}");
            return Results.Ok(new { req.Key });
        });

        app.MapDelete("/api/context/{key}", async (string key, ContextService ctx) =>
        {
            await ctx.DeleteAsync(Uri.UnescapeDataString(key));
            return Results.NoContent();
        });
    }
}
