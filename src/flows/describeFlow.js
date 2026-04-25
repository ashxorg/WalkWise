// describeFlow.js — snapshot the scene, describe it via Gemini, speak the result.
// No microphone needed; triggered by the "Look" button.

import { getState, setState, showToast } from '../state.js';
import { analyzeImage } from '../services/vision.js';
import { describeScene } from '../services/gemini.js';
import { speak } from '../services/elevenlabs.js';
import { stripDataUrl, friendlyError } from '../utils.js';

export function createDescribeFlow(camera) {
  return async function describe() {
    const s = getState();
    if (!s.running || s.thinking || s.speaking || s.recording) return;

    setState({ thinking: true });

    try {
      const snapshotDataUrl = camera.snapshot(1024, 0.85);
      const imageBase64     = stripDataUrl(snapshotDataUrl);

      let visionResults = null;
      try { visionResults = await analyzeImage({ imageBase64 }); }
      catch (e) { console.warn('Vision call failed (continuing):', e); }

      const text = await describeScene({ imageBase64, visionResults });

      setState({
        thinking: false,
        speaking: true,
        detail: {
          label:   'Scene',
          image:   snapshotDataUrl,
          text,
          tags:    visionResults?.labels?.slice(0, 6).map(l => l.description) ?? [],
          loading: false,
        },
      });

      try {
        await speak({ voiceId: getState().settings.elevenVoiceId, text });
      } finally {
        setState({ speaking: false });
      }
    } catch (err) {
      console.error(err);
      setState({ thinking: false, speaking: false });
      showToast('error', friendlyError(err));
    }
  };
}
