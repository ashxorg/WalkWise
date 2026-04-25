// yolo.js — YOLOv8n inference loop using ONNX Runtime Web.
// Uses the standard single-threaded WASM build by default (works everywhere
// without cross-origin isolation). If WebGPU is supported by the browser
// AND the WebGPU bundle is available, we'll opportunistically try that first.
//
// Expected model: standard Ultralytics YOLOv8n ONNX export
//   input  : "images"  shape [1,3,640,640] float32, RGB, 0..1
//   output : "output0" shape [1,84,8400]   (4 box coords + 80 class scores per anchor)

import * as ort from 'onnxruntime-web';
import ortWasmMjsUrl from '../ort/ort-wasm-simd-threaded.jsep.mjs?url';
import ortWasmWasmUrl from '../ort/ort-wasm-simd-threaded.jsep.wasm?url';

// COCO class names (YOLOv8 default)
export const COCO_CLASSES = [
  'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light',
  'fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow',
  'elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase','frisbee',
  'skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket','bottle',
  'wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange',
  'broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant','bed',
  'dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone','microwave','oven',
  'toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'
];

const INPUT_SIZE = 640;
const ORT_VERSION = '1.19.2';

export class Yolo {
  constructor({ modelUrl = '/models/yolov8n.onnx', scoreThreshold = 0.35, iouThreshold = 0.45 } = {}) {
    this.modelUrl = modelUrl;
    this.scoreThreshold = scoreThreshold;
    this.iouThreshold = iouThreshold;
    this.session = null;
    this.inputName = 'images';
    this.outputName = 'output0';
    this.executionProvider = 'unknown';
    this._canvas = document.createElement('canvas');
    this._canvas.width = INPUT_SIZE;
    this._canvas.height = INPUT_SIZE;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });
    this._configured = false;
  }

  _configureOrt() {
    if (this._configured) return;
    // Use Vite-resolved URLs for the ORT WASM runtime so the module can
    // be imported from source and served correctly in dev, build, and tunnels.
    ort.env.wasm.wasmPaths = {
      mjs: ortWasmMjsUrl,
      wasm: ortWasmWasmUrl,
    };
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    ort.env.wasm.proxy = false;
    ort.env.logLevel = 'error';
    this._configured = true;
  }

  async load(onProgress) {
    this._configureOrt();

    onProgress?.('Fetching model…');
    let buf;
    try {
      buf = await fetchWithProgress(this.modelUrl, (loaded, total) => {
        const pct = total ? Math.round((loaded / total) * 100) : null;
        onProgress?.(pct != null ? `Fetching model… ${pct}%` : `Fetching model… ${(loaded/1e6).toFixed(1)} MB`);
      });
    } catch (err) {
      const msg = String(err?.message || err);
      if (/404|not found/i.test(msg)) {
        throw new Error(
          `YOLO model not found at ${this.modelUrl}. Convert your yolov8n.pt to ONNX and place it at public/models/yolov8n.onnx — see README.`
        );
      }
      throw err;
    }

    onProgress?.('Initializing inference…');

    // Try WebGPU first only if the browser actually supports it AND the WebGPU
    // EP is registered (it isn't in the default bundle, so this is a no-op
    // without `onnxruntime-web/webgpu`). Fall back to WASM gracefully.
    const tryProviders = ('gpu' in navigator) ? ['webgpu', 'wasm'] : ['wasm'];
    let lastErr = null;
    for (const ep of tryProviders) {
      try {
        this.session = await ort.InferenceSession.create(buf, {
          executionProviders: [ep],
          graphOptimizationLevel: 'all',
        });
        this.executionProvider = ep;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!this.session) throw lastErr ?? new Error('Failed to create ONNX inference session');

    if (this.session.inputNames?.length)  this.inputName  = this.session.inputNames[0];
    if (this.session.outputNames?.length) this.outputName = this.session.outputNames[0];

    onProgress?.(`Ready (${this.executionProvider.toUpperCase()})`);
  }

  /**
   * Run detection on a video element.
   * @returns {Array<{label, confidence, box:{x,y,w,h}}>}  box in NORMALIZED 0..1 coords (top-left origin)
   *          relative to the source video frame
   */
  async detect(videoEl) {
    if (!this.session || !videoEl.videoWidth) return [];

    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;

    // Letterbox the video into a 640×640 input (preserves aspect ratio)
    const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
    const dw = Math.round(vw * scale);
    const dh = Math.round(vh * scale);
    const dx = Math.floor((INPUT_SIZE - dw) / 2);
    const dy = Math.floor((INPUT_SIZE - dh) / 2);

    this._ctx.fillStyle = '#000';
    this._ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
    this._ctx.drawImage(videoEl, 0, 0, vw, vh, dx, dy, dw, dh);
    const img = this._ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

    // HWC uint8 → CHW float32 normalized
    const arr = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
    const px = img.data;
    const plane = INPUT_SIZE * INPUT_SIZE;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      arr[j]            = px[i]     / 255;
      arr[j + plane]    = px[i + 1] / 255;
      arr[j + 2*plane]  = px[i + 2] / 255;
    }
    const inputTensor = new ort.Tensor('float32', arr, [1, 3, INPUT_SIZE, INPUT_SIZE]);

    const feeds = {}; feeds[this.inputName] = inputTensor;
    const out = await this.session.run(feeds);
    const tensor = out[this.outputName];
    const data = tensor.data;

    const numAnchors = tensor.dims[2];
    const numClasses = tensor.dims[1] - 4;
    const dets = [];
    for (let i = 0; i < numAnchors; i++) {
      let maxScore = 0;
      let maxClass = -1;
      for (let c = 0; c < numClasses; c++) {
        const v = data[(4 + c) * numAnchors + i];
        if (v > maxScore) { maxScore = v; maxClass = c; }
      }
      if (maxScore < this.scoreThreshold) continue;

      const cx = data[0 * numAnchors + i];
      const cy = data[1 * numAnchors + i];
      const w  = data[2 * numAnchors + i];
      const h  = data[3 * numAnchors + i];

      let x1 = cx - w / 2;
      let y1 = cy - h / 2;
      let x2 = cx + w / 2;
      let y2 = cy + h / 2;

      x1 = (x1 - dx) / scale;
      y1 = (y1 - dy) / scale;
      x2 = (x2 - dx) / scale;
      y2 = (y2 - dy) / scale;

      const nx = Math.max(0, Math.min(1, x1 / vw));
      const ny = Math.max(0, Math.min(1, y1 / vh));
      const nw = Math.max(0, Math.min(1, (x2 - x1) / vw));
      const nh = Math.max(0, Math.min(1, (y2 - y1) / vh));
      if (nw <= 0 || nh <= 0) continue;

      dets.push({
        label: COCO_CLASSES[maxClass] ?? `class_${maxClass}`,
        confidence: maxScore,
        box: { x: nx, y: ny, w: nw, h: nh },
        _classId: maxClass,
      });
    }
    return nms(dets, this.iouThreshold);
  }
}

/* ------------ Non-max suppression (per class) ------------ */
function nms(dets, iouThr) {
  dets.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  const suppressed = new Array(dets.length).fill(false);
  for (let i = 0; i < dets.length; i++) {
    if (suppressed[i]) continue;
    kept.push(dets[i]);
    for (let j = i + 1; j < dets.length; j++) {
      if (suppressed[j]) continue;
      if (dets[j]._classId !== dets[i]._classId) continue;
      if (boxIoU(dets[i].box, dets[j].box) > iouThr) suppressed[j] = true;
    }
  }
  return kept;
}

function boxIoU(a, b) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  const u = a.w * a.h + b.w * b.h - inter;
  return u > 0 ? inter / u : 0;
}

/* ------------ Fetch with progress ------------ */
async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}${res.status === 404 ? ' (not found)' : ''}`);
  const total = Number(res.headers.get('content-length') || 0);
  if (!res.body || !total) {
    return await res.arrayBuffer();
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total);
  }
  const out = new Uint8Array(received);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out.buffer;
}
