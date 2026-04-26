// elevenlabs.js — proxies to the ASP.NET /api/speak endpoint.
// The server holds the ElevenLabs API key.
//
// Audio is played via Web Audio API (AudioContext) so that unlocking the context
// once during a user gesture is enough — subsequent speak() calls work on mobile
// even after a long async chain (transcribe → vision → LLM → speak).

export const ELEVENLABS_DEFAULT_VOICE_ID = 'flHkNRp1BlvT73UL6gyz';

let _ctx    = null;   // shared AudioContext
let _source = null;   // currently playing AudioBufferSourceNode

function getCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    _ctx = new AC();
  }
  return _ctx;
}

/**
 * Call synchronously from ANY user-gesture handler to unlock audio on iOS/Android.
 * Must run before the first await so the browser still trusts the gesture.
 */
export function unlockAudio() {
  const ctx = getCtx();
  if (ctx.state === 'running') return;
  // Play a 1-frame silent buffer — satisfies iOS gesture requirement
  const buf    = ctx.createBuffer(1, 1, 22050);
  const silent = ctx.createBufferSource();
  silent.buffer = buf;
  silent.connect(ctx.destination);
  silent.start(0);
  ctx.resume().catch(() => {});
}

/** Cancel any currently playing TTS */
export function stopSpeaking() {
  if (_source) {
    try { _source.stop(); } catch {}
    _source = null;
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

  const arrayBuffer = await res.arrayBuffer();
  const ctx         = getCtx();

  // Resume in case the context was suspended (e.g. tab backgrounded)
  if (ctx.state !== 'running') await ctx.resume();

  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  return new Promise((resolve, reject) => {
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    _source = source;
    source.onended = () => {
      if (_source === source) _source = null;
      resolve();
    };
    source.onerror = (e) => {
      if (_source === source) _source = null;
      reject(e);
    };
    source.start(0);
  });
}
