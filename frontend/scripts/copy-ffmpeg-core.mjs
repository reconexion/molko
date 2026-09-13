// Copies both the single-threaded and multi-threaded ffmpeg.wasm cores into
// public/ so they can be served same-origin instead of fetched from a CDN at
// runtime. lib/ffmpeg.ts picks between them at load time based on whether the
// page is cross-origin isolated (see vite.config.ts).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

function copyCore(pkgName, files, destName) {
  const srcDir = join(__dirname, "..", "node_modules", "@ffmpeg", pkgName, "dist", "esm");
  const destDir = join(publicDir, destName);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  for (const file of files) {
    copyFileSync(join(srcDir, file), join(destDir, file));
  }
  console.log(`${pkgName} copied to public/${destName}/`);
}

copyCore("core", ["ffmpeg-core.js", "ffmpeg-core.wasm"], "ffmpeg");
copyCore("core-mt", ["ffmpeg-core.js", "ffmpeg-core.wasm", "ffmpeg-core.worker.js"], "ffmpeg-mt");
