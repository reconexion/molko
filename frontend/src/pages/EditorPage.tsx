import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { useI18n, t as translate } from "../i18n";
import { ApiError } from "../lib/api";
import { buildAssSubtitles, type PartLabel } from "../lib/ass";
import {
  assertWithinMemoryBudget,
  composeBrainrotVideo,
  concatVideoParts,
  ensureDecodableSource,
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

type Stage = "idle" | "converting" | "exporting" | "done";

interface ExportResult {
  url: string;
  blob: Blob;
  /** Número de parte, o null cuando el export es un solo video. */
  part: number | null;
  totalParts: number;
}

interface EditorPageProps {
  initialSourceFile?: File | null;
}

export function EditorPage({ initialSourceFile = null }: EditorPageProps) {
  const { t } = useI18n();
  const [sourceFile, setSourceFile] = useState<File | null>(initialSourceFile);
  const [gameplayFile, setGameplayFile] = useState<File | null>(null);
  const [gameplayId, setGameplayId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ExportResult[]>([]);
  const [chunkInfo, setChunkInfo] = useState<{ index: number; total: number } | null>(null);
  const [zipping, setZipping] = useState(false);
  const [showPartLabel, setShowPartLabel] = useState(false);
  const [joinMinuteParts, setJoinMinuteParts] = useState(false);

  const busy = stage === "converting" || stage === "exporting";

  // Progreso combinado de todas las partes del export (no solo la parte actual),
  // para poder estimar el tiempo restante del proceso completo.
  const exportOverallRatio =
    stage === "exporting" && chunkInfo ? (chunkInfo.index + progress) / chunkInfo.total : undefined;

  const convertingEta = useEtaSeconds(stage === "converting", stage === "converting" ? progress : undefined);
  const exportingEta = useEtaSeconds(stage === "exporting", exportOverallRatio);

  const modalStageInfo: { title: string; ratio: number | undefined; etaSeconds: number | null } | null =
    stage === "converting"
      ? { title: t("editor.stage.converting"), ratio: progress, etaSeconds: convertingEta }
      : stage === "exporting"
        ? {
            title:
              chunkInfo && chunkInfo.total > 1
                ? t("editor.stage.composingPart", { index: chunkInfo.index + 1, total: chunkInfo.total })
                : t("editor.stage.composingFinal"),
            ratio: exportOverallRatio,
            etaSeconds: exportingEta,
          }
        : null;

  async function handleExport() {
    if (!sourceFile || !gameplayFile) return;

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

          const partLabel: PartLabel | undefined =
            showPartLabel && groups.length > 1
              ? { text: t("editor.overlay.part", { n: groupIndex + 1 }), duration: chunk.duration }
              : undefined;
          const assContent = partLabel ? buildAssSubtitles([], partLabel) : undefined;

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
          part: groups.length > 1 ? groupIndex + 1 : null,
          totalParts: groups.length,
        });
        setResults([...newResults]);
      }

      setStage("done");
    } catch (err) {
      console.error("[molko] handleExport failed:", err);
      setError(describeError(err));
      setStage("idle");
    } finally {
      setChunkInfo(null);
    }
  }

  // Etiqueta y nombre de archivo se calculan al mostrar, para que sigan el idioma activo.
  const labelFor = (result: ExportResult) =>
    result.part === null
      ? t("editor.result.single")
      : t("editor.result.part", { n: result.part, total: result.totalParts });
  const filenameFor = (result: ExportResult) =>
    result.part === null ? t("editor.file.single") : t("editor.file.part", { n: result.part });

  async function handleDownloadAllAsZip() {
    if (results.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const result of results) {
        zip.file(filenameFor(result), result.blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = t("editor.file.zip");
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
      <h2 className="text-2xl font-bold text-primary">{t("editor.title")}</h2>
      <p className="mt-2 text-sm text-tertiary">{t("editor.description", { seconds: MAX_CHUNK_SECONDS })}</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <VideoDropzone
          label={t("editor.source.label")}
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

      {stage === "idle" && (
        <div className="mt-6 flex flex-col gap-4">
          <Switch
            checked={showPartLabel}
            onChange={setShowPartLabel}
            disabled={busy}
            label={t("editor.switch.partLabel")}
            hint={t("editor.switch.partLabel.hint")}
          />
          <Switch
            checked={joinMinuteParts}
            onChange={setJoinMinuteParts}
            disabled={busy}
            label={t("editor.switch.minute")}
            hint={t("editor.switch.minute.hint")}
          />
        </div>
      )}

      {stage === "idle" && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button color="success" onClick={handleExport} isDisabled={!sourceFile || !gameplayFile}>
            {t("editor.export")}
          </Button>
        </div>
      )}

      {modalStageInfo && (
        <ProcessingModal
          title={modalStageInfo.title}
          ratio={modalStageInfo.ratio}
          etaSeconds={modalStageInfo.etaSeconds}
        />
      )}

      {stage === "done" && results.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-8">
          {results.length > 1 && (
            <Button color="success" onClick={handleDownloadAllAsZip} isDisabled={zipping} isLoading={zipping}>
              {zipping ? t("editor.result.zipping") : t("editor.result.zipAll", { n: results.length })}
            </Button>
          )}
          {results.map((result) => (
            <div
              key={result.url}
              className="flex w-full max-w-xs flex-col items-center gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary"
            >
              {results.length > 1 && <Badge color="success">{labelFor(result)}</Badge>}
              <video src={result.url} controls className="w-full rounded-lg" />
              <Button color="success" href={result.url} download={filenameFor(result)} className="w-full">
                {t("editor.result.download", { label: labelFor(result) })}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Estima el tiempo restante extrapolando a partir de lo que ya se tardó en
 * llegar al progreso actual (elapsed / ratio = tiempo total estimado). Es un
 * aproximado real basado en la velocidad observada, no un número inventado:
 * se ignoran las primeras muestras (ratio o tiempo transcurrido muy chicos)
 * porque ahí la extrapolación es muy ruidosa, y se suaviza con un promedio
 * móvil para que el número no salte de un frame a otro.
 */
function useEtaSeconds(active: boolean, ratio: number | undefined): number | null {
  const startRef = useRef<number | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      smoothedRef.current = null;
      setEtaSeconds(null);
      return;
    }
    if (startRef.current === null) startRef.current = Date.now();
  }, [active]);

  useEffect(() => {
    if (!active || ratio === undefined || startRef.current === null) return;
    const elapsedMs = Date.now() - startRef.current;
    if (ratio < 0.04 || elapsedMs < 1200) return;

    const remainingMs = Math.max(0, elapsedMs / ratio - elapsedMs);
    const remainingSec = remainingMs / 1000;
    smoothedRef.current =
      smoothedRef.current === null ? remainingSec : smoothedRef.current * 0.75 + remainingSec * 0.25;
    setEtaSeconds(Math.round(smoothedRef.current));
  }, [active, ratio]);

  return etaSeconds;
}

function formatEta(seconds: number): string {
  const rounded = Math.max(5, Math.round(seconds / 5) * 5);
  if (rounded < 60) return `~${rounded} s`;
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return secs === 0 ? `~${mins} min` : `~${mins} min ${secs} s`;
}

function ProcessingModal({
  title,
  ratio,
  etaSeconds,
}: {
  title: string;
  ratio: number | undefined;
  etaSeconds: number | null;
}) {
  const { t } = useI18n();
  const percent = ratio !== undefined ? Math.max(0, Math.min(100, Math.round(ratio * 100))) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-primary p-6 text-center shadow-xl ring-1 ring-secondary">
        <svg fill="none" viewBox="0 0 20 20" className="mx-auto mb-4 size-10 text-primary">
          <circle className="stroke-current opacity-25" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
          <circle
            className="origin-center animate-spin stroke-current"
            cx="10"
            cy="10"
            r="8"
            fill="none"
            strokeWidth="2"
            strokeDasharray="12.5 50"
            strokeLinecap="round"
          />
        </svg>

        <h2 className="text-md font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-sm text-tertiary">
          {t("editor.modal.notice")}
        </p>

        <div className="mt-5">
          <ProgressBarBase value={percent ?? 30} className={percent === undefined ? "animate-pulse" : undefined} />
          {percent !== undefined && <p className="mt-2 text-sm font-medium text-secondary tabular-nums">{percent}%</p>}
        </div>

        <p className="mt-3 text-sm font-medium text-brand-secondary">
          {etaSeconds !== null
            ? t("editor.modal.eta", { eta: formatEta(etaSeconds) })
            : percent !== undefined
              ? t("editor.modal.calculating")
              : t("editor.modal.typical")}
        </p>
      </div>
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof VideoTooLargeError) return err.message;
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return translate("errors.unexpected");
}
