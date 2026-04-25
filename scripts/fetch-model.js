// Downloads a pre-converted yolov8n.onnx into public/models/.
// Sources tried in order — the first that responds 200 wins.
//
// You can also point this at a custom URL: `node scripts/fetch-model.js <url>`

import { mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const DEST = 'public/models/yolov8n.onnx';
const SOURCES = [
  // Reliable community mirror of the standard Ultralytics export
  'https://huggingface.co/Xenova/yolov8n/resolve/main/onnx/model.onnx',
  // Fallback: another community export (same architecture, may differ in precision)
  'https://huggingface.co/onnx-community/yolov8n-all/resolve/main/onnx/model.onnx',
];

const customUrl = process.argv[2];
const urls = customUrl ? [customUrl] : SOURCES;

if (existsSync(DEST)) {
  console.log(`✓ ${DEST} already exists — delete it first to re-download.`);
  process.exit(0);
}

mkdirSync(dirname(DEST), { recursive: true });

let lastErr = null;
for (const url of urls) {
  try {
    console.log(`Trying ${url}…`);
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) { console.log(`  → ${res.status}, trying next`); continue; }
    const total = Number(res.headers.get('content-length') || 0);
    let received = 0;
    const stream = Readable.fromWeb(res.body);
    stream.on('data', (chunk) => {
      received += chunk.length;
      if (total) {
        const pct = Math.round((received / total) * 100);
        process.stdout.write(`\r  Downloading… ${pct}% (${(received/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB)`);
      } else {
        process.stdout.write(`\r  Downloading… ${(received/1e6).toFixed(1)} MB`);
      }
    });
    await pipeline(stream, createWriteStream(DEST));
    process.stdout.write('\n');
    console.log(`✓ Saved to ${DEST} (${(received/1e6).toFixed(1)} MB)`);
    process.exit(0);
  } catch (err) {
    lastErr = err;
    console.log(`  → ${err.message}, trying next`);
  }
}

console.error('Failed to download yolov8n.onnx from any source.');
if (lastErr) console.error(lastErr);
console.error('\nFallback: convert the bundled yolov8n.pt yourself:');
console.error('  pip install ultralytics');
console.error('  yolo export model=yolov8n.pt format=onnx opset=12 imgsz=640 simplify=True');
console.error('  mkdir -p public/models && mv yolov8n.onnx public/models/');
process.exit(1);
