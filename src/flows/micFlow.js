// micFlow.js — manages the full mic → transcribe → answer → speak pipeline.
// Returns { start, stop } where stop() also triggers the AI answer.

import { getState, setState, showToast } from '../state.js';
import { blobToBase64 } from '../core/audio.js';
import { analyzeImage } from '../services/vision.js';
import { answerSpokenQuestion } from '../services/gemini.js';
import { speak, stopSpeaking } from '../services/elevenlabs.js';
import { stripDataUrl, friendlyError } from '../utils.js';

/**
 * @param {import('../core/audio.js').AudioRecorder} recorder
 * @param {import('../core/camera.js').Camera} camera
 */
export function createMicFlow(recorder, camera) {
  /** Begin recording the user's spoken question. */
  async function start() {
    try {
      stopSpeaking();
      await recorder.start();
      setState({ recording: true, thinking: false });
    } catch {
      showToast('error', 'Microphone permission was denied.');
    }
  }

  /** Stop recording, then run the Vision + Gemini + ElevenLabs pipeline. */
  async function stop() {
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

      const audioBase64     = await blobToBase64(blob);
      const snapshotDataUrl = camera.snapshot(1024, 0.85);
      const imageBase64     = stripDataUrl(snapshotDataUrl);
      const detectedLabels  = getState().objects.map(o => o.label);

      let visionResults = null;
      try { visionResults = await analyzeImage({ imageBase64 }); }
      catch (e) { console.warn('Vision call failed (continuing):', e); }

      const { question, answer } = await answerSpokenQuestion({
        audioBase64, audioMime: mimeType, imageBase64, detectedLabels, visionResults,
      });

      setState({
        thinking: false,
        speaking: true,
        detail: {
          label:   question || 'You asked',
          image:   snapshotDataUrl,
          text:    answer,
          tags:    visionResults?.labels?.slice(0, 6).map(l => l.description) ?? [],
          loading: false,
        },
      });

      try {
        await speak({ voiceId: getState().settings.elevenVoiceId, text: answer });
      } finally {
        setState({ speaking: false });
      }
    } catch (err) {
      console.error(err);
      setState({ thinking: false, speaking: false });
      showToast('error', friendlyError(err));
    }
  }

  return { start, stop };
}
