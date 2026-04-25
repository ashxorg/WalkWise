using WalkWise.Api.Helpers;

namespace WalkWise.Api.Endpoints;

static class UserEndpoints
{
    public static void MapUserEndpoints(this WebApplication app)
    {
        app.MapGet("/api/users/{id}", async (string id, UserService users) =>
        {
            var user = await users.FindByKeyAsync(id);
            return user?.Username is not null ? Results.Ok(ApiHelpers.MapUser(user)) : Results.NotFound();
        });

        app.MapGet("/api/users/{id}/quests", async (string id, UserService users) =>
            Results.Ok(await users.GetUserQuestsAsync(id)));

        app.MapPost("/api/users/{id}/quests/{questId}/complete", async (string id, int questId, UserService users) =>
        {
            var (ok, leveled, newLevel) = await users.CompleteQuestAsync(id, questId);
            if (!ok) return Results.BadRequest(new { error = "Quest not found, already completed, or invalid." });
            return Results.Ok(new { leveled, newLevel });
        });
    }
}
