// tracker.js — IoU-based association + lerp smoothing
// Ported from ObjectTracker.swift in the original Swift app.
// Keeps stable IDs across frames so labels don't jitter or recreate.

let _nextId = 1;
const newId = () => _nextId++;

export class ObjectTracker {
  constructor({ smoothFactor = 0.35, minIoU = 0.15, maxAgeMs = 1200 } = {}) {
    this.smoothFactor = smoothFactor;
    this.minIoU = minIoU;
    this.maxAgeMs = maxAgeMs;
    this.objects = []; // {id,label,confidence,box:{x,y,w,h},lastSeen}
  }

  /**
   * Update with a fresh batch of detections from YOLO.
   * Boxes are in normalized [0..1] coordinates (relative to camera frame),
   * top-left origin: {x, y, w, h}.
   */
  update(detections) {
    const now = performance.now();
    const updated = this.objects.map((o) => ({ ...o }));
    const used = new Set();

    for (const det of detections) {
      let bestIdx = -1;
      let bestScore = this.minIoU;
      for (let i = 0; i < updated.length; i++) {
        if (used.has(i)) continue;
        if (updated[i].label !== det.label) continue;
        const score = iou(updated[i].box, det.box);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        const o = updated[bestIdx];
        o.box = lerpBox(o.box, det.box, this.smoothFactor);
        o.confidence = det.confidence;
        o.lastSeen = now;
        used.add(bestIdx);
      } else {
        updated.push({
          id: newId(),
          label: det.label,
          confidence: det.confidence,
          box: det.box,
          lastSeen: now,
        });
      }
    }

    // Drop stale tracks
    this.objects = updated.filter((o) => now - o.lastSeen < this.maxAgeMs);
    return this.objects;
  }

  clear() {
    this.objects = [];
  }
}

function iou(a, b) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const u = a.w * a.h + b.w * b.h - inter;
  return u > 0 ? inter / u : 0;
}

function lerpBox(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}
