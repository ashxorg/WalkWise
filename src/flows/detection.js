// detection.js — drives the YOLO inference loop and handles the two
// passive-listening features: Guardian Mode and the color minigame.

import { getState, setState } from '../state.js';
import { speak } from '../services/elevenlabs.js';
import { detectObjectColor } from '../core/color.js';


/**
 * @param {{
 *   videoEl: HTMLVideoElement,
 *   yolo:    import('../core/yolo.js').Yolo,
 *   tracker: import('../core/tracker.js').ObjectTracker,
 * }} deps
 */
export function createDetectionFlow({ videoEl, yolo, tracker }) {
  let _loopId = null;
  let _lastAt = 0;

  /** Start the rAF-based detection loop. */
  function start() {
    let busy = false;
    const tick = async () => {
      if (!getState().running) return;
      const now = performance.now();
      const fps = Math.max(1, getState().settings.detectionFps || 3);
      if (!busy && now - _lastAt >= 1000 / fps) {
        busy = true;
        _lastAt = now;
        try {
          const dets    = await yolo.detect(videoEl);
          const tracked = tracker.update(dets);
          setState({ objects: tracked });
          checkMinigame(tracked);
        } catch (err) {
          console.warn('detect error', err);
        }
        busy = false;
      }
      _loopId = requestAnimationFrame(tick);
    };
    _loopId = requestAnimationFrame(tick);
  }

  /** Cancel the loop and clear tracked objects. */
  function stop() {
    if (_loopId) cancelAnimationFrame(_loopId);
    _loopId = null;
    tracker.clear();
  }

  // ── Passive feature checks (run every detection tick) ───────────────────

  function checkMinigame(tracked) {
    const s = getState();
    if (s.speaking || s.thinking || s.recording) return;
    if (!s.gameActive || !s.targetColor) return;

    for (const o of tracked) {
      if (detectObjectColor(videoEl, o.box) !== s.targetColor) continue;
      setState({ gameActive: false, targetColor: null, speaking: true });
      speak({ voiceId: s.settings.elevenVoiceId, text: `Great job! You found a ${s.targetColor} ${o.label}!` })
        .finally(() => setState({ speaking: false }))
        .catch(e => { console.warn(e); setState({ speaking: false }); });
      break;
    }
  }

  return { start, stop };
}
