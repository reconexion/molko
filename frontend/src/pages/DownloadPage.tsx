import { useState } from "react";
import { ApiError, youtubeApi, type YoutubeAudioLang, type YoutubeQuality } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n, type MessageKey } from "../i18n";
import { Button } from "../components/base/buttons/button";
import { ProgressBarBase } from "../components/base/progress-indicators/progress-indicators";

const QUALITY_OPTIONS: YoutubeQuality[] = ["480p", "720p", "1080p", "2K", "4K"];

const AUDIO_LANG_OPTIONS: { id: YoutubeAudioLang; labelKey: MessageKey }[] = [
  { id: "original", labelKey: "audio.original" },
  { id: "es", labelKey: "audio.es" },
  { id: "en", labelKey: "audio.en" },
  { id: "pt", labelKey: "audio.pt" },
  { id: "fr", labelKey: "audio.fr" },
  { id: "de", labelKey: "audio.de" },
  { id: "ja", labelKey: "audio.ja" },
  { id: "ko", labelKey: "audio.ko" },
  { id: "it", labelKey: "audio.it" },
  { id: "ru", labelKey: "audio.ru" },
  { id: "hi", labelKey: "audio.hi" },
  { id: "ar", labelKey: "audio.ar" },
];

const TIME_REGEX = /^\d{2}:\d{2}:\d{2}$/;

interface DownloadPageProps {
  onUseInEditor: (file: File) => void;
}

export function DownloadPage({ onUseInEditor }: DownloadPageProps) {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const usage = user?.youtube;
  const unavailable = usage ? !usage.enabled || usage.used >= usage.limit : false;
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<YoutubeQuality>("1080p");
  const [audioLang, setAudioLang] = useState<YoutubeAudioLang>("original");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ file: File; url: string } | null>(null);

  const trimmedUrl = url.trim();
  const timeFieldsValid =
    (!startTime.trim() || TIME_REGEX.test(startTime.trim())) && (!endTime.trim() || TIME_REGEX.test(endTime.trim()));

  async function handleDownload() {
    if (!trimmedUrl.includes("youtube.com") && !trimmedUrl.includes("youtu.be")) {
      setError(t("download.error.invalidUrl"));
      return;
    }
    if (!timeFieldsValid) {
      setError(t("download.error.timeFormat"));
      return;
    }

    setError(null);
    setDownloading(true);
    setProgress(0);
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);

    try {
      const { file } = await youtubeApi.download({
        url: trimmedUrl,
        quality,
        audioLang,
        startTime: startTime.trim() || undefined,
        endTime: endTime.trim() || undefined,
        onProgress: setProgress,
      });
      setResult({ file, url: URL.createObjectURL(file) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("download.error.generic"));
    } finally {
      setDownloading(false);
      void refreshUser();
    }
  }

  return (
    <div className="w-full max-w-xl rounded-2xl bg-primary p-6 shadow-xl ring-1 ring-secondary sm:p-8">
      <h2 className="text-2xl font-bold text-primary">{t("download.title")}</h2>
      <p className="mt-2 text-sm text-tertiary">{t("download.description")}</p>
      {usage && (
        <p className="mt-2 text-sm font-medium text-secondary">
          {usage.enabled
            ? t("download.usage", { used: usage.used, limit: usage.limit })
            : t("download.disabled")}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <Field label={t("download.field.url")}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={downloading}
            className="w-full rounded-lg bg-primary px-3.5 py-2.5 text-sm text-primary ring-1 ring-secondary ring-inset outline-none placeholder:text-placeholder focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
          />
        </Field>

        <Field label={t("download.field.quality")}>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as YoutubeQuality)}
            disabled={downloading}
            className="w-full rounded-lg bg-primary px-3.5 py-2.5 text-sm text-primary ring-1 ring-secondary ring-inset outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {QUALITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("download.field.audio")}>
          <select
            value={audioLang}
            onChange={(e) => setAudioLang(e.target.value as YoutubeAudioLang)}
            disabled={downloading}
            className="w-full rounded-lg bg-primary px-3.5 py-2.5 text-sm text-primary ring-1 ring-secondary ring-inset outline-none focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {AUDIO_LANG_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("download.field.trim")}>
          <div className="grid grid-cols-2 gap-4">
            <input
              type="text"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="00:00:00"
              disabled={downloading}
              className="w-full rounded-lg bg-primary px-3.5 py-2.5 text-sm text-primary ring-1 ring-secondary ring-inset outline-none placeholder:text-placeholder focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
            />
            <input
              type="text"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="00:00:00"
              disabled={downloading}
              className="w-full rounded-lg bg-primary px-3.5 py-2.5 text-sm text-primary ring-1 ring-secondary ring-inset outline-none placeholder:text-placeholder focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </Field>
      </div>

      {error && <p className="mt-4 text-sm text-error-primary">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button color="success" onClick={handleDownload} isDisabled={!trimmedUrl || downloading || unavailable} isLoading={downloading}>
          {downloading ? t("download.button.loading") : t("download.button")}
        </Button>
      </div>

      {downloading && (
        <div className="mt-4 flex flex-col gap-2">
          <ProgressBarBase value={Math.round(progress * 100)} />
          <p className="text-sm text-tertiary tabular-nums">{Math.round(progress * 100)}%</p>
        </div>
      )}

      {result && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary">
          <video src={result.url} controls className="w-full max-w-xs rounded-lg" />
          <div className="flex flex-wrap justify-center gap-3">
            <Button color="success" onClick={() => onUseInEditor(result.file)}>
              {t("download.useInEditor")}
            </Button>
            <Button color="secondary" href={result.url} download={result.file.name}>
              {t("download.saveFile")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-secondary">{label}</span>
      {children}
    </div>
  );
}
