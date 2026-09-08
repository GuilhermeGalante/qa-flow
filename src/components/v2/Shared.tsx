/* eslint-disable react-refresh/only-export-components -- módulo intencionalmente compartilhado do design system */
import type { ReactNode } from "react";
import { X } from "lucide-react";
import type { CasePriority, LifecycleStatus, RunStatus, StepStatus } from "../../domain/types";
import { focusRing, type SemanticTone } from "../../ui/styles";

/*
 * Vocabulário do produto: rótulos em português e a cor de cada estado.
 *
 * A aparência dos controles mora em `src/ui/styles.ts` e é reexportada aqui, para que as
 * telas continuem importando de um lugar só.
 */
export { buttonPrimary, buttonSecondary, buttonDanger, inputClass } from "../../ui/styles";

export const priorityLabel: Record<CasePriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export const lifecycleLabel: Record<LifecycleStatus, string> = {
  active: "Ativo",
  draft: "Rascunho",
  archived: "Arquivado",
};

export const runStatusLabel: Record<RunStatus, string> = {
  draft: "Rascunho",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
  aborted: "Abortada",
};

export const stepStatusLabel: Record<StepStatus, string> = {
  not_run: "Não executado",
  passed: "Aprovado",
  failed: "Reprovado",
  blocked: "Bloqueado",
  skipped: "Ignorado",
};

/**
 * A família semântica de cada estado do produto. É o ponto único onde "aprovado é verde"
 * está escrito — badge, seletor de status e realce consultam este mapa.
 */
export const statusTone: Record<string, SemanticTone> = {
  active: "pass",
  draft: "neutral",
  archived: "neutral",
  in_progress: "run",
  paused: "warn",
  completed: "pass",
  aborted: "fail",
  not_run: "neutral",
  passed: "pass",
  failed: "fail",
  blocked: "warn",
  skipped: "explore",
};

const statusStyles: Record<string, string> = {
  active: "bg-pass-tint text-pass ring-pass-line",
  draft: "bg-shell text-control ring-hairline",
  archived: "bg-shell text-muted ring-hairline",
  in_progress: "bg-run-tint text-run ring-run-line",
  paused: "bg-warn-tint text-warn ring-warn-line",
  completed: "bg-pass-tint text-pass ring-pass-line",
  aborted: "bg-fail-tint text-fail ring-fail-line",
  not_run: "bg-shell text-subtle ring-hairline",
  passed: "bg-pass-tint text-pass ring-pass-line",
  failed: "bg-fail-tint text-fail ring-fail-line",
  blocked: "bg-warn-tint text-warn ring-warn-line",
  skipped: "bg-explore-tint text-explore ring-explore-line",
};

export function StatusBadge({ value, label }: { value: string; label: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusStyles[value] ?? statusStyles.draft}`}>{label}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-[-0.035em] text-body md:text-3xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-subtle">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

const metricToneStyles = {
  neutral: "bg-shell text-control",
  pass: "bg-pass-tint text-pass",
  run: "bg-run-tint text-run",
  warn: "bg-warn-tint text-warn",
  fail: "bg-fail-tint text-fail",
} as const;

export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon: ReactNode;
  tone?: keyof typeof metricToneStyles;
}) {
  return (
    <article className="flex min-h-28 items-start justify-between gap-4 rounded-2xl border border-hairline bg-raised p-4 shadow-[0_8px_24px_rgb(15_23_42/0.035)] sm:p-5">
      <div className="min-w-0">
        <p className="text-xs font-bold text-muted">{label}</p>
        <p className="mt-2 text-2xl font-black tracking-[-0.035em] tabular-nums text-body">{value}</p>
        <div className="mt-1 text-xs leading-relaxed text-muted">{detail}</div>
      </div>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${metricToneStyles[tone]}`} aria-hidden="true">{icon}</span>
    </article>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline-strong bg-raised px-6 py-14 text-center">
      <h2 className="text-lg font-bold text-body">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

const noticeTones = {
  info: "border-run-line bg-run-tint text-run-deep",
  success: "border-pass-line bg-pass-tint text-pass-deep",
  warning: "border-warn-line bg-warn-tint text-warn-deep",
  error: "border-fail-line bg-fail-tint text-fail-deep",
} as const;

/**
 * Mensagem inline: use quando a informação **permanece verdadeira** enquanto o estado não
 * mudar — erro de validação, referência desatualizada, prévia aguardando decisão.
 * Para o que **já aconteceu** e não pede ação, use `useToast`.
 */
export function Notice({
  tone = "info",
  title,
  onDismiss,
  children,
}: {
  tone?: keyof typeof noticeTones;
  title?: string;
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${noticeTones[tone]}`}
    >
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        <div className={title ? "mt-1" : undefined}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dispensar mensagem"
          onClick={onDismiss}
          className={`-mr-1 shrink-0 rounded-lg p-1 opacity-70 transition hover:opacity-100 ${focusRing}`}
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
