// audio.js — MediaRecorder wrapper for capturing the user's spoken question.
// Returns a Blob that can be sent to Gemini as inline audio data.

export class AudioRecorder {
  constructor() {
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    this.mimeType = pickMimeType();
  }

  isRecording() {
    return this.recorder?.state === 'recording';
  }

  async start() {
    if (this.isRecording()) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    });
    this.recorder.start();
  }

  /** Stop and return { blob, mimeType } */
  async stop() {
    if (!this.recorder) return null;
    return await new Promise((resolve) => {
      const r = this.recorder;
      r.addEventListener('stop', () => {
        const type = r.mimeType || this.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        // Free the mic
        if (this.stream) {
          this.stream.getTracks().forEach((t) => t.stop());
          this.stream = null;
        }
        this.recorder = null;
        this.chunks = [];
        resolve({ blob, mimeType: type.split(';')[0] });
      }, { once: true });
      r.stop();
    });
  }

  cancel() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch {}
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.recorder = null;
    this.chunks = [];
  }
}

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return null;
}

/** Convert a Blob to a base64 string (no data URL prefix) */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result; // "data:audio/webm;base64,...."
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
