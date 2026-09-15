import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { transcodeApi } from "./api";

// Hard caps on upload size. ffmpeg.wasm runs single-threaded in the tab's own
// heap, so a very large source/gameplay pair can exhaust browser memory and
// crash the tab instead of failing gracefully — we reject early with a clear
// message rather than let that happen mid-export.
export const MAX_FILE_BYTES = 300 * 1024 * 1024; // 300MB per video
export const MAX_COMBINED_BYTES = 450 * 1024 * 1024; // 450MB source + gameplay combined

// ffmpeg.wasm's virtual filesystem holds each input/output file's full bytes
// in the tab's heap at once (nothing is streamed), so total clip duration —
// not just resolution — drives memory use almost linearly. 30s per chunk
// keeps each individual export within a safe memory footprint; a source clip
// longer than that gets split into consecutive ~30s parts (see planChunks)
// instead of rejected outright. (Lowered from 90s: some heavy/high-bitrate
// clips still aborted with an out-of-memory error at higher values.)
export const MAX_CHUNK_SECONDS = 30;

export class VideoTooLargeError extends Error {}

export function assertWithinMemoryBudget(files: File[]): void {
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new VideoTooLargeError(
        `"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(0)}MB. El máximo por video es ${MAX_FILE_BYTES / 1024 / 1024}MB porque el procesamiento corre en tu navegador.`,
      );
    }
  }
  const combined = files.reduce((sum, f) => sum + f.size, 0);
  if (combined > MAX_COMBINED_BYTES) {
    throw new VideoTooLargeError(
      `Los videos combinados pesan ${(combined / 1024 / 1024).toFixed(0)}MB, más del máximo de ${MAX_COMBINED_BYTES / 1024 / 1024}MB soportado en el navegador. Usa clips más cortos o de menor resolución.`,
    );
  }
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`No se pudo leer "${file.name}" como video`));
    };
    video.src = url;
  });
}

export interface Chunk {
  start: number;
  duration: number;
}

// Splits a source clip's duration into consecutive ~MAX_CHUNK_SECONDS
// windows (the last one shorter) instead of rejecting long clips outright —
// each window gets composed as its own export in the UI's export loop. No cap
// on the resulting part count: however long the source is, it just produces
// more sequential parts (each still processed one at a time in the browser).
export function planChunks(sourceDuration: number): Chunk[] {
  const total = Math.max(1, Math.ceil(sourceDuration / MAX_CHUNK_SECONDS));
  const chunks: Chunk[] = [];
  for (let i = 0; i < total; i++) {
    const start = i * MAX_CHUNK_SECONDS;
    chunks.push({ start, duration: Math.min(MAX_CHUNK_SECONDS, sourceDuration - start) });
  }
  return chunks;
}

// When the "partes de 1 minuto" option is on, pairs up consecutive ~30s
// chunks instead of doubling MAX_CHUNK_SECONDS itself — each chunk in a pair
// still gets composed independently (keeping the per-compose memory
// footprint that 30s chunking exists for), and the pair is concatenated
// afterwards via concatVideoParts. The last group is a lone chunk when the
// total count is odd.
export function groupChunksIntoMinuteParts(chunks: Chunk[]): Chunk[][] {
  const groups: Chunk[][] = [];
  for (let i = 0; i < chunks.length; i += 2) {
    groups.push(chunks.slice(i, i + 2));
  }
  return groups;
}

// Decides how to window the gameplay clip for one source chunk: a direct
// (fast, seeked) slice when the gameplay clip already covers this time range,
// or a looped one when it's shorter and needs to repeat to fill it.
export function planGameplayWindow(chunk: Chunk, gameplayDuration: number): Chunk & { loop: boolean } {
  const coversChunk = gameplayDuration >= chunk.start + chunk.duration;
  return { start: chunk.start, duration: chunk.duration, loop: !coversChunk };
}

export class FFmpegExecError extends Error {}
export class FFmpegOutOfMemoryError extends Error {}

let ffmpegSingleton: FFmpeg | null = null;
let progressHandler: ((ratio: number) => void) | undefined;
let dejaVuFontBytes: Uint8Array | null = null;
let komikaFontBytes: Uint8Array | null = null;
let recentLogs: string[] = [];

