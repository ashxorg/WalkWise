using WalkWise.Api.Helpers;
using WalkWise.Api.Models;

namespace WalkWise.Api.Endpoints;

static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/api/auth/signup", async (AuthRequest req, UserService users) =>
        {
            if (string.IsNullOrWhiteSpace(req.Username))
                return Results.BadRequest("Username is required.");

            var user = await users.CreateUserAsync(req.Username.Trim());
            if (user is null)
                return Results.Conflict(new { error = "Username already taken." });

            return Results.Ok(ApiHelpers.MapUser(user));
        });

        app.MapPost("/api/auth/login", async (AuthRequest req, UserService users) =>
        {
            if (string.IsNullOrWhiteSpace(req.Username))
                return Results.BadRequest("Username is required.");

            var user = await users.FindByUsernameAsync(req.Username.Trim());
            return user is not null ? Results.Ok(ApiHelpers.MapUser(user)) : Results.NotFound(new { error = "User not found." });
        });
    }
}
