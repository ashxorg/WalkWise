namespace WalkWise.Api.Models;

record AuthRequest(string Username);
record QuestUpsertRequest(string Description, int ExpReward);
record QuestGenerateRequest(int Count = 5, string? UserId = null);
record QuestCheckRequest(string UserId, VisionResultDto? VisionResults);
record QuestVerifyRequest(string UserId, int QuestId, string ImageBase64);
record GeminiSceneRequest(string ImageBase64, VisionResultDto? VisionResults);
record VisionRequest(string ImageBase64);
record ContextUpsertRequest(string Key, string? JsonData);

record GeminiAskRequest(
    string          AudioBase64,
    string          AudioMime,
    string          ImageBase64,
    string[]?       DetectedLabels,
    VisionResultDto? VisionResults,
    string?         UserId);

record GeminiDescribeRequest(
    string          Label,
    string          ImageBase64,
    VisionResultDto? VisionResults);

record SpeakRequest(string Text, string? VoiceId);

record VisionResultDto(LabelDto[]? Labels, ObjectDto[]? Objects, string? Text);
record LabelDto(string Description, double Score);
record ObjectDto(string Name, double Score);
