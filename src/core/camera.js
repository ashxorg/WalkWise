// camera.js — getUserMedia wrapper, snapshot helper, crop helper
//
// Cross-platform: works on iOS Safari 16+, Chrome Android, desktop.
// Note: iOS requires HTTPS and a user-gesture to start the camera.

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
  }

  async start() {
    if (this.stream) return;
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Fallback: drop facingMode if rear camera not available (desktop laptops)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
    // Wait for metadata so videoWidth/Height are populated
    if (!this.video.videoWidth) {
      await new Promise((r) => this.video.addEventListener('loadedmetadata', r, { once: true }));
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
  }

  isRunning() {
    return !!this.stream;
  }

  /**
   * Capture the current video frame as a JPEG data URL (base64).
   * @param {number} maxDim Max dimension in px (downscale to keep payload small)
   * @param {number} quality JPEG quality 0..1
   * @returns {string|null} dataURL like "data:image/jpeg;base64,..."
   */
  snapshot(maxDim = 1024, quality = 0.85) {
    if (!this.video.videoWidth) return null;
    const w = this.video.videoWidth;
    const h = this.video.videoHeight;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.drawImage(this.video, 0, 0, cw, ch);
    return c.toDataURL('image/jpeg', quality);
  }

  /**
   * Crop a region of the current frame and return as a JPEG data URL.
   * Box is in display coordinates (pixels in video element space).
   * @param {{x:number,y:number,w:number,h:number}} box
   */
  cropToDataURL(box, maxDim = 512, quality = 0.9) {
    if (!this.video.videoWidth) return null;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    // Clamp the box
    const x = Math.max(0, Math.min(vw - 1, box.x));
    const y = Math.max(0, Math.min(vh - 1, box.y));
    const w = Math.max(1, Math.min(vw - x, box.w));
    const h = Math.max(1, Math.min(vh - y, box.h));
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.drawImage(this.video, x, y, w, h, 0, 0, cw, ch);
    return c.toDataURL('image/jpeg', quality);
  }

  /** Return current video pixel dimensions */
  size() {
    return { w: this.video.videoWidth || 0, h: this.video.videoHeight || 0 };
  }
}
