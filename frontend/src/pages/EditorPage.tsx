import { useState } from "react";
import { ApiError, transcriptionApi, type TranscriptWord } from "../lib/api";
import { buildAssSubtitles } from "../lib/ass";
import { assertWithinMemoryBudget, composeBrainrotVideo, extractAudio, VideoTooLargeError } from "../lib/ffmpeg";
import { VideoDropzone } from "../components/VideoDropzone";

type Stage =
  | "idle"
  | "extracting-audio"
  | "transcribing"
  | "ready"
  | "exporting"
  | "done";

export function EditorPage() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [gameplayFile, setGameplayFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [words, setWords] = useState<TranscriptWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

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
      setError(describeError(err));
      setStage("idle");
    }
  }

  async function handleExport() {
    if (!sourceFile || !gameplayFile || !words) return;
    setError(null);
    setStage("exporting");
    setProgress(0);
    try {
      const assContent = buildAssSubtitles(words);
      const blob = await composeBrainrotVideo({
        sourceFile,
        gameplayFile,
        assContent,
        onProgress: setProgress,
      });
      setResultUrl(URL.createObjectURL(blob));
      setStage("done");
    } catch (err) {
      setError(describeError(err));
      setStage("ready");
    }
  }

  return (
    <div className="card editor">
      <h1>Nuevo video brainrot</h1>
      <p className="muted">
        Todo el procesamiento ocurre en tu navegador — tus videos no se suben a ningún servidor.
      </p>

      <div className="dropzone-row">
        <VideoDropzone
          label="1. Clip fuente (con audio)"
          file={sourceFile}
          onSelect={setSourceFile}
          disabled={busy}
        />
        <VideoDropzone
          label="2. Gameplay de fondo"
          file={gameplayFile}
          onSelect={setGameplayFile}
          disabled={busy}
        />
      </div>

      {error && <p className="error">{error}</p>}

      {stage === "idle" && (
        <button className="button" onClick={handleGenerateSubtitles} disabled={!sourceFile || !gameplayFile}>
          Generar subtítulos
        </button>
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
            <button className="button" onClick={handleExport}>
              Exportar video
            </button>
          </div>
        </div>
      )}

      {stage === "exporting" && <ProgressBar label="Componiendo video final…" ratio={progress} />}

      {stage === "done" && resultUrl && (
        <div className="export-result">
          <video src={resultUrl} controls className="preview-video" />
          <a className="button" href={resultUrl} download="molko-brainrot.mp4">
            Descargar video
          </a>
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
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}
