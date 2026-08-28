/* eslint-disable react-refresh/only-export-components -- módulo intencionalmente compartilhado do design system */
import type { ReactNode } from "react";
import type { CasePriority, LifecycleStatus, RunStatus, StepStatus } from "../../domain/types";

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

const statusStyles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  draft: "bg-slate-100 text-slate-700 ring-slate-200",
  archived: "bg-slate-100 text-slate-500 ring-slate-200",
  in_progress: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  paused: "bg-amber-50 text-amber-700 ring-amber-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  aborted: "bg-rose-50 text-rose-700 ring-rose-200",
  not_run: "bg-slate-100 text-slate-600 ring-slate-200",
  passed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  blocked: "bg-amber-50 text-amber-800 ring-amber-200",
  skipped: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function StatusBadge({ value, label }: { value: string; label: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusStyles[value] ?? statusStyles.draft}`}>{label}</span>;
}

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning" | "error"; children: ReactNode }) {
  const colors = {
    info: "border-cyan-200 bg-cyan-50 text-cyan-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    error: "border-rose-200 bg-rose-50 text-rose-900",
  };
  return <div role="status" aria-live="polite" aria-atomic="true" className={`rounded-xl border px-4 py-3 text-sm ${colors[tone]}`}>{children}</div>;
}

export const buttonPrimary = "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40";
export const buttonSecondary = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
export const buttonDanger = "inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40";
export const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100";
