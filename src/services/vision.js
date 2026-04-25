// vision.js — Google Cloud Vision REST.
// Single annotate call returns labels + localized objects + OCR text in one round-trip.

const ENDPOINT = (key) =>
  `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`;

/**
 * @param {{apiKey:string, imageBase64:string}} args  imageBase64 must NOT include the data URL prefix
 * @returns {Promise<{labels:Array<{description,score}>, objects:Array<{name,score}>, text:string}>}
 */
export async function analyzeImage({ apiKey, imageBase64 }) {
  if (!apiKey) throw new Error('Missing Google Vision API key');
  const body = {
    requests: [{
      image: { content: imageBase64 },
      features: [
        { type: 'LABEL_DETECTION',          maxResults: 10 },
        { type: 'OBJECT_LOCALIZATION',      maxResults: 10 },
        { type: 'TEXT_DETECTION',           maxResults: 1  },
      ],
    }],
  };

  const res = await fetch(ENDPOINT(apiKey), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vision ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const r = data?.responses?.[0] ?? {};

  const labels = (r.labelAnnotations ?? []).map((l) => ({
    description: l.description,
    score: l.score ?? 0,
  }));
  const objects = (r.localizedObjectAnnotations ?? []).map((o) => ({
    name: o.name,
    score: o.score ?? 0,
  }));
  const text = (r.fullTextAnnotation?.text || r.textAnnotations?.[0]?.description || '').trim();

  return { labels, objects, text };
}
