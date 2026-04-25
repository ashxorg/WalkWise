// state.js — tiny pub/sub store. No framework.
// API keys are now managed by the ASP.NET server (WalkWise.Api).
// Settings stored here are user preferences only (FPS, voice ID, speak-on-tap).

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
  currentUser: loadCurrentUser(),
  settings: loadSettings(),
};

const KEY      = 'walkwise.settings.v3';
const USER_KEY = 'walkwise.user.v1';

function loadSettings() {
  let stored = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {}
  return { ...defaults(), ...stored };
}

function defaults() {
  return {
    elevenVoiceId: 'EXAVITQu4vr4xnSDxMaL',
    detectionFps: 3,
    speakOnTap: true,
  };
}

function loadCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function persistSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function setCurrentUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {}
  setState({ currentUser: user });
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
