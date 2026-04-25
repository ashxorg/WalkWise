// state.js — tiny pub/sub store. No framework.
//
// API keys come from Vite env vars baked in at build time (VITE_*). The
// settings modal still exists for user-tunable preferences (FPS, voice ID
// override, speak-on-tap), and those preferences persist in localStorage.

// Build-time keys (inlined by Vite from .env / Vercel env vars).
export const ENV_KEYS = {
  visionKey:     (import.meta.env.VITE_GOOGLE_VISION_API_KEY || '').trim(),
  geminiKey:     (import.meta.env.VITE_GEMINI_API_KEY || '').trim(),
  elevenKey:     (import.meta.env.VITE_ELEVENLABS_API_KEY || '').trim(),
  elevenVoiceId: (import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL').trim(),
};

export const KEYS_FROM_ENV =
  Boolean(ENV_KEYS.visionKey && ENV_KEYS.geminiKey && ENV_KEYS.elevenKey);

const listeners = new Set();
let state = {
  running: false,
  loading: false,
  loadingMessage: '',
  recording: false,
  speaking: false,
  thinking: false,
  objects: [],
  detail: null,
  toast: null,
  gameActive: false,
  targetColor: null,
  guardianCooldown: 0,
  settings: loadSettings(),
};

const KEY = 'walkwise.settings.v2';

function loadSettings() {
  let stored = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {}
  return mergeWithEnv({ ...defaults(), ...stored });
}

function mergeWithEnv(s) {
  const out = { ...s };
  if (ENV_KEYS.visionKey) out.visionKey = ENV_KEYS.visionKey;
  if (ENV_KEYS.geminiKey) out.geminiKey = ENV_KEYS.geminiKey;
  if (ENV_KEYS.elevenKey) out.elevenKey = ENV_KEYS.elevenKey;
  if (!out.elevenVoiceId) out.elevenVoiceId = ENV_KEYS.elevenVoiceId;
  return out;
}

function defaults() {
  return {
    geminiKey: '',
    visionKey: '',
    elevenKey: '',
    elevenVoiceId: ENV_KEYS.elevenVoiceId,
    detectionFps: 3,
    speakOnTap: true,
  };
}

function persistSettings(s) {
  // Don't persist env-provided keys to localStorage — they live in the bundle.
  const toStore = { ...s };
  if (ENV_KEYS.visionKey) toStore.visionKey = '';
  if (ENV_KEYS.geminiKey) toStore.geminiKey = '';
  if (ENV_KEYS.elevenKey) toStore.elevenKey = '';
  try { localStorage.setItem(KEY, JSON.stringify(toStore)); } catch {}
}

export function getState() { return state; }

export function setState(patch) {
  const next = typeof patch === 'function' ? patch(state) : { ...state, ...patch };
  if (next.settings && next.settings !== state.settings) {
    persistSettings(next.settings);
  }
  state = next;
  for (const l of listeners) l(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function showToast(kind, message, ttl = 3500) {
  setState({ toast: { kind, message } });
  if (ttl > 0) {
    setTimeout(() => {
      const cur = getState().toast;
      if (cur && cur.message === message) setState({ toast: null });
    }, ttl);
  }
}

export function hasAllKeys(s = state.settings) {
  return Boolean(s.geminiKey && s.visionKey && s.elevenKey);
}