export async function loadFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;

  const ffmpeg = ffmpegSingleton ?? new FFmpeg();
  const isNewInstance = ffmpegSingleton === null;
  ffmpegSingleton = ffmpeg;

  // Only attach these once per instance — loadFFmpeg() is called again on
  // every export, and re-attaching would stack up duplicate listeners that
  // each re-fire the same log/progress event.
  if (isNewInstance) {
    ffmpeg.on("log", ({ message }) => {
      recentLogs.push(message);
      if (recentLogs.length > 50) recentLogs.shift();
      console.log("[ffmpeg]", message);
      onLog?.(message);
    });
    ffmpeg.on("progress", ({ progress }) => progressHandler?.(progress));
  }

  if (!ffmpeg.loaded) {
    await loadCore(ffmpeg);
  }

  return ffmpeg;
}

// The multi-threaded core needs the page to be "cross-origin isolated" (the
// COOP/COEP headers set in vite.config.ts) to get a SharedArrayBuffer at
// all — without it, `crossOriginIsolated` is false and we go straight to
// the single-threaded core instead of letting the mt core fail to load.
// Multi-threading splits encode work across the CPU's cores instead of
// helping with the actual memory ceiling, but it finishes long/heavy
// exports faster, which lowers the odds of hitting it in the first place.
async function loadCore(ffmpeg: FFmpeg): Promise<void> {
  if (typeof crossOriginIsolated !== "undefined" && crossOriginIsolated) {
    try {
      const baseURL = "/ffmpeg-mt";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
      });
      return;
    } catch {
      // fall through to the single-threaded core below
    }
  }

  const baseURL = "/ffmpeg";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
}

// libx264 auto-detects its thread count from the environment, which inside
// the mt core's emulated pthreads came out to 6 on a 4-core machine in
// testing — that oversubscription deadlocked the encoder outright (it got
// stuck after a single frame). Passing an explicit, conservative count avoids
// it while still getting real parallelism; it's a harmless no-op on the
// single-threaded core, which never actually spawns worker threads for it.
function pickThreadCount(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 1;
  return Math.max(1, Math.min(cores - 1, 4));
}

// ffmpeg.exec() resolves with a non-zero code on failure instead of
// rejecting — left unchecked, a partial/corrupt command still lets us read
// whatever (possibly empty or truncated) output file was written so far,
// which then gets exported as a broken video with no visible error.
async function execOrThrow(ffmpeg: FFmpeg, args: string[]): Promise<void> {
  recentLogs = [];
  console.log("[ffmpeg] exec", args.join(" "));
  const code = await ffmpeg.exec(args);
  if (code !== 0) {
    console.error("[ffmpeg] failed, code", code, "\nargs:", args.join(" "), "\nfull log:\n" + recentLogs.join("\n"));
    const tail = recentLogs.slice(-5).join(" ") || "sin más detalle";

    // ffmpeg-core's exec() wrapper swallows the WASM "Aborted(...)" runtime
    // exception (an unrecoverable fatal error, almost always OOM inside the
    // single-threaded WASM heap on a long/heavy export) and just returns a
    // non-zero code — the real signal is "Aborted(" showing up in the log
    // tail. Once that happens the WASM instance is permanently poisoned, so
    // every future exec() on it fails the same way until we throw it away
    // and let the next export start from a fresh instance.
    if (recentLogs.some((line) => line.includes("Aborted("))) {
      ffmpeg.terminate();
      ffmpegSingleton = null;
      throw new FFmpegOutOfMemoryError(
        "Tu navegador se quedó sin memoria procesando este video. Prueba con un clip más corto o de menor resolución, o cierra otras pestañas para liberar RAM.",
      );
    }

    throw new FFmpegExecError(`ffmpeg falló (código ${code}): ${tail}`);
  }
}

