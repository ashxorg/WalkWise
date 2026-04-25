// overlay.js — canvas overlay that draws bounding boxes, corner accents,
// connector lines, and floating labels. Handles tap-to-select.
//
// The canvas is sized in CSS pixels matching its containing element.
// Detections are in normalized 0..1 coords (top-left origin) of the source video frame.
// We map those onto the *displayed* video rect, accounting for object-fit: cover crop.

const ACCENT = '#8BCE51';
const ACCENT_DIM = 'rgba(139, 206, 81, 0.35)';
const ACCENT_GLOW = 'rgba(139, 206, 81, 0.55)';
const LABEL_BG = 'rgba(8, 12, 8, 0.78)';
const TEXT = 'rgba(255,255,255,0.92)';
const TEXT_DIM = 'rgba(255,255,255,0.55)';

export class Overlay {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLVideoElement} video
   * @param {(obj:any) => void} onTap   called when the user taps a detection's label or box
   */
  constructor(canvas, video, onTap) {
    this.canvas = canvas;
    this.video = video;
    this.ctx = canvas.getContext('2d');
    this.onTap = onTap;
    this.objects = [];
    this._hitRects = []; // {rect:{x,y,w,h}, obj}
    this._dpr = Math.max(1, window.devicePixelRatio || 1);
    this._handleTap = this._handleTap.bind(this);
    this.canvas.addEventListener('pointerdown', this._handleTap);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this._dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width  = Math.max(1, Math.round(r.width  * this._dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this._dpr));
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    this.draw();
  }

  setObjects(objects) {
    this.objects = objects;
    this.draw();
  }

  /** Compute how the source video maps onto the canvas (object-fit: cover). */
  _videoRect() {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const vw = this.video.videoWidth || cw;
    const vh = this.video.videoHeight || ch;
    const vAspect = vw / vh;
    const cAspect = cw / ch;
    let dispW, dispH;
    if (vAspect > cAspect) {
      // Video wider: crop sides
      dispH = ch; dispW = ch * vAspect;
    } else {
      dispW = cw; dispH = cw / vAspect;
    }
    const dx = (cw - dispW) / 2;
    const dy = (ch - dispH) / 2;
    return { dx, dy, dispW, dispH, vw, vh };
  }

  /** Convert an object box (normalized) → displayed canvas pixel rect */
  _toDisplay(box) {
    const { dx, dy, dispW, dispH } = this._videoRect();
    return {
      x: dx + box.x * dispW,
      y: dy + box.y * dispH,
      w: box.w * dispW,
      h: box.h * dispH,
    };
  }

  /** Convert a tap point (canvas px) → source video px (used for cropping) */
  toVideoCoords(px, py) {
    const { dx, dy, dispW, dispH, vw, vh } = this._videoRect();
    const nx = (px - dx) / dispW;
    const ny = (py - dy) / dispH;
    return { x: nx * vw, y: ny * vh };
  }

  /** Convert an object's box to source video pixel rect */
  boxToVideoPixels(box) {
    const { vw, vh } = this._videoRect();
    return { x: box.x * vw, y: box.y * vh, w: box.w * vw, h: box.h * vh };
  }

  draw() {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    ctx.clearRect(0, 0, cw, ch);
    this._hitRects = [];

    if (!this.objects.length) return;

    // First pass: collect display rects + label positions
    const items = this.objects.map((obj) => {
      const r = this._toDisplay(obj.box);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const goRight = cx < cw / 2;
      const labelW = 178;
      const labelH = 56;
      let lx = cx + (goRight ? r.w / 2 + 28 : -(r.w / 2 + 28 + labelW));
      lx = Math.max(8, Math.min(cw - labelW - 8, lx));
      let ly = cy - labelH / 2;
      ly = Math.max(8, Math.min(ch - labelH - 8, ly));
      return { obj, rect: r, cx, cy, label: { x: lx, y: ly, w: labelW, h: labelH }, goRight };
    });

    // Connector lines and bounding boxes
    for (const it of items) {
      drawBox(ctx, it.rect);
      drawConnector(ctx, it);
    }
    // Labels on top
    for (const it of items) {
      drawLabel(ctx, it);
      this._hitRects.push({ rect: { x: it.label.x, y: it.label.y, w: it.label.w, h: it.label.h }, obj: it.obj });
      // Also make the bounding box itself tappable
      this._hitRects.push({ rect: it.rect, obj: it.obj });
    }
  }

  _handleTap(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    for (const h of this._hitRects) {
      const r = h.rect;
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        this.onTap?.(h.obj);
        return;
      }
    }
  }
}

