import { useState } from "react";
import { gameplayOptions, loadGameplayFile, type GameplayOption } from "../lib/gameplays";

interface GameplayPickerProps {
  selectedId: string | null;
  onSelect: (file: File, option: GameplayOption) => void;
  disabled?: boolean;
}

export function GameplayPicker({ selectedId, onSelect, disabled }: GameplayPickerProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(option: GameplayOption) {
    if (disabled || loadingId) return;
    setError(null);
    setLoadingId(option.id);
    try {
      const file = await loadGameplayFile(option);
      onSelect(file, option);
    } catch {
      setError(`No se pudo cargar "${option.label}"`);
    } finally {
      setLoadingId(null);
    }
  }

  if (gameplayOptions.length === 0) {
    return (
      <div className="dropzone dropzone-disabled">
        <p className="dropzone-label">2. Gameplay de fondo</p>
        <p className="dropzone-hint">
          Todavía no hay gameplays disponibles. Agrega archivos de video a{" "}
          <code>frontend/src/assets/gameplays/</code> para que aparezcan aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="gameplay-picker">
      <p className="dropzone-label">2. Gameplay de fondo</p>
      <div className="gameplay-grid">
        {gameplayOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`gameplay-option ${selectedId === option.id ? "gameplay-option-selected" : ""}`}
            onClick={() => handlePick(option)}
            disabled={disabled || loadingId !== null}
          >
            {loadingId === option.id ? "Cargando…" : option.label}
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
