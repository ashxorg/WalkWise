// main.js — WalkWise bootstrap.
// Builds the DOM, creates engines, wires up UI modules and flows.
// Business logic lives in src/flows/*; DOM updates live in src/ui/hud.js.

import './styles.css';
import { Camera }        from './core/camera.js';
import { Yolo }          from './core/yolo.js';
import { ObjectTracker } from './core/tracker.js';
import { AudioRecorder } from './core/audio.js';
import { Overlay }       from './ui/overlay.js';
import { mountHud }      from './ui/hud.js';
import { mountBottomBar }    from './ui/bottomBar.js';
import { mountDetailPanel }  from './ui/detailPanel.js';
import { mountSettings }     from './ui/settingsModal.js';
import { mountGameButton }   from './ui/gameButton.js';
import { mountAuthModal, showAuthModal }   from './ui/authModal.js';
import { mountProfilePanel, mountProfileButton, openProfile } from './ui/profilePanel.js';
import { mountQuestVerifyModal } from './ui/questVerifyModal.js';
import { createDetectionFlow } from './flows/detection.js';
import { createMicFlow }       from './flows/micFlow.js';
import { createTapFlow }       from './flows/tapFlow.js';
import { createDescribeFlow }  from './flows/describeFlow.js';
import { getState, setState, showToast } from './state.js';
import { stopSpeaking } from './services/elevenlabs.js';
import { friendlyError } from './utils.js';

/* ── DOM ──────────────────────────────────────────────────────────────────── */
const app = document.getElementById('app');
app.innerHTML = `
  <div class="stage">
    <video class="video" playsinline muted autoplay></video>
    <canvas class="overlay"></canvas>

    <header class="status-bar">
      <div class="brand">
        <span class="brand-dot"></span>
        <span class="brand-name">WalkWise</span>
        <span class="brand-sep"></span>
        <span class="brand-state" data-state>standby</span>
      </div>
      <div class="brand-meta">
        <span class="meta" data-meta-objects>0 objects</span>
        <span class="meta dim" data-meta-ep>—</span>
      </div>
    </header>

    <div class="hero" data-hero>
      <div class="hero-inner">
        <div class="hero-mark">
          <svg viewBox="0 0 80 80" width="64" height="64" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(139,206,81,0.25)" stroke-width="1"/>
            <circle cx="40" cy="40" r="22" fill="none" stroke="rgba(139,206,81,0.5)" stroke-width="1"/>
            <path d="M40 22 L46 40 L40 58 L34 40 Z" fill="#8BCE51"/>
          </svg>
        </div>
        <h1 class="hero-title">See what's around you</h1>
        <p class="hero-sub">Tap <span class="kbd">Start</span> to begin live detection. Tap <span class="kbd">Ask</span> any time to talk to your visual companion.</p>
        <div class="hero-foot">YOLO &middot; Vision &middot; Gemini &middot; ElevenLabs</div>
      </div>
    </div>

    <div class="toast" data-toast aria-live="polite"></div>
  </div>
`;

const stage    = app.querySelector('.stage');
const videoEl  = app.querySelector('.video');
const canvasEl = app.querySelector('.overlay');
const heroEl   = app.querySelector('[data-hero]');
const stateEl  = app.querySelector('[data-state]');
const objCount = app.querySelector('[data-meta-objects]');
const epLabel  = app.querySelector('[data-meta-ep]');
const toastEl  = app.querySelector('[data-toast]');

/* ── Engines ──────────────────────────────────────────────────────────────── */
const camera   = new Camera(videoEl);
const yolo     = new Yolo();
const tracker  = new ObjectTracker({ smoothFactor: 0.35 });
const recorder = new AudioRecorder();

// Overlay is created first; the tap handler is assigned below after createTapFlow.
const overlay = new Overlay(canvasEl, videoEl, obj => handleTap(obj));

/* ── Flows ────────────────────────────────────────────────────────────────── */
const detection    = createDetectionFlow({ videoEl, yolo, tracker });
const micFlow      = createMicFlow(recorder, camera);
const handleTap    = createTapFlow(overlay, camera);
const describeScene = createDescribeFlow(camera);

/* ── UI modules ───────────────────────────────────────────────────────────── */
mountHud({ stateEl, objCount, toastEl, heroEl, overlay });
mountSettings(stage);
mountGameButton(stage);
mountDetailPanel(stage);
mountAuthModal(stage);
mountProfilePanel(stage);
mountQuestVerifyModal(stage, camera);
mountProfileButton(stage, () => openProfile());
mountBottomBar(stage, {
  onStartToggle: () => toggleStart(),
  onDescribe:    () => describeScene(),
  onMicToggle:   () => toggleMic(),
});

/* ── Start / Stop ─────────────────────────────────────────────────────────── */
let _modelLoaded = false;

async function toggleStart() {
  const s = getState();
  if (s.running || s.loading) { stopAll(); return; }
  try {
    setState({ loading: true, loadingMessage: 'Starting camera…' });
    await camera.start();
    if (!_modelLoaded) {
      await yolo.load(msg => setState({ loadingMessage: msg }));
      _modelLoaded = true;
      epLabel.textContent = yolo.executionProvider.toUpperCase();
    }
    setState({ loading: false, loadingMessage: '', running: true });
    overlay.resize();
    detection.start();
  } catch (err) {
    console.error(err);
    setState({ loading: false, loadingMessage: '', running: false });
    showToast('error', friendlyError(err));
  }
}

function stopAll() {
  detection.stop();
  camera.stop();
  stopSpeaking();
  recorder.cancel();
  setState({
    running: false, recording: false, thinking: false, speaking: false,
    objects: [], loadingMessage: '', loading: false, detail: null,
  });
}

/* ── Mic ──────────────────────────────────────────────────────────────────── */
async function toggleMic() {
  if (!getState().running) return;
  if (getState().recording) await micFlow.stop();
  else await micFlow.start();
}

/* ── Auth gate ────────────────────────────────────────────────────────────── */
if (!getState().currentUser) {
  showAuthModal();
}

/* ── Lifecycle ────────────────────────────────────────────────────────────── */
window.addEventListener('beforeunload', () => stopAll());
document.addEventListener('visibilitychange', () => {
  // Pause inference when the tab is backgrounded to save battery on mobile.
  if (document.hidden && getState().running) detection.stop();
  else if (!document.hidden && getState().running) detection.start();
});
