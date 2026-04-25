// elevenlabs.js — text-to-speech via ElevenLabs REST API.
// Returns an Audio element that's already playing.

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // "Sarah" — clear, neutral, default ElevenLabs voice
const DEFAULT_MODEL = 'eleven_turbo_v2_5';

let _currentAudio = null;

/** Cancel any currently playing TTS */
export function stopSpeaking() {
  if (_currentAudio) {
    try { _currentAudio.pause(); } catch {}
    try { URL.revokeObjectURL(_currentAudio.src); } catch {}
    _currentAudio = null;
  }
}

/**
 * Speak the given text. Returns a Promise that resolves when playback ends
 * (or rejects on network/decode error).
 */
export async function speak({
  apiKey,
  text,
  voiceId = DEFAULT_VOICE_ID,
  modelId = DEFAULT_MODEL,
}) {
  if (!apiKey) throw new Error('Missing ElevenLabs API key');
  if (!text) return;

  // Stop anything currently playing first
  stopSpeaking();

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?optimize_streaming_latency=2&output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json',
      'accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);

  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const audio = new Audio(objUrl);
  audio.preload = 'auto';
  _currentAudio = audio;

  await new Promise((resolve, reject) => {
    audio.addEventListener('ended', () => {
      try { URL.revokeObjectURL(objUrl); } catch {}
      if (_currentAudio === audio) _currentAudio = null;
      resolve();
    }, { once: true });
    audio.addEventListener('error', (e) => {
      try { URL.revokeObjectURL(objUrl); } catch {}
      if (_currentAudio === audio) _currentAudio = null;
      reject(e);
    }, { once: true });
    audio.play().catch(reject);
  });
}

export const ELEVENLABS_DEFAULT_VOICE_ID = DEFAULT_VOICE_ID;
