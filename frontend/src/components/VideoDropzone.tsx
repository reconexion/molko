import { useRef, useState, type DragEvent } from "react";

interface VideoDropzoneProps {
  label: string;
  file: File | null;
  onSelect: (file: File) => void;
  disabled?: boolean;
}

export function VideoDropzone({ label, file, onSelect, disabled }: VideoDropzoneProps) {
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
    <div
      className={`dropzone ${dragging ? "dropzone-active" : ""} ${disabled ? "dropzone-disabled" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
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
      <p className="dropzone-label">{label}</p>
      {file ? (
        <p className="dropzone-file">
          {file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)
        </p>
      ) : (
        <p className="dropzone-hint">Arrastra un video aquí o haz clic para elegir uno</p>
      )}
    </div>
  );
}