// Probes a written input's video codec by running ffmpeg with no output —
// it always "fails" (ffmpeg requires at least one output file), but the
// stream info it logs on the way there is the same info `ffprobe` would
// give, and ffmpeg.wasm ships no separate ffprobe binary.
async function detectVideoCodec(ffmpeg: FFmpeg, inputName: string): Promise<string | null> {
  recentLogs = [];
  await ffmpeg.exec(["-i", inputName]);
  const match = /Video:\s*([a-zA-Z0-9_]+)/.exec(recentLogs.join("\n"));
  const codec = match ? match[1].toLowerCase() : null;
  console.log("[ffmpeg] detected source codec:", codec ?? "(no match — see [ffmpeg] log lines above)");
  return codec;
}

// This ffmpeg.wasm build (@ffmpeg/core, see package.json) is compiled without
// libdav1d/libaom, so AV1 falls back to ffmpeg's native software AV1 decoder
// — which, in this build, doesn't actually work: it fails immediately with
// "Failed to get pixel format" / "Missing Sequence Header" on every frame
// (confirmed in practice on a real 720p/12MB AV1 clip; not a memory issue —
// a from-scratch re-encode pass hit the exact same decode failure). There is
// no way to salvage this client-side with the current core, so instead of
// rejecting the file we hand it to the local backend (which shells out to the
// system's real ffmpeg) and swap in the H.264 copy it returns.
export type DecodePrepStatus = "probing" | "converting";

export async function ensureDecodableSource(
  file: File,
  onStatus?: (status: DecodePrepStatus) => void,
  onConvertProgress?: (ratio: number) => void,
): Promise<File> {
  onStatus?.("probing");
  const ffmpeg = await loadFFmpeg();
  const probeName = `probe${extOf(file.name)}`;
  await ffmpeg.writeFile(probeName, await fetchFile(file));
  let codec: string | null;
  try {
    codec = await detectVideoCodec(ffmpeg, probeName);
  } finally {
    await ffmpeg.deleteFile(probeName).catch(() => {});
  }

  if (codec !== "av1") return file;

  onStatus?.("converting");
  const converted = await transcodeApi.transcode(file, onConvertProgress);
  const convertedName = `${file.name.replace(/\.[^.]+$/, "")}-h264.mp4`;
  return new File([converted], convertedName, { type: "video/mp4" });
}

function extOf(filename: string): string {
  const match = /\.[a-zA-Z0-9]+$/.exec(filename);
  return match ? match[0] : ".mp4";
}

async function ensureFont(ffmpeg: FFmpeg): Promise<void> {
  if (!dejaVuFontBytes) {
    dejaVuFontBytes = await fetchFile("/fonts/DejaVuSans-Bold.ttf");
  }
  if (!komikaFontBytes) {
    komikaFontBytes = await fetchFile("/fonts/KomikaAxis.ttf");
  }
  try {
    await ffmpeg.createDir("/fonts");
  } catch {
    // already exists
  }
  // writeFile() transfers (detaches) the Uint8Array's underlying buffer to
  // the worker via postMessage, so writing the cached array directly would
  // leave it detached and unusable on the next chunk's export — .slice()
  // copies into a fresh buffer each time, leaving the cached original intact.
  await ffmpeg.writeFile("/fonts/DejaVuSans-Bold.ttf", dejaVuFontBytes.slice());
  await ffmpeg.writeFile("/fonts/KomikaAxis.ttf", komikaFontBytes.slice());
}

