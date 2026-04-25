// elevenlabs.js — proxies to the ASP.NET /api/speak endpoint.
// The server holds the ElevenLabs API key.

export const ELEVENLABS_DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // "Sarah"

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
 * Speak the given text via the server proxy.
 * Returns a Promise that resolves when playback ends.
 */
export async function speak({ text, voiceId = ELEVENLABS_DEFAULT_VOICE_ID }) {
  if (!text) return;

  stopSpeaking();

  const res = await fetch('/api/speak', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, voiceId }),
  });
  if (!res.ok) throw new Error(`Speak ${res.status}: ${await res.text()}`);

  const blob   = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const audio  = new Audio(objUrl);
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
