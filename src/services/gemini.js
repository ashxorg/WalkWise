// gemini.js — Google Gemini REST client.
// Used for two flows:
//   1. answerSpokenQuestion(audio + image + detections) → spoken question becomes a text answer
//   2. describeObject({label, image, visionResults}) → conversational paragraph about a tapped object

const ENDPOINT = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Send an audio question + camera snapshot + current detections to Gemini.
 * Returns { question, answer } — Gemini transcribes the audio AND replies in one call.
 */
export async function answerSpokenQuestion({
  apiKey,
  audioBase64,
  audioMime,
  imageBase64,    // base64 (no data URL prefix)
  imageMime = 'image/jpeg',
  detectedLabels = [],
  visionResults = null,
  model = DEFAULT_MODEL,
}) {
  if (!apiKey) throw new Error('Missing Gemini API key');

  const detectionList = detectedLabels.length
    ? detectedLabels.map((l) => `- ${l}`).join('\n')
    : '(none)';
  const visionBlurb = visionResults
    ? `\n\nGoogle Vision results for this frame:\n${formatVision(visionResults)}`
    : '';

  const systemText = `You are WalkWise, a calm and concise visual companion that helps a user understand what's around them.
The user just asked a question by voice. The audio is attached. You also have:
- A snapshot of what the user is looking at right now.
- The list of objects YOLO has currently detected in that snapshot.${visionBlurb ? '\n- Additional Google Vision analysis of the same frame.' : ''}

Currently detected objects:
${detectionList}${visionBlurb}

Transcribe the question, then answer it grounded in the image. Keep your answer to 1–3 short sentences, friendly and conversational, no markdown, no lists. Don't preface with "You asked…" — just answer naturally.

Respond as JSON only, with this exact shape:
{"question":"<verbatim transcription>","answer":"<spoken reply>"}`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: systemText },
        { inline_data: { mime_type: imageMime, data: imageBase64 } },
        { inline_data: { mime_type: audioMime, data: audioBase64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.4,
      response_mime_type: 'application/json',
    },
  };

  const res = await fetch(ENDPOINT(model, apiKey), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = safeJson(text) ?? {};
  return {
    question: (parsed.question || '').trim(),
    answer: (parsed.answer || text || '').trim(),
  };
}

/**
 * Generate a short conversational description of a tapped object,
 * grounded in the cropped snapshot + Google Vision results.
 */
export async function describeObject({
  apiKey,
  label,
  imageBase64,
  imageMime = 'image/jpeg',
  visionResults = null,
  model = DEFAULT_MODEL,
}) {
  if (!apiKey) throw new Error('Missing Gemini API key');

  const visionBlurb = visionResults ? `\n\nGoogle Vision analysis:\n${formatVision(visionResults)}` : '';
  const prompt = `You are WalkWise, a calm visual companion. The user tapped on an object detected as "${label}".${visionBlurb}

Look at the cropped image and write 2–4 short sentences describing what you see in plain language: what it is, any notable details (color, brand, text, condition), and one piece of useful or interesting context. No lists, no markdown, no headings. Speak directly to the user.`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inline_data: { mime_type: imageMime, data: imageBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.5 },
  };

  const res = await fetch(ENDPOINT(model, apiKey), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.trim();
}

function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch {}
  // Try to pull a JSON object out of a possibly-fenced block
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

function formatVision(v) {
  const parts = [];
  if (v.labels?.length)  parts.push(`Labels: ${v.labels.slice(0, 8).map(l => `${l.description} (${Math.round(l.score*100)}%)`).join(', ')}`);
  if (v.objects?.length) parts.push(`Objects: ${v.objects.slice(0, 8).map(o => `${o.name} (${Math.round(o.score*100)}%)`).join(', ')}`);
  if (v.text)            parts.push(`Detected text: "${v.text.slice(0, 200)}"`);
  return parts.join('\n');
}
