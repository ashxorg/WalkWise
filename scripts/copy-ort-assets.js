import { mkdirSync, readdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = 'node_modules/onnxruntime-web/dist';
const DEST_DIR = 'src/ort';
const PATTERNS = ['.wasm', '.mjs'];

if (!existsSync(SRC_DIR)) {
  console.error(`Cannot find source directory: ${SRC_DIR}`);
  process.exit(1);
}

mkdirSync(DEST_DIR, { recursive: true });

let copied = 0;
for (const name of readdirSync(SRC_DIR)) {
  if (!PATTERNS.some((ext) => name.endsWith(ext))) continue;
  const src = join(SRC_DIR, name);
  const dest = join(DEST_DIR, name);
  const stat = statSync(src);
  if (!stat.isFile()) continue;
  copyFileSync(src, dest);
  copied += 1;
}

if (!copied) {
  console.error(`No ORT assets were copied from ${SRC_DIR}.`);
  process.exit(1);
}

console.log(`Copied ${copied} ONNX Runtime asset(s) to ${DEST_DIR}`);
