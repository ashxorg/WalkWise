// gemini.js — proxies to the ASP.NET /api/gemini/* endpoints.
// The server holds the Gemini API key and constructs the prompts.

/**
 * Send an audio question + camera snapshot + current detections to the server.
 * Returns { question, answer }.
 */
export async function answerSpokenQuestion({
  audioBase64,
  audioMime,
  imageBase64,
  detectedLabels = [],
  visionResults = null,
}) {
  const res = await fetch('/api/gemini/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ audioBase64, audioMime, imageBase64, detectedLabels, visionResults }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  return res.json(); // { question, answer }
}

/**
 * Generate a short conversational description of a tapped object.
 * Returns a plain string.
 */
export async function describeObject({ label, imageBase64, visionResults = null }) {
  const res = await fetch('/api/gemini/describe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ label, imageBase64, visionResults }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const { text } = await res.json();
  return text;
}
