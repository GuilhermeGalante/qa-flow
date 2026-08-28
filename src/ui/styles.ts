/*
 * Fonte única da aparência dos controles.
 *
 * Estas strings continuam sendo a forma canônica de estilizar um botão estático — os
 * ~50 botões existentes as consomem via `Shared.tsx`, que as reexporta. `Button`
 * (src/ui/Button.tsx) compõe as mesmas strings e existe para o caso em que há operação
 * assíncrona e o botão precisa de estado de carregamento.
 */

const controlBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40";

export const buttonPrimary = `${controlBase} bg-ink text-raised shadow-sm hover:bg-ink-hover`;

export const buttonSecondary = `${controlBase} border border-hairline-strong bg-raised text-control shadow-sm hover:border-faint hover:bg-surface`;

export const buttonDanger = `${controlBase} border border-fail-line bg-fail-tint text-fail hover:bg-fail-halo`;

export const inputClass =
  "w-full rounded-xl border border-hairline-strong bg-raised px-3 py-2.5 text-sm text-body outline-none transition placeholder:text-muted focus:border-run-mark focus:ring-4 focus:ring-run-halo";

/** Anel de foco dos controles que não são `input` (gatilhos, opções de listbox). */
export const focusRing = "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-run-halo";

export type SemanticTone = "neutral" | "run" | "pass" | "warn" | "fail" | "explore";

/** Fundo + texto + anel de cada família semântica, para badge, opção e realce. */
export const toneSurface: Record<SemanticTone, string> = {
  neutral: "bg-shell text-subtle ring-hairline",
  run: "bg-run-tint text-run ring-run-line",
  pass: "bg-pass-tint text-pass ring-pass-line",
  warn: "bg-warn-tint text-warn ring-warn-line",
  fail: "bg-fail-tint text-fail ring-fail-line",
  explore: "bg-explore-tint text-explore ring-explore-line",
};

/** Versão sólida, para o item selecionado de um controle segmentado. */
export const toneSelected: Record<SemanticTone, string> = {
  neutral: "border-hairline-strong bg-raised text-body shadow-sm",
  run: "border-run-line bg-run-tint text-run-deep shadow-sm",
  pass: "border-pass-line bg-pass-tint text-pass-deep shadow-sm",
  warn: "border-warn-line bg-warn-tint text-warn-deep shadow-sm",
  fail: "border-fail-line bg-fail-tint text-fail-deep shadow-sm",
  explore: "border-explore-line bg-explore-tint text-explore-deep shadow-sm",
};
