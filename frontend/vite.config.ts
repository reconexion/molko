import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// COOP/COEP make the page "cross-origin isolated", which is what unlocks
// SharedArrayBuffer — required by ffmpeg.wasm's multi-threaded core. Without
// these, `crossOriginIsolated` is false and lib/ffmpeg.ts falls back to the
// single-threaded core instead. A production host must set the same two
// headers on the served HTML for the multi-threaded path to work there too.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// The session token lives in localStorage, so an XSS would be a session theft: the CSP
// limits what injected script could load or send. Only applied to `vite preview` (the
// production build); the dev server needs inline scripts and a websocket for HMR.
// A production host must send the same headers.
function securityHeaders(apiOrigin: string) {
  const csp = [
    "default-src 'self'",
    // blob: because ffmpeg.wasm's core and worker are loaded from blob URLs.
    "script-src 'self' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    // styled-components injects <style> tags at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} blob: data:`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  return {
    ...crossOriginIsolationHeaders,
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiOrigin = env.VITE_API_URL ?? 'http://localhost:8000'

  return {
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
    preview: { headers: securityHeaders(apiOrigin) },
  }
})
