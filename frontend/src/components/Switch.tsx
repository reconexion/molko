import { useId } from "react";
import styled from "styled-components";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

export function Switch({ checked, onChange, disabled, label, hint }: SwitchProps) {
  const id = useId();

  return (
    <StyledWrapper className="flex items-start gap-5">
      <div className="switch">
        <input
          className="switch-check"
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label className="switch-label" htmlFor={id}>
          Check
          <span />
        </label>
      </div>
      {(label || hint) && (
        <div className="flex flex-col gap-0.5 pt-0.5">
          {label && (
            <label htmlFor={id} className="cursor-pointer text-sm font-medium text-secondary select-none">
              {label}
            </label>
          )}
          {hint && <span className="text-sm text-tertiary">{hint}</span>}
        </div>
      )}
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  .switch {
    /* Track: off = neutral, on = tinted green — driven by :has() so the
       color reflects state without extra JS-toggled classes. */
    background-color: var(--color-bg-tertiary);
    border-radius: 999px;
    border: 1px solid var(--color-border-secondary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12) inset;
    height: 28px;
    position: relative;
    width: 64px;
    display: inline-block;
    user-select: none;
    flex-shrink: 0;
    transition: background-color 0.15s ease-in-out;
  }

  .switch:has(.switch-check:checked) {
    background-color: var(--color-bg-success-secondary);
    border-color: var(--color-fg-success-secondary);
  }

  .switch-check {
    position: absolute;
    visibility: hidden;
    user-select: none;
  }

  .switch-label {
    cursor: pointer;
    display: block;
    height: 100%;
    text-indent: -9999px;
    width: 100%;
    user-select: none;
  }

  .switch-check:disabled + .switch-label {
    cursor: not-allowed;
    opacity: 0.5;
  }

  /* Off indicator (red LED) */
  .switch-label:before {
    background: radial-gradient(circle at 35% 35%, rgb(255, 143, 143) 0%, rgb(230, 58, 58) 100%);
    border-radius: 50%;
    border: 1px solid rgba(150, 30, 30, 0.5);
    box-shadow: 0 0 4px rgba(230, 58, 58, 0.7);
    content: "";
    display: block;
    height: 8px;
    left: -14px;
    position: absolute;
    top: 9px;
    transition: opacity 0.2s;
    width: 8px;
    z-index: 12;
  }

  /* On indicator (green LED) */
  .switch-label:after {
    background: radial-gradient(circle at 35% 35%, rgb(134, 239, 172) 0%, rgb(34, 197, 94) 100%);
    border-radius: 50%;
    border: 1px solid rgba(21, 128, 61, 0.5);
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.7);
    content: "";
    display: block;
    height: 8px;
    right: -14px;
    position: absolute;
    top: 9px;
    transition: opacity 0.2s;
    width: 8px;
    z-index: 12;
    opacity: 0.25;
  }

  .switch-check:checked + .switch-label:before {
    opacity: 0.25;
  }

  .switch-check:checked + .switch-label:after {
    opacity: 1;
  }

  /* Sliding knob */
  .switch-label span {
    background: linear-gradient(#fdfdfd, #d8dadf);
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.15);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.3),
      0 1px 1px rgba(255, 255, 255, 0.6) inset;
    display: block;
    height: 22px;
    left: 2px;
    position: absolute;
    top: 2px;
    transition: left 0.18s ease-in-out;
    width: 22px;
  }

  .switch-check:checked + .switch-label span {
    left: 39px;
    background: linear-gradient(#4ade80, #16a34a);
    border-color: rgba(21, 128, 61, 0.6);
  }
`;
