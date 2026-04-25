// main.js — WalkWise entry point.
// Bootstraps the camera, YOLO loop, UI, and orchestrates the mic / tap flows.

import './styles.css';
import { Camera } from './core/camera.js';
import { Yolo } from './core/yolo.js';
import { ObjectTracker } from './core/tracker.js';
import { AudioRecorder, blobToBase64 } from './core/audio.js';
import { Overlay } from './ui/overlay.js';
import { mountBottomBar } from './ui/bottomBar.js';
import { mountDetailPanel } from './ui/detailPanel.js';
import { mountSettings } from './ui/settingsModal.js';
import { getState, setState, subscribe, showToast } from './state.js';
import { analyzeImage } from './services/vision.js';
import { answerSpokenQuestion, describeObject } from './services/gemini.js';
import { speak, stopSpeaking } from './services/elevenlabs.js';
import { mountGameButton } from './ui/gameButton.js';
import { detectObjectColor } from './core/color.js';

/* -------------- Build the DOM -------------- */
const app = document.getElementById('app');
app.innerHTML = `
  <div class="stage">
    <video class="video" playsinline muted autoplay></video>
    <canvas class="overlay"></canvas>

    <!-- top status -->
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

    <!-- placeholder shown before Start -->
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

    <!-- toast -->
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

/* -------------- Wire UI modules -------------- */
mountSettings(stage);
mountGameButton(stage);
mountDetailPanel(stage);
mountBottomBar(stage, {
  onStartToggle: () => toggleStart(),
  onMicToggle:   () => toggleMic(),
});

/* -------------- Core engines -------------- */
const camera = new Camera(videoEl);
const yolo = new Yolo();
const tracker = new ObjectTracker({ smoothFactor: 0.35 });
const recorder = new AudioRecorder();
const overlay = new Overlay(canvasEl, videoEl, onObjectTap);

let _detectLoopId = null;
let _lastDetectAt = 0;
let _modelLoaded = false;

/* -------------- State subscriptions -------------- */
subscribe((s) => {
  // Toast
  if (s.toast) {
    toastEl.textContent = s.toast.message;
    toastEl.classList.remove('toast-error', 'toast-info');
    toastEl.classList.add(s.toast.kind === 'error' ? 'toast-error' : 'toast-info');
    toastEl.classList.add('is-visible');
  } else {
    toastEl.classList.remove('is-visible');
  }
  // Status
  let label = 'standby';
  if (s.loading)        label = 'loading';
  else if (s.recording) label = 'listening';
  else if (s.thinking)  label = 'thinking';
  else if (s.speaking)  label = 'speaking';
  else if (s.running)   label = 'online';
  stateEl.textContent = label;
  stateEl.dataset.kind = label;

  objCount.textContent = `${s.objects.length} object${s.objects.length === 1 ? '' : 's'}`;
  heroEl.classList.toggle('is-hidden', s.running || s.loading);
  overlay.setObjects(s.objects);
});

/* -------------- Start / Stop -------------- */
async function toggleStart() {
  const s = getState();
  if (s.running || s.loading) {
    stopAll();
    return;
  }
  try {
    setState({ loading: true, loadingMessage: 'Starting camera…' });
    await camera.start();

    if (!_modelLoaded) {
      await yolo.load((msg) => setState({ loadingMessage: msg }));
      _modelLoaded = true;
      epLabel.textContent = yolo.executionProvider.toUpperCase();
    }

    setState({ loading: false, loadingMessage: '', running: true });
    overlay.resize();
    runLoop();
  } catch (err) {
    console.error(err);
    setState({ loading: false, loadingMessage: '', running: false });
    showToast('error', friendlyError(err));
  }
}

function stopAll() {
  if (_detectLoopId) cancelAnimationFrame(_detectLoopId);
  _detectLoopId = null;
  camera.stop();
  tracker.clear();
  stopSpeaking();
  recorder.cancel();
  setState({
    running: false, recording: false, thinking: false, speaking: false,
    objects: [], loadingMessage: '', loading: false, detail: null,
  });
}

function runLoop() {
  let busy = false;
  const tick = async () => {
    if (!getState().running) return;
    const now = performance.now();
    const fps = Math.max(1, getState().settings.detectionFps || 3);
    const interval = 1000 / fps;
    if (!busy && now - _lastDetectAt >= interval) {
      busy = true;
      _lastDetectAt = now;
      try {
        const dets = await yolo.detect(videoEl);
        const tracked = tracker.update(dets);
        setState({ objects: tracked });

        const s = getState();
        if (!s.speaking && !s.thinking && !s.recording) {
          const nowTs = Date.now();
          // Guardian Mode check (15s cooldown)
          if (nowTs - s.guardianCooldown > 15000) {
            const hazard = tracked.find(o => 
              o.label === 'knife' || 
              o.label === 'scissors' || 
              (o.label === 'person' && o.box.h > 0.5)
            );
            if (hazard) {
              setState({ guardianCooldown: nowTs, speaking: true });
              speak({
                voiceId: s.settings.elevenVoiceId,
                text: `Warning, safety hazard detected: a ${hazard.label === 'person' ? 'person is very close' : hazard.label} is nearby.`
              }).finally(() => setState({ speaking: false })).catch(e => {
                console.warn(e);
                setState({ speaking: false });
              });
            }
          }

          // Minigame check
          if (s.gameActive && s.targetColor && !getState().speaking) {
            for (const o of tracked) {
              const color = detectObjectColor(videoEl, o.box);
              if (color === s.targetColor) {
                setState({ gameActive: false, targetColor: null, speaking: true });
                speak({
                  voiceId: s.settings.elevenVoiceId,
                  text: `Great job! You found a ${color} ${o.label}!`
                }).finally(() => setState({ speaking: false })).catch(e => {
                  console.warn(e);
                  setState({ speaking: false });
                });
                break;
              }
            }
          }
        }
      } catch (err) {
        console.warn('detect error', err);
      }
      busy = false;
    }
    _detectLoopId = requestAnimationFrame(tick);
  };
  _detectLoopId = requestAnimationFrame(tick);
}

/* -------------- Mic flow -------------- */
async function toggleMic() {
  const s = getState();
  if (!s.running) return;
  if (s.recording) {
    await stopRecordingAndAnswer();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    stopSpeaking();
    await recorder.start();
    setState({ recording: true, thinking: false });
  } catch (err) {
    showToast('error', 'Microphone permission was denied.');
    console.error(err);
  }
}

async function stopRecordingAndAnswer() {
  let result;
  try {
    result = await recorder.stop();
  } catch (err) {
    console.error(err);
    setState({ recording: false });
    return;
  }
  setState({ recording: false, thinking: true });

  try {
    const { blob, mimeType } = result || {};
    if (!blob || blob.size < 200) {
      setState({ thinking: false });
      showToast('info', "Didn't catch that — try again.");
      return;
    }
    const audioBase64 = await blobToBase64(blob);
    const snapshotDataUrl = camera.snapshot(1024, 0.85);
    const imageBase64 = stripDataUrl(snapshotDataUrl);

    const detectedLabels = getState().objects.map((o) => o.label);

    // Optional Vision pass for richer grounding (only if there's anything to look at)
    let visionResults = null;
    try {
      visionResults = await analyzeImage({ imageBase64 });
    } catch (e) {
      console.warn('Vision call failed (continuing without it):', e);
    }

    const { question, answer } = await answerSpokenQuestion({
      audioBase64,
      audioMime: mimeType,
      imageBase64,
      detectedLabels,
      visionResults,
    });

    setState({
      thinking: false,
      speaking: true,
      detail: {
        label: question || 'You asked',
        image: snapshotDataUrl,
        text: answer,
        tags: visionResults?.labels?.slice(0, 6).map((l) => l.description) ?? [],
        loading: false,
      },
    });

    try {
      await speak({
        voiceId: getState().settings.elevenVoiceId,
        text: answer,
      });
    } finally {
      setState({ speaking: false });
    }
  } catch (err) {
    console.error(err);
    setState({ thinking: false, speaking: false });
    showToast('error', friendlyError(err));
  }
}

/* -------------- Tap flow -------------- */
async function onObjectTap(obj) {
  const settings = getState().settings;
  const px = overlay.boxToVideoPixels(obj.box);
  const cropped = camera.cropToDataURL(px, 640, 0.9);
  const fullSnap = camera.snapshot(1024, 0.85);

  setState({
    detail: {
      label: obj.label,
      image: cropped || fullSnap,
      text: '',
      loading: true,
    },
  });

  try {
    let visionResults = null;
    try {
      visionResults = await analyzeImage({ imageBase64: stripDataUrl(cropped || fullSnap) });
    } catch (e) {
      console.warn('Vision call failed (continuing without it):', e);
    }
    
    const text = await describeObject({
      label: obj.label,
      imageBase64: stripDataUrl(cropped || fullSnap),
      visionResults,
    });
    setState({
      detail: {
        label: obj.label,
        image: cropped || fullSnap,
        text,
        tags: visionResults?.labels?.slice(0, 6).map((l) => l.description) ?? [],
        loading: false,
      },
    });
    if (settings.speakOnTap) {
      setState({ speaking: true });
      try {
        await speak({
          voiceId: settings.elevenVoiceId,
          text,
        });
      } finally {
        setState({ speaking: false });
      }
    }
  } catch (err) {
    console.error(err);
    setState((prev) => ({
      ...prev,
      detail: {
        ...(prev.detail || {}),
        loading: false,
        text: 'Could not analyze that object — check your API keys and try again.',
      },
    }));
    showToast('error', friendlyError(err));
  }
}

/* -------------- Helpers -------------- */
function stripDataUrl(s) {
  if (!s) return '';
  const i = s.indexOf(',');
  return i >= 0 ? s.slice(i + 1) : s;
}

function friendlyError(err) {
  const msg = (err && (err.message || err.toString())) || 'Something went wrong';
  if (/permission|denied/i.test(msg)) return 'Permission denied — please allow camera/microphone access.';
  if (/api key|401|403/i.test(msg))   return 'API key rejected — please check the configured keys.';
  if (/network|fetch/i.test(msg))     return 'Network error — check your connection and try again.';
  return msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
}

/* -------------- Lifecycle -------------- */
window.addEventListener('beforeunload', () => stopAll());
document.addEventListener('visibilitychange', () => {
  // Pause detection when the tab is hidden (mobile saves a lot of battery this way)
  if (document.hidden && getState().running) {
    if (_detectLoopId) cancelAnimationFrame(_detectLoopId);
    _detectLoopId = null;
  } else if (!document.hidden && getState().running && !_detectLoopId) {
    runLoop();
  }
});
