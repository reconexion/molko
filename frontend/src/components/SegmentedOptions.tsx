import { useId } from "react";
import styled from "styled-components";

export interface SegmentedOption {
  id: string;
  label: string;
}

interface SegmentedOptionsProps {
  options: SegmentedOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loadingId?: string | null;
  disabled?: boolean;
}

export function SegmentedOptions({ options, selectedId, onSelect, loadingId, disabled }: SegmentedOptionsProps) {
  const name = useId();

  return (
    <StyledWrapper>
      <div className="customCheckBoxHolder">
        {options.map((option) => (
          <div key={option.id} className="customCheckBoxItem">
            <input
              className="customCheckBoxInput"
              id={`${name}-${option.id}`}
              type="radio"
              name={name}
              checked={selectedId === option.id}
              disabled={disabled || loadingId !== null}
              onChange={() => onSelect(option.id)}
            />
            <label className="customCheckBoxWrapper" htmlFor={`${name}-${option.id}`}>
              <div className="customCheckBox">
                <div className="inner">{loadingId === option.id ? "Cargando…" : option.label}</div>
              </div>
            </label>
          </div>
        ))}
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  .customCheckBoxHolder {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .customCheckBoxItem {
    display: flex;
  }

  .customCheckBox {
    width: fit-content;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    padding: 2px 14px;
    background-color: var(--color-bg-secondary);
    border: 1px solid var(--color-border-secondary);
    border-radius: 8px;
    color: var(--color-text-tertiary);
    transition-timing-function: cubic-bezier(0.25, 0.8, 0.25, 1);
    transition-duration: 300ms;
    transition-property: color, background-color, box-shadow, border-color;
    display: flex;
    height: 36px;
    align-items: center;
    box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.04);
    outline: none;
    justify-content: center;
    min-width: 55px;
  }

  .customCheckBoxInput:not(:disabled) + .customCheckBoxWrapper .customCheckBox:hover {
    background-color: var(--color-bg-secondary_hover);
    color: var(--color-text-secondary);
    border-color: var(--color-border-primary);
  }

  .customCheckBox .inner {
    font-size: 0.8rem;
    font-weight: 700;
    pointer-events: none;
    white-space: nowrap;
    transition-timing-function: cubic-bezier(0.25, 0.8, 0.25, 1);
    transition-duration: 300ms;
    transition-property: transform;
    transform: translateY(0px);
  }

  .customCheckBoxInput:not(:disabled) + .customCheckBoxWrapper .customCheckBox:hover .inner {
    transform: translateY(-1px);
  }

  .customCheckBoxInput {
    display: none;
  }

  .customCheckBoxInput:disabled + .customCheckBoxWrapper .customCheckBox {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .customCheckBoxInput:checked + .customCheckBoxWrapper .customCheckBox {
    background-color: var(--color-bg-success-solid);
    border-color: var(--color-bg-success-solid);
    color: white;
    box-shadow: 0px 1px 2px rgba(0, 0, 0, 0.08);
  }

  .customCheckBoxInput:checked + .customCheckBoxWrapper .customCheckBox .inner {
    transform: translateY(-1px);
  }

  .customCheckBoxInput:checked:not(:disabled) + .customCheckBoxWrapper .customCheckBox:hover {
    background-color: var(--color-bg-success-solid_hover, #15803d);
  }
`;
