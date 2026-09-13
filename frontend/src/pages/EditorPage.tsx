import { useState } from "react";
import { ApiError, transcriptionApi, type TranscriptWord } from "../lib/api";
import { buildAssSubtitles, sliceWordsForChunk } from "../lib/ass";
import {
  assertSourceDecodable,
  assertWithinMemoryBudget,
  composeBrainrotVideo,
  extractAudio,
  getVideoDuration,
  MAX_CHUNK_SECONDS,
  planChunks,
  planGameplayWindow,
  UnsupportedCodecError,
  VideoTooLargeError,
} from "../lib/ffmpeg";
import { VideoDropzone } from "../components/VideoDropzone";
import { GameplayPicker } from "../components/GameplayPicker";

type Stage =
  | "idle"
  | "extracting-audio"
  | "transcribing"
  | "ready"
  | "exporting"
  | "done";

interface ExportResult {
  url: string;
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

  const busy = stage === "extracting-audio" || stage === "transcribing" || stage === "exporting";

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
      await assertSourceDecodable(sourceFile);

      setStage("extracting-audio");
      const audioBlob = await extractAudio(sourceFile, setProgress);

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
      await assertSourceDecodable(sourceFile);

      const [sourceDuration, gameplayDuration] = await Promise.all([
        getVideoDuration(sourceFile),
        getVideoDuration(gameplayFile),
      ]);
      // A clip longer than MAX_CHUNK_SECONDS gets split into consecutive
      // parts instead of rejected — each one is its own full export.
      const chunks = planChunks(sourceDuration);

      const newResults: ExportResult[] = [];
      for (const [index, chunk] of chunks.entries()) {
        setChunkInfo({ index, total: chunks.length });
        setProgress(0);

        const chunkWords = withSubtitles && words ? sliceWordsForChunk(words, chunk.start, chunk.duration) : null;
        const assContent = chunkWords ? buildAssSubtitles(chunkWords) : undefined;

        const blob = await composeBrainrotVideo({
          sourceFile,
          gameplayFile,
          assContent,
          onProgress: setProgress,
          sourceWindow: chunk,
          gameplayWindow: planGameplayWindow(chunk, gameplayDuration),
        });

        newResults.push({
          url: URL.createObjectURL(blob),
          label: chunks.length > 1 ? `Parte ${index + 1} de ${chunks.length}` : "video",
          filename: chunks.length > 1 ? `molko-brainrot-parte-${index + 1}.mp4` : "molko-brainrot.mp4",
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

  return (
    <div className="card editor">
      <h1>Nuevo video brainrot</h1>
      <p className="muted">
        Todo el procesamiento ocurre en tu navegador — tus videos no se suben a ningún servidor. Un clip fuente más
        largo de {MAX_CHUNK_SECONDS}s se exporta en varias partes automáticamente.
      </p>

      <div className="dropzone-row">
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

      {error && <p className="error">{error}</p>}

      {stage === "idle" && (
        <div className="actions">
          <button
            className="button button-secondary"
            onClick={() => handleExport(false)}
            disabled={!sourceFile || !gameplayFile}
          >
            Exportar sin subtítulos
          </button>
          <button className="button" onClick={handleGenerateSubtitles} disabled={!sourceFile || !gameplayFile}>
            Generar subtítulos
          </button>
        </div>
      )}

      {stage === "extracting-audio" && <ProgressBar label="Extrayendo audio del clip…" ratio={progress} />}
      {stage === "transcribing" && <ProgressBar label="Transcribiendo audio…" ratio={undefined} />}

      {stage === "ready" && words && (
        <div className="transcript-preview">
          <h2>Transcripción detectada</h2>
          <p>{words.map((w) => w.word).join(" ")}</p>
          <div className="actions">
            <button className="button button-secondary" onClick={handleGenerateSubtitles}>
              Regenerar subtítulos
            </button>
            <button className="button" onClick={() => handleExport(true)}>
              Exportar con subtítulos
            </button>
          </div>
        </div>
      )}

      {stage === "exporting" && (
        <ProgressBar
          label={
            chunkInfo && chunkInfo.total > 1
              ? `Componiendo parte ${chunkInfo.index + 1} de ${chunkInfo.total}…`
              : "Componiendo video final…"
          }
          ratio={progress}
        />
      )}

      {stage === "done" && results.length > 0 && (
        <div className="export-result">
          {results.map((result) => (
            <div key={result.url} className="export-result-item">
              {results.length > 1 && <p className="export-result-label">{result.label}</p>}
              <video src={result.url} controls className="preview-video" />
              <a className="button" href={result.url} download={result.filename}>
                Descargar {result.label}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ label, ratio }: { label: string; ratio: number | undefined }) {
  return (
    <div className="progress">
      <p>{label}</p>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: ratio !== undefined ? `${Math.min(100, Math.round(ratio * 100))}%` : "30%" }}
        />
      </div>
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof VideoTooLargeError) return err.message;
  if (err instanceof UnsupportedCodecError) return err.message;
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}
