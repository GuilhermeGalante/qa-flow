import { useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { useDialogBehavior } from "./useDialogBehavior";
import { focusRing } from "./styles";

const sizes = {
  sm: "sm:max-w-lg",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-6xl",
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: keyof typeof sizes;
  tone?: "default" | "danger";
  footer?: ReactNode;
  children: ReactNode;
  /** Desligue em formulário longo, onde um clique perdido descartaria o preenchimento. */
  closeOnBackdrop?: boolean;
  /** Mostra o "X" no cabeçalho. Diálogos de confirmação preferem só os botões do rodapé. */
  showClose?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Diálogo modal do produto. Bottom-sheet no mobile, centralizado a partir de `sm`.
 *
 * Foco inicial, foco preso, `Escape`, clique no backdrop, devolução do foco e bloqueio
 * da rolagem do body vêm de `useDialogBehavior` — a tela não precisa lembrar de nenhum.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  tone = "default",
  footer,
  children,
  closeOnBackdrop = true,
  showClose = true,
  initialFocusRef,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  useDialogBehavior({ open, onClose, containerRef, initialFocusRef });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`flex max-h-[96dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-raised shadow-2xl sm:rounded-3xl ${sizes[size]}`}
      >
        <header className={`flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-7 ${tone === "danger" ? "border-fail-line bg-fail-tint" : "border-hairline bg-raised"}`}>
          <div className="min-w-0">
            <h2 id={titleId} className={`text-lg font-extrabold ${tone === "danger" ? "text-fail-deep" : "text-body"}`}>{title}</h2>
            {description && <p id={descriptionId} className={`mt-1 text-sm leading-relaxed ${tone === "danger" ? "text-fail" : "text-muted"}`}>{description}</p>}
          </div>
          {showClose && (
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className={`-mr-2 shrink-0 rounded-lg p-2 text-muted transition hover:bg-shell hover:text-body ${focusRing}`}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">{children}</div>

        {footer && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline bg-raised px-5 py-4 sm:px-7">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
