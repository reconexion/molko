import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // @ffmpeg/ffmpeg spawns a worker that resolves its own core script URL;
  // Vite's dependency pre-bundling breaks that resolution, so these must
  // stay unbundled. See https://github.com/ffmpegwasm/ffmpeg.wasm/issues
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