export async function extractAudio(file: File, onProgress?: (ratio: number) => void): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  const inputName = `audio_src${extOf(file.name)}`;
  const outputName = "audio_out.wav";

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  progressHandler = onProgress;

  try {
    await execOrThrow(ffmpeg, ["-i", inputName, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", outputName]);
  } finally {
    progressHandler = undefined;
  }

  const data = await ffmpeg.readFile(outputName);
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return new Blob([data as BlobPart], { type: "audio/wav" });
}

export interface ComposeBrainrotParams {
  sourceFile: File;
  gameplayFile: File;
  // Subtitles are optional: omit to export the plain overlay (source on top,
  // gameplay on bottom) with no burned-in captions.
  assContent?: string;
  onProgress?: (ratio: number) => void;
  // Which slice of the source clip to encode; omit to use the whole file.
  sourceWindow?: Chunk;
  // Which slice of the gameplay clip to encode alongside sourceWindow. When
  // the gameplay clip is shorter than the window's end time, set `loop` so
  // it repeats to cover it instead of running out partway through the chunk.
  gameplayWindow?: Chunk & { loop: boolean };
}

// 720x1280 (half-width, half-height per half) instead of 1080x1920: cuts
// per-frame memory more than half, which matters because ffmpeg.wasm runs
// single-threaded in the tab's own heap and a full 1080x1920 encode can
// abort with an out-of-memory crash on longer or heavier clips. 720p is
// still plenty sharp for a vertical video watched on a phone.
const OUTPUT_WIDTH = 720;
const OUTPUT_HALF_HEIGHT = 640;

// Forced on both chains before vstack. Without a common frame rate, vstack
// has to reconcile two different input timebases itself — seen in practice
// with a 15fps source next to a 24fps gameplay clip, it did this by
// duplicating frames to paper over the mismatch, spiraling into hundreds of
// thousands of duplicate frames (each still fully encoded) instead of the
// few hundred the clip actually needed, which alone was enough to exhaust
// memory. A single fixed rate up front means vstack never sees a mismatch.
const OUTPUT_FPS = 30;

function buildFilterComplex(hasSubtitles: boolean, gameplayTrim?: Chunk): string {
  const stackOutput = hasSubtitles ? "[stacked]" : "[outv]";
  const half = `${OUTPUT_WIDTH}:${OUTPUT_HALF_HEIGHT}`;
  // Only needed when the gameplay input is looped (-stream_loop below): its
  // window can't be seeked to directly since it doesn't correspond to a real
  // position in the file, so it's windowed post-decode instead.
  const bottomTrim = gameplayTrim
    ? `trim=start=${gameplayTrim.start}:duration=${gameplayTrim.duration},setpts=PTS-STARTPTS,`
    : "";
  let filter =
    `[0:v]fps=${OUTPUT_FPS},scale=${half}:force_original_aspect_ratio=increase,crop=${half},setsar=1[top];` +
    `[1:v]${bottomTrim}fps=${OUTPUT_FPS},scale=${half}:force_original_aspect_ratio=increase,crop=${half},setsar=1[bottom];` +
    `[top][bottom]vstack=inputs=2${stackOutput}`;
  if (hasSubtitles) {
    filter += ";[stacked]subtitles=subs.ass:fontsdir=/fonts[outv]";
  }
  return filter;
}

// Stacks the source clip on top and the gameplay clip on the bottom into a
// 1080x1920 (9:16) canvas, optionally burning in the subtitle track.
export async function composeBrainrotVideo({
  sourceFile,
  gameplayFile,
  assContent,
  onProgress,
  sourceWindow,
  gameplayWindow,
}: ComposeBrainrotParams): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  const hasSubtitles = Boolean(assContent);
  if (hasSubtitles) {
    await ensureFont(ffmpeg);
  }

  const sourceName = `source${extOf(sourceFile.name)}`;
  const gameplayExt = extOf(gameplayFile.name);
  const gameplayName = `gameplay${gameplayExt}`;
  const outputName = "output.mp4";

  await ffmpeg.writeFile(sourceName, await fetchFile(sourceFile));

  // A non-looped gameplay window is extracted into its own small clip via a
  // separate, cheap stream-copy pass (no decode/encode) *before* the heavy
  // compose step below, instead of writing the gameplay file's full bytes
  // into ffmpeg's in-memory filesystem just to use a 30s slice of it — with
  // a large gameplay file (seen in practice: 200MB) that alone was enough to
  // blow the WASM heap on the very first chunk. A looped window can't be
  // pre-extracted this way (see the note further down), so it still writes
  // the full file and gets windowed post-decode via the `trim` filter.
  if (gameplayWindow && !gameplayWindow.loop) {
    const rawName = `gameplay_raw${gameplayExt}`;
    await ffmpeg.writeFile(rawName, await fetchFile(gameplayFile));
    try {
      await execOrThrow(ffmpeg, [
        "-ss",
        String(gameplayWindow.start),
        "-t",
        String(gameplayWindow.duration),
        "-i",
        rawName,
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        gameplayName,
      ]);
    } finally {
      await ffmpeg.deleteFile(rawName).catch(() => {});
    }
  } else {
    await ffmpeg.writeFile(gameplayName, await fetchFile(gameplayFile));
  }

  if (hasSubtitles) {
    await ffmpeg.writeFile("subs.ass", assContent!);
  }

  // Direct (non-looped) source windows are seeked before -i (fast, accurate
  // — real positions in the file). The gameplay window, if not looped, was
  // already extracted into its own clip above, so it needs no further
  // windowing here. A looped gameplay window can't be pre-extracted (or
  // seeked directly): -stream_loop replays the whole file, so its window is
  // instead cut post-decode via the `trim` filter in buildFilterComplex.
  const sourceInputArgs = sourceWindow
    ? ["-ss", String(sourceWindow.start), "-t", String(sourceWindow.duration)]
    : [];
  const gameplayInputArgs = gameplayWindow?.loop ? ["-stream_loop", "-1"] : [];
  const gameplayTrim = gameplayWindow?.loop ? gameplayWindow : undefined;

  const filterComplex = buildFilterComplex(hasSubtitles, gameplayTrim);

  progressHandler = onProgress;

  try {
    await execOrThrow(ffmpeg, [
      ...sourceInputArgs,
      "-i",
      sourceName,
      ...gameplayInputArgs,
      "-i",
      gameplayName,
      "-filter_complex",
      filterComplex,
      "-map",
      "[outv]",
      "-map",
      "0:a?",
      // Drops all container/stream metadata carried over from the source and
      // gameplay inputs (creation_time, device/GPS tags, etc.) instead of
      // passing it through to the output. `-metadata encoder=` alone can't
      // suppress the mp4 muxer's own "encoder"/version tag — the mov muxer
      // writes that one itself at write_header time regardless — so
      // `+bitexact` is needed too: it's the flag that actually omits
      // identifying library/version strings from the output.
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      "-threads",
      String(pickThreadCount()),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      outputName,
    ]);
  } finally {
    progressHandler = undefined;
  }

  const data = await ffmpeg.readFile(outputName);

  const cleanup = [ffmpeg.deleteFile(sourceName), ffmpeg.deleteFile(gameplayName), ffmpeg.deleteFile(outputName)];
  if (hasSubtitles) cleanup.push(ffmpeg.deleteFile("subs.ass"));
  await Promise.all(cleanup);

  if ((data as Uint8Array).byteLength === 0) {
    throw new FFmpegExecError("ffmpeg produjo un archivo vacío — revisa que ambos videos tengan el mismo formato/duración válidos");
  }

  return new Blob([data as BlobPart], { type: "video/mp4" });
}

