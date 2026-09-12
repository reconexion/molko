import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Hard caps on upload size. ffmpeg.wasm runs single-threaded in the tab's own
// heap, so a very large source/gameplay pair can exhaust browser memory and
// crash the tab instead of failing gracefully — we reject early with a clear
// message rather than let that happen mid-export.
export const MAX_FILE_BYTES = 300 * 1024 * 1024; // 300MB per video
export const MAX_COMBINED_BYTES = 450 * 1024 * 1024; // 450MB source + gameplay combined

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

let ffmpegSingleton: FFmpeg | null = null;
let progressHandler: ((ratio: number) => void) | undefined;
let fontBytes: Uint8Array | null = null;

export async function loadFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;

  const ffmpeg = ffmpegSingleton ?? new FFmpeg();
  ffmpegSingleton = ffmpeg;

  ffmpeg.on("log", ({ message }) => onLog?.(message));
  ffmpeg.on("progress", ({ progress }) => progressHandler?.(progress));

  if (!ffmpeg.loaded) {
    const baseURL = "/ffmpeg";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
  }

  return ffmpeg;
}

function extOf(filename: string): string {
  const match = /\.[a-zA-Z0-9]+$/.exec(filename);
  return match ? match[0] : ".mp4";
}

async function ensureFont(ffmpeg: FFmpeg): Promise<void> {
  if (!fontBytes) {
    fontBytes = await fetchFile("/fonts/DejaVuSans-Bold.ttf");
  }
  try {
    await ffmpeg.createDir("/fonts");
  } catch {
    // already exists
  }
  await ffmpeg.writeFile("/fonts/DejaVuSans-Bold.ttf", fontBytes);
}

export async function extractAudio(file: File, onProgress?: (ratio: number) => void): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  const inputName = `audio_src${extOf(file.name)}`;
  const outputName = "audio_out.wav";

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  progressHandler = onProgress;

  try {
    await ffmpeg.exec(["-i", inputName, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", outputName]);
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
}

function buildFilterComplex(hasSubtitles: boolean): string {
  const stackOutput = hasSubtitles ? "[stacked]" : "[outv]";
  let filter =
    "[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[top];" +
    "[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[bottom];" +
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
}: ComposeBrainrotParams): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  const hasSubtitles = Boolean(assContent);
  if (hasSubtitles) {
    await ensureFont(ffmpeg);
  }

  const sourceName = `source${extOf(sourceFile.name)}`;
  const gameplayName = `gameplay${extOf(gameplayFile.name)}`;
  const outputName = "output.mp4";

  await ffmpeg.writeFile(sourceName, await fetchFile(sourceFile));
  await ffmpeg.writeFile(gameplayName, await fetchFile(gameplayFile));
  if (hasSubtitles) {
    await ffmpeg.writeFile("subs.ass", assContent!);
  }

  const filterComplex = buildFilterComplex(hasSubtitles);

  progressHandler = onProgress;

  try {
    await ffmpeg.exec([
      "-i",
      sourceName,
      "-i",
      gameplayName,
      "-filter_complex",
      filterComplex,
      "-map",
      "[outv]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
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

  return new Blob([data as BlobPart], { type: "video/mp4" });
}
