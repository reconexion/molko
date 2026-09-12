// Copies the ffmpeg.wasm single-threaded core into public/ so it can be
// served same-origin instead of fetched from a CDN at runtime.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "..", "node_modules", "@ffmpeg", "core", "dist", "esm");
const destDir = join(__dirname, "..", "public", "ffmpeg");

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}

console.log("ffmpeg-core copied to public/ffmpeg/");
