using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WalkWise.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.PropertyNameCaseInsensitive = true;
});

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("SpeechCache") ?? "Data Source=speech-cache.db"));

builder.Services.AddDbContext<ContextDbContext>(opt =>
    opt.UseSqlite(builder.Configuration.GetConnectionString("ContextStore") ?? "Data Source=context-store.db"));

builder.Services.AddSingleton<QrScanService>();
builder.Services.AddSingleton<ObjectPropertyService>();
builder.Services.AddScoped<ContextService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<ConversationService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
    scope.ServiceProvider.GetRequiredService<ContextDbContext>().Database.EnsureCreated();
}

app.UseCors();

app.MapVisionEndpoints();
app.MapGeminiEndpoints();
app.MapSpeakEndpoints();
app.MapContextEndpoints();
app.MapAuthEndpoints();
app.MapUserEndpoints();
app.MapQuestEndpoints();
app.MapObjectEndpoints();

app.Run();