// Joins 2+ parts previously produced by composeBrainrotVideo (same codec,
// resolution and fps by construction) into one file via ffmpeg's concat
// demuxer with a stream copy — no re-encode, so it's cheap and doesn't add to
// the per-part memory footprint the 30s chunking exists to keep low.
export async function concatVideoParts(parts: Blob[]): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  const names = parts.map((_, i) => `concat_part_${i}.mp4`);
  const listName = "concat_list.txt";
  const outputName = "concat_output.mp4";

  for (const [i, part] of parts.entries()) {
    await ffmpeg.writeFile(names[i], await fetchFile(part));
  }
  await ffmpeg.writeFile(listName, names.map((name) => `file '${name}'`).join("\n") + "\n");

  try {
    await execOrThrow(ffmpeg, ["-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", outputName]);

    const data = await ffmpeg.readFile(outputName);
    if ((data as Uint8Array).byteLength === 0) {
      throw new FFmpegExecError("ffmpeg produjo un archivo vacío al juntar las partes");
    }
    return new Blob([data as BlobPart], { type: "video/mp4" });
  } finally {
    await Promise.all([
      ...names.map((n) => ffmpeg.deleteFile(n).catch(() => {})),
      ffmpeg.deleteFile(listName).catch(() => {}),
      ffmpeg.deleteFile(outputName).catch(() => {}),
    ]);
  }
}
