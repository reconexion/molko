import { useId, type HTMLInputTypeAttribute, type ReactNode } from "react";
import { cx } from "../utils/cx";

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Control dentro del campo, a la derecha (p. ej. mostrar/ocultar contraseña). */
  trailing?: ReactNode;
}

export function TextInput({ label, value, onChange, hint, trailing, ...inputProps }: TextInputProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-secondary">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cx(
            "w-full rounded-lg bg-primary px-3.5 py-2.5 text-sm text-primary ring-1 ring-secondary ring-inset outline-none placeholder:text-placeholder focus:ring-2 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50",
            trailing && "pr-11",
          )}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {hint && <p className="text-xs text-tertiary">{hint}</p>}
    </div>
  );
}
