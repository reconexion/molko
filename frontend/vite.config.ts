import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// COOP/COEP make the page "cross-origin isolated", which is what unlocks
// SharedArrayBuffer — required by ffmpeg.wasm's multi-threaded core. Without
// these, `crossOriginIsolated` is false and lib/ffmpeg.ts falls back to the
// single-threaded core instead. A production host must set the same two
// headers on the served HTML for the multi-threaded path to work there too.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  // @ffmpeg/ffmpeg spawns a worker that resolves its own core script URL;
  // Vite's dependency pre-bundling breaks that resolution, so these must
  // stay unbundled. See https://github.com/ffmpegwasm/ffmpeg.wasm/issues
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
})
