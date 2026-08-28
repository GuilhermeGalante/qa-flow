import { useRef, type KeyboardEvent } from "react";
import { focusRing } from "./styles";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  /** Contagem à direita do rótulo. Útil em filtro: mostra o tamanho antes do clique. */
  count?: number;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Filtro de poucas opções fixas, sempre visível.
 *
 * Substitui o `<select>` onde o controle é o eixo de navegação da tela: esconder quatro
 * opções atrás de um clique é custo sem contrapartida. Segue o padrão de radiogroup —
 * `tabindex` móvel, setas navegam e selecionam, Home/End vão às pontas.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
  size = "md",
}: SegmentedControlProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const focusAt = (index: number) => {
    const target = options[index];
    if (!target) return;
    onChange(target.value);
    containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    const current = options.findIndex((option) => option.value === value);
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt((current + 1) % options.length);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt((current - 1 + options.length) % options.length);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(options.length - 1);
        return;
      default:
    }
  };

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-hairline-strong bg-shell p-1 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg font-bold transition ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"} ${focusRing} ${active ? "bg-raised text-body shadow-sm" : "text-subtle hover:text-body"}`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${active ? "bg-shell text-subtle" : "bg-raised/70 text-muted"}`}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