/* ---------------- drawing helpers ---------------- */

function drawBox(ctx, r) {
  // Semi-transparent fill so the user can still see what's there
  ctx.save();
  ctx.strokeStyle = ACCENT_DIM;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  // Corner accents
  drawCornerAccents(ctx, r, Math.min(18, r.w * 0.18, r.h * 0.18), ACCENT, 2);
  ctx.restore();
}

function drawCornerAccents(ctx, r, len, color, lw = 2) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.shadowColor = ACCENT_GLOW;
  ctx.shadowBlur = 8;
  const x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
  ctx.beginPath();
  // Top-left
  ctx.moveTo(x1, y1 + len); ctx.lineTo(x1, y1); ctx.lineTo(x1 + len, y1);
  // Top-right
  ctx.moveTo(x2 - len, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + len);
  // Bottom-right
  ctx.moveTo(x2, y2 - len); ctx.lineTo(x2, y2); ctx.lineTo(x2 - len, y2);
  // Bottom-left
  ctx.moveTo(x1 + len, y2); ctx.lineTo(x1, y2); ctx.lineTo(x1, y2 - len);
  ctx.stroke();
  ctx.restore();
}

function drawConnector(ctx, it) {
  const fromX = it.cx;
  const fromY = it.cy;
  const toX = it.goRight ? it.label.x : it.label.x + it.label.w;
  const toY = it.label.y + it.label.h / 2;
  ctx.save();
  // Glow underline
  ctx.strokeStyle = ACCENT_DIM;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY);
  ctx.stroke();
  // Sharp line
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY);
  ctx.stroke();
  // Diamond at the object
  const d = 5;
  ctx.fillStyle = ACCENT;
  ctx.shadowColor = ACCENT_GLOW;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY - d);
  ctx.lineTo(fromX + d, fromY);
  ctx.lineTo(fromX, fromY + d);
  ctx.lineTo(fromX - d, fromY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLabel(ctx, it) {
  const { x, y, w, h } = it.label;
  ctx.save();
  // Frosted card
  ctx.fillStyle = LABEL_BG;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();

  // Border + corner accents
  ctx.strokeStyle = ACCENT_DIM;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 6);
  ctx.stroke();
  drawCornerAccents(ctx, { x, y, w, h }, 8, ACCENT, 1.2);

  // Top row: diamond + label
  ctx.fillStyle = ACCENT;
  ctx.shadowColor = ACCENT_GLOW;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 12);
  ctx.lineTo(x + 16, y + 16);
  ctx.lineTo(x + 12, y + 20);
  ctx.lineTo(x + 8,  y + 16);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = TEXT;
  ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  const lbl = it.obj.label.toUpperCase();
  ctx.fillText(truncate(ctx, lbl, w - 80), x + 22, y + 16);

  // Confidence (right)
  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'right';
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText(`${Math.round(it.obj.confidence * 100)}%`, x + w - 10, y + 16);
  ctx.textAlign = 'left';

  // Divider
  ctx.strokeStyle = ACCENT_DIM;
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 28);
  ctx.lineTo(x + w - 10, y + 28);
  ctx.stroke();

  // Subline
  ctx.fillStyle = TEXT_DIM;
  ctx.font = '400 9px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillText('TAP TO INSPECT', x + 10, y + 42);

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}
