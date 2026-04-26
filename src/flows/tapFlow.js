// tapFlow.js — handles the "tap a bounding box" interaction:
// crops the object, runs Vision + Gemini, shows the detail panel, and speaks.

import { getState, setState, showToast } from '../state.js';
import { analyzeImage } from '../services/vision.js';
import { describeObject } from '../services/gemini.js';
import { speak } from '../services/elevenlabs.js';
import { stripDataUrl, friendlyError } from '../utils.js';
import { getObjectProperties } from '../services/userService.js';

/**
 * @param {import('../ui/overlay.js').Overlay} overlay
 * @param {import('../core/camera.js').Camera} camera
 * @returns {(obj: any) => Promise<void>}
 */
export function createTapFlow(overlay, camera) {
  return async function onTap(obj) {
    const settings  = getState().settings;
    const px        = overlay.boxToVideoPixels(obj.box);
    const cropped   = camera.cropToDataURL(px, 640, 0.9);
    const fullSnap  = camera.snapshot(1024, 0.85);
    const imgSource = cropped || fullSnap;

    setState({ detail: { label: obj.label, image: imgSource, text: '', loading: true } });

    try {
      let visionResults = null;
      try { visionResults = await analyzeImage({ imageBase64: stripDataUrl(imgSource) }); }
      catch (e) { console.warn('Vision call failed (continuing):', e); }

      const [text, properties] = await Promise.all([
        describeObject({ label: obj.label, imageBase64: stripDataUrl(imgSource), visionResults }),
        getObjectProperties(obj.label).catch(() => ({})),
      ]);

      setState({
        detail: {
          label:      obj.label,
          image:      imgSource,
          text,
          tags:       visionResults?.labels?.slice(0, 6).map(l => l.description) ?? [],
          properties,
          loading:    false,
        },
      });

      if (settings.speakOnTap) {
        setState({ speaking: true });
        try {
          await speak({ voiceId: settings.elevenVoiceId, text });
        } finally {
          setState({ speaking: false });
        }
      }
    } catch (err) {
      console.error(err);
      setState(prev => ({
        ...prev,
        detail: { ...(prev.detail || {}), loading: false, text: 'Could not analyze that object — check your connection and try again.' },
      }));
      showToast('error', friendlyError(err));
    }
  };
}
