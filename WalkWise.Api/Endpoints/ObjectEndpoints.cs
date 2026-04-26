namespace WalkWise.Api.Endpoints;

static class ObjectEndpoints
{
    public static void MapObjectEndpoints(this WebApplication app)
    {
        app.MapGet("/api/objects/{label}/properties", (string label, ObjectPropertyService svc) =>
            Results.Ok(svc.GetProperties(label)));
    }
}
