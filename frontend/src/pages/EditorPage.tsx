import { useState } from "react";
import JSZip from "jszip";
import { ApiError, transcriptionApi, type TranscriptWord } from "../lib/api";
import { buildAssSubtitles, sliceWordsForChunk, type PartLabel } from "../lib/ass";
import {
  assertWithinMemoryBudget,
  composeBrainrotVideo,
  concatVideoParts,
  ensureDecodableSource,
  extractAudio,
  getVideoDuration,
  groupChunksIntoMinuteParts,
  MAX_CHUNK_SECONDS,
  planChunks,
  planGameplayWindow,
  VideoTooLargeError,
} from "../lib/ffmpeg";
import { VideoDropzone } from "../components/VideoDropzone";
import { GameplayPicker } from "../components/GameplayPicker";
import { Switch } from "../components/Switch";
import { Button } from "../components/base/buttons/button";
import { ProgressBarBase } from "../components/base/progress-indicators/progress-indicators";
import { Badge } from "../components/base/badges/badges";

type Stage =
  | "idle"
  | "converting"
  | "extracting-audio"
  | "transcribing"
  | "ready"
  | "exporting"
  | "done";

interface ExportResult {
  url: string;
  blob: Blob;
  label: string;
  filename: string;
}

export function EditorPage() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [gameplayFile, setGameplayFile] = useState<File | null>(null);
  const [gameplayId, setGameplayId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [words, setWords] = useState<TranscriptWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ExportResult[]>([]);
  const [chunkInfo, setChunkInfo] = useState<{ index: number; total: number } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [showPartLabel, setShowPartLabel] = useState(false);
  const [joinMinuteParts, setJoinMinuteParts] = useState(false);

  const busy =
    stage === "converting" || stage === "extracting-audio" || stage === "transcribing" || stage === "exporting";

  function reset(nextStage: Stage = "idle") {
    setError(null);
    setProgress(0);
    setStage(nextStage);
  }

  async function handleGenerateSubtitles() {
    if (!sourceFile || !gameplayFile) {
      setError("Sube el clip fuente y el gameplay de fondo primero");
      return;
    }
    reset();
    try {
      assertWithinMemoryBudget([sourceFile, gameplayFile]);
      const readySource = await ensureDecodableSource(
        sourceFile,
        (status) => {
          if (status === "converting") {
            setStage("converting");
            setProgress(0);
          }
        },
        setProgress,
      );
      if (readySource !== sourceFile) setSourceFile(readySource);

      setStage("extracting-audio");
      const audioBlob = await extractAudio(readySource, setProgress);

      setStage("transcribing");
      setProgress(0);
      const transcript = await transcriptionApi.transcribe(audioBlob);

      if (transcript.words.length === 0) {
        setError("No se detectó voz en el clip fuente. Revisa que tenga audio hablado.");
        setStage("idle");
        return;
      }

      setWords(transcript.words);
      setStage("ready");
    } catch (err) {
      console.error("[molko] handleGenerateSubtitles failed:", err);
      setError(describeError(err));
      setStage("idle");
    }
  }

  async function handleExport(withSubtitles: boolean) {
    if (!sourceFile || !gameplayFile) return;
    if (withSubtitles && !words) return;

    setError(null);
    setStage("exporting");
    setProgress(0);
    setChunkInfo(null);
    for (const prev of results) URL.revokeObjectURL(prev.url);
    setResults([]);

    try {
      assertWithinMemoryBudget([sourceFile, gameplayFile]);
      const readySource = await ensureDecodableSource(
        sourceFile,
        (status) => {
          if (status === "converting") {
            setStage("converting");
            setProgress(0);
          }
        },
        setProgress,
      );
      if (readySource !== sourceFile) setSourceFile(readySource);
      setStage("exporting");

      const [sourceDuration, gameplayDuration] = await Promise.all([
        getVideoDuration(readySource),
        getVideoDuration(gameplayFile),
      ]);
      // A clip longer than MAX_CHUNK_SECONDS gets split into consecutive
      // parts instead of rejected — each one is its own full export. When
      // "1 minuto por parte" is on, consecutive pairs of those ~30s chunks
      // are grouped here and concatenated below into a single ~60s file —
      // each half is still composed independently at the same memory-safe
      // 30s window, only the final files change.
      const chunks = planChunks(sourceDuration);
      const groups = joinMinuteParts ? groupChunksIntoMinuteParts(chunks) : chunks.map((chunk) => [chunk]);

      const newResults: ExportResult[] = [];
      let stepIndex = 0;
      for (const [groupIndex, group] of groups.entries()) {
        const partBlobs: Blob[] = [];
        for (const chunk of group) {
          setChunkInfo({ index: stepIndex, total: chunks.length });
          setProgress(0);

          const chunkWords = withSubtitles && words ? sliceWordsForChunk(words, chunk.start, chunk.duration) : [];
          const partLabel: PartLabel | undefined =
            showPartLabel && groups.length > 1 ? { number: groupIndex + 1, duration: chunk.duration } : undefined;
          const assContent =
            chunkWords.length > 0 || partLabel ? buildAssSubtitles(chunkWords, partLabel) : undefined;

          const blob = await composeBrainrotVideo({
            sourceFile: readySource,
            gameplayFile,
            assContent,
            onProgress: setProgress,
            sourceWindow: chunk,
            gameplayWindow: planGameplayWindow(chunk, gameplayDuration),
          });
          partBlobs.push(blob);
          stepIndex++;
        }

        const blob = partBlobs.length > 1 ? await concatVideoParts(partBlobs) : partBlobs[0];

        newResults.push({
          url: URL.createObjectURL(blob),
          blob,
          label: groups.length > 1 ? `Parte ${groupIndex + 1} de ${groups.length}` : "video",
          filename: groups.length > 1 ? `molko-brainrot-parte-${groupIndex + 1}.mp4` : "molko-brainrot.mp4",
        });
        setResults([...newResults]);
      }

      setStage("done");
    } catch (err) {
      console.error("[molko] handleExport failed:", err);
      setError(describeError(err));
      setStage(words ? "ready" : "idle");
    } finally {
      setChunkInfo(null);
    }
  }

  async function handleDownloadAllAsZip() {
    if (results.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const result of results) {
        zip.file(result.filename, result.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "molko-brainrot-partes.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="w-full max-w-3xl rounded-2xl bg-primary p-6 shadow-xl ring-1 ring-secondary sm:p-8">
      <h1 className="text-2xl font-bold text-primary">Nuevo video brainrot</h1>
      <p className="mt-2 text-sm text-tertiary">
        Todo el procesamiento ocurre en tu navegador. Un clip fuente más largo de {MAX_CHUNK_SECONDS}s se exporta en
        varias partes automáticamente. Si el clip viene en AV1 (que el navegador no puede decodificar), se manda una
        sola vez al backend local para convertirlo a H.264 antes de seguir.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <VideoDropzone
          label="1. Clip fuente (con audio)"
          file={sourceFile}
          onSelect={setSourceFile}
          disabled={busy}
        />
        <GameplayPicker
          selectedId={gameplayId}
          onSelect={(file, option) => {
            setGameplayFile(file);
            setGameplayId(option.id);
          }}
          disabled={busy}
        />
      </div>

      {error && <p className="mt-4 text-sm text-error-primary">{error}</p>}

      {(stage === "idle" || stage === "ready") && (
        <div className="mt-6 flex flex-col gap-4">
          <Switch
            checked={showPartLabel}
            onChange={setShowPartLabel}
            disabled={busy}
            label='Mostrar "Parte N" en el centro de cada parte'
            hint="Solo aplica si el export queda dividido en varias partes"
          />
          <Switch
            checked={joinMinuteParts}
            onChange={setJoinMinuteParts}
            disabled={busy}
            label="Partes de 1 minuto en vez de 30s"
            hint="Junta cada dos partes de 30s en un solo archivo de ~1 minuto"
          />
        </div>
      )}

      {stage === "idle" && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button color="success" onClick={() => handleExport(false)} isDisabled={!sourceFile || !gameplayFile}>
            Exportar sin subtítulos
          </Button>
          <Button color="success" onClick={handleGenerateSubtitles} isDisabled={!sourceFile || !gameplayFile}>
            Generar subtítulos
          </Button>
        </div>
      )}

      {stage === "converting" && (
        <StageProgress label="Convirtiendo clip de AV1 a H.264 en el backend…" ratio={progress} />
      )}
      {stage === "extracting-audio" && <StageProgress label="Extrayendo audio del clip…" ratio={progress} />}
      {stage === "transcribing" && <StageProgress label="Transcribiendo audio…" ratio={undefined} />}

      {stage === "ready" && words && (
        <div className="mt-6 border-t border-secondary pt-4">
          <h2 className="text-md font-semibold text-primary">Transcripción detectada</h2>
          <p className="mt-2 text-sm text-tertiary">{words.map((w) => w.word).join(" ")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button color="success" onClick={handleGenerateSubtitles}>
              Regenerar subtítulos
            </Button>
            <Button color="success" onClick={() => handleExport(true)}>
              Exportar con subtítulos
            </Button>
          </div>
        </div>
      )}

      {stage === "exporting" && (
        <StageProgress
          label={
            chunkInfo && chunkInfo.total > 1
              ? `Componiendo parte ${chunkInfo.index + 1} de ${chunkInfo.total}…`
              : "Componiendo video final…"
          }
          ratio={progress}
        />
      )}

      {stage === "done" && results.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-8">
          {results.length > 1 && (
            <Button color="success" onClick={handleDownloadAllAsZip} isDisabled={zipping} isLoading={zipping}>
              {zipping ? "Preparando ZIP…" : `Descargar todo (${results.length} partes en .zip)`}
            </Button>
          )}
          {results.map((result) => (
            <div
              key={result.url}
              className="flex w-full max-w-xs flex-col items-center gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary"
            >
              {results.length > 1 && <Badge color="success">{result.label}</Badge>}
              <video src={result.url} controls className="w-full rounded-lg" />
              <Button color="success" href={result.url} download={result.filename} className="w-full">
                Descargar {result.label}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StageProgress({ label, ratio }: { label: string; ratio: number | undefined }) {
  const value = ratio !== undefined ? Math.max(0, Math.min(100, Math.round(ratio * 100))) : 30;
  return (
    <div className="mt-6">
      <p className="mb-2 text-sm text-tertiary">{label}</p>
      <ProgressBarBase value={value} className={ratio === undefined ? "animate-pulse" : undefined} />
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof VideoTooLargeError) return err.message;
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}
