// Remove ORT wasm files that Vite bundles into dist/assets but that we
// never actually load at runtime (we point ORT at a CDN instead).
// Cross-platform: pure Node, runs on Windows/macOS/Linux.

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist/assets';
let removed = 0;
let bytes = 0;
try {
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.wasm') && !name.endsWith('.mjs')) continue;
    const p = join(dir, name);
    try {
      const s = statSync(p);
      // Only target the large ORT bundles, not anything tiny we may need
      if (s.size > 200 * 1024) {
        bytes += s.size;
        unlinkSync(p);
        removed++;
      }
    } catch {}
  }
  if (removed) {
    console.log(`clean-wasm: removed ${removed} unused ORT bundle file(s) (${(bytes / 1e6).toFixed(1)} MB)`);
  }
} catch (err) {
  // Build will have failed already if dist/assets doesn't exist — be quiet otherwise
  if (err?.code !== 'ENOENT') console.warn('clean-wasm: skipped (', err.message, ')');
}
