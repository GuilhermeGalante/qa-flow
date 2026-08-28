import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { focusRing, toneSelected, type SemanticTone } from "./styles";

export interface StatusOption<T extends string = string> {
  value: T;
  label: string;
  tone: SemanticTone;
  /** Tecla única que aplica esta opção. Fica visível no botão. */
  shortcut?: string;
}

interface StatusPickerProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: StatusOption<T>[];
  ariaLabel: string;
  disabled?: boolean;
  /**
   * Região em que os atalhos valem. Sem ela, os atalhos ficam desligados — teclar "1"
   * não pode alterar o passo errado só porque a tela está aberta.
   */
  shortcutScopeRef?: RefObject<HTMLElement | null>;
  className?: string;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

/**
 * Escolha de status como alvos diretos, com a cor do próprio status.
 *
 * Existe para a interação mais repetida do produto — registrar o resultado de um passo,
 * dezenas de vezes por execução. Como `<select>`, custava abrir, procurar e clicar.
 */
export function StatusPicker<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  disabled = false,
  shortcutScopeRef,
  className = "",
}: StatusPickerProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    const scope = shortcutScopeRef?.current;
    if (!scope || disabled) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // O QA está digitando o resultado obtido no campo ao lado: não sequestrar a tecla.
      if (isTypingTarget(event.target)) return;
      const active = document.activeElement;
      if (!(active instanceof Node) || !scope.contains(active)) return;
      const match = options.find((option) => option.shortcut === event.key);
      if (!match) return;
      event.preventDefault();
      onChangeRef.current(match.value);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [options, disabled, shortcutScopeRef]);

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
      className={`flex flex-wrap gap-1.5 ${className}`}
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
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${focusRing} ${active ? toneSelected[option.tone] : "border-hairline bg-raised text-subtle hover:border-hairline-strong hover:text-body"}`}
          >
            {option.label}
            {option.shortcut && (
              <kbd className={`hidden rounded border px-1 text-[10px] font-bold sm:inline ${active ? "border-current/25 opacity-70" : "border-hairline text-faint"}`}>
                {option.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
}
