// vision.js — proxies to the ASP.NET /api/vision endpoint.
// The server holds the Google Vision API key.

/**
 * @param {{imageBase64: string}} args  imageBase64 must NOT include the data URL prefix
 * @returns {Promise<{labels:Array<{description,score}>, objects:Array<{name,score}>, text:string}>}
 */
export async function analyzeImage({ imageBase64 }) {
  const res = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageBase64 }),
  });
  if (!res.ok) throw new Error(`Vision ${res.status}: ${await res.text()}`);
  return res.json();
}
