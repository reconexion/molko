import { useId, type ReactNode } from "react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, children, disabled }: CheckboxProps) {
  const id = useId();

  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--color-bg-success-solid)" }}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded disabled:cursor-not-allowed"
      />
      <label htmlFor={id} className="cursor-pointer text-sm text-secondary">
        {children}
      </label>
    </div>
  );
}
