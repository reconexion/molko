import { useRef, useState, type DragEvent } from "react";
import { UploadCloud02 } from "@untitledui/icons";
import { FeaturedIcon } from "./foundations/featured-icon/featured-icon";
import { useI18n } from "../i18n";
import { cx } from "../utils/cx";

interface VideoDropzoneProps {
  label: string;
  file: File | null;
  onSelect: (file: File) => void;
  disabled?: boolean;
}

export function VideoDropzone({ label, file, onSelect, disabled }: VideoDropzoneProps) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onSelect(dropped);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-secondary">{label}</p>
      <div
        data-dropzone
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cx(
          "relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl bg-primary px-6 py-6 text-center ring-1 ring-secondary transition duration-100 ease-linear ring-inset",
          !disabled && "cursor-pointer",
          dragging && "ring-2 ring-brand",
          disabled && "cursor-not-allowed bg-secondary opacity-50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          disabled={disabled}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) onSelect(selected);
          }}
        />
        <FeaturedIcon icon={UploadCloud02} color="gray" theme="modern" size="md" />
        {file ? (
          <p className="max-w-full truncate text-sm font-medium text-secondary">
            {file.name} <span className="text-tertiary">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-sm">
              <span className="font-semibold text-brand-secondary">{t("dropzone.click")}</span>{" "}
              <span className="text-tertiary">{t("dropzone.drag")}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
