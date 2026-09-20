import { useState } from "react";
import { PlayCircle } from "@untitledui/icons";
import { gameplayOptions, loadGameplayFile, type GameplayOption } from "../lib/gameplays";
import { useI18n } from "../i18n";
import { SegmentedOptions } from "./SegmentedOptions";

interface GameplayPickerProps {
  selectedId: string | null;
  onSelect: (file: File, option: GameplayOption) => void;
  disabled?: boolean;
}

export function GameplayPicker({ selectedId, onSelect, disabled }: GameplayPickerProps) {
  const { t } = useI18n();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = gameplayOptions.find((o) => o.id === selectedId) ?? null;

  async function handlePick(option: GameplayOption) {
    if (disabled || loadingId) return;
    setError(null);
    setLoadingId(option.id);
    try {
      const file = await loadGameplayFile(option);
      onSelect(file, option);
    } catch {
      setError(t("gameplay.loadError", { name: option.label }));
    } finally {
      setLoadingId(null);
    }
  }

  if (gameplayOptions.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-secondary">{t("editor.gameplay.label")}</p>
        <div className="rounded-xl bg-secondary px-6 py-6 text-center ring-1 ring-secondary ring-inset">
          <p className="text-sm text-tertiary">
            {t("gameplay.empty.before")}{" "}
            <code className="text-quaternary">frontend/src/assets/gameplays/</code> {t("gameplay.empty.after")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-secondary">{t("editor.gameplay.label")}</p>
      <div className="flex flex-col gap-3 rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset">
        <GameplayPreview option={selectedOption} loading={loadingId !== null} />
        <SegmentedOptions
          options={gameplayOptions.map((o) => ({ id: o.id, label: o.label }))}
          selectedId={selectedId}
          loadingId={loadingId}
          disabled={disabled}
          onSelect={(id) => {
            const option = gameplayOptions.find((o) => o.id === id);
            if (option) handlePick(option);
          }}
        />
        {error && <p className="text-sm text-error-primary">{error}</p>}
      </div>
    </div>
  );
}

function GameplayPreview({ option, loading }: { option: GameplayOption | null; loading: boolean }) {
  const { t } = useI18n();

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-secondary ring-1 ring-secondary">
      {option ? (
        <video
          key={option.id}
          src={option.url}
          className="size-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-tertiary">
          <PlayCircle className="size-6" />
          <p className="text-xs">{t("gameplay.preview")}</p>
        </div>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-overlay/40 text-sm font-medium text-white">
          {t("gameplay.loading")}
        </div>
      )}
    </div>
  );
}
