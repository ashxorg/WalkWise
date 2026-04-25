import { defineConfig } from 'vite';

export default defineConfig({
  // Don't pre-bundle ORT — its WASM payload should be fetched lazily from CDN.
  optimizeDeps: {
    exclude: ['onnxruntime-web']
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          ort: ['onnxruntime-web']
        }
      }
    }
  },
  server: {
    host: true,        // expose on LAN so phones / ngrok can reach it
    port: 5173,
    strictPort: false,
    // Allow ngrok / any tunnel hostname to hit the dev server
    allowedHosts: true,
    headers: {
      // COOP/COEP enable cross-origin isolation, which lets ORT pick up
      // SharedArrayBuffer when available. Single-thread WASM still works
      // without it; these just let us upgrade for free.
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  }
});
