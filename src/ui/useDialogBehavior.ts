import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

/*
 * Bloqueio de rolagem com contagem: dois diálogos empilhados (um `confirm` sobre um
 * editor, por exemplo) não podem destravar o body quando só o de cima fecha.
 */
let scrollLocks = 0;
let restoreOverflow = "";
let restorePaddingRight = "";

function lockBodyScroll(): void {
  if (scrollLocks === 0) {
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    restoreOverflow = document.body.style.overflow;
    restorePaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (gutter > 0) {
      const current = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${current + gutter}px`;
    }
  }
  scrollLocks += 1;
}

function unlockBodyScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.body.style.overflow = restoreOverflow;
    document.body.style.paddingRight = restorePaddingRight;
  }
}

function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
    .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

export interface DialogBehaviorOptions {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /** Prende `Tab` dentro do container. Desligue em painel lado a lado, que não é modal. */
  trapFocus?: boolean;
  lockScroll?: boolean;
  restoreFocus?: boolean;
  closeOnEscape?: boolean;
  /** Elemento que recebe o foco ao abrir; tem precedência sobre `initialFocusSelector`. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Seletor do foco inicial dentro do container. Sem nenhum dos dois, foca o primeiro focável. */
  initialFocusSelector?: string;
}

/**
 * Ciclo de vida de diálogo: foco inicial, foco preso, `Escape`, rolagem travada e
 * devolução do foco ao elemento de origem.
 *
 * Existe para que a acessibilidade seja do primitivo e não da tela — antes disso, três
 * telas tinham a lógica escrita à mão e três a haviam esquecido.
 */
export function useDialogBehavior({
  open,
  onClose,
  containerRef,
  trapFocus = true,
  lockScroll = true,
  restoreFocus = true,
  closeOnEscape = true,
  initialFocusRef,
  initialFocusSelector,
}: DialogBehaviorOptions): void {
  const onCloseRef = useRef(onClose);
  const optionsRef = useRef({ trapFocus, lockScroll, restoreFocus, closeOnEscape, initialFocusSelector });

  // Sincroniza antes dos efeitos abaixo: efeitos rodam na ordem de declaração.
  useEffect(() => {
    onCloseRef.current = onClose;
    optionsRef.current = { trapFocus, lockScroll, restoreFocus, closeOnEscape, initialFocusSelector };
  });

  // Abertura e fechamento: depende apenas de `open`, para que alternar `trapFocus`
  // (inspetor que vira painel fixo ao alargar a tela) não roube o foco nem perca a origem.
  useEffect(() => {
    if (!open) return;
    const { lockScroll: shouldLock, restoreFocus: shouldRestore, initialFocusSelector: selector } = optionsRef.current;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (shouldLock) lockBodyScroll();

    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      const target = initialFocusRef?.current
        ?? (selector ? container?.querySelector<HTMLElement>(selector) : null)
        ?? focusableWithin(container)[0];
      target?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (shouldLock) unlockBodyScroll();
      if (shouldRestore) origin?.focus();
    };
  }, [open, containerRef, initialFocusRef]);

  useEffect(() => {
    if (!open || (!trapFocus && !closeOnEscape)) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (!trapFocus || event.key !== "Tab") return;
      const elements = focusableWithin(containerRef.current);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, trapFocus, closeOnEscape, containerRef]);
}
