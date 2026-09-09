import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  Clock,
  Columns3,
  GripVertical,
  Link2,
  ListChecks,
  Maximize2,
  MoreHorizontal,
  PanelRight,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { demandMetrics } from "../../domain/demands";
import { createId } from "../../domain/validation";
import type {
  CasePriority,
  DemandColumn,
  DemandColumnColor,
  DemandColumnSemantic,
  DemandLink,
  DemandLinkType,
  QaDemand,
} from "../../domain/types";
import { useQaStore } from "../../store/useQaStore";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { Select, type SelectOption } from "../../ui/Select";
import { useToast } from "../../ui/ToastProvider";
import { useDialogBehavior } from "../../ui/useDialogBehavior";
import { buttonPrimary, buttonSecondary, inputClass, priorityLabel } from "./Shared";
import { getActiveLocale, tr } from "../../i18n";

const priorityStyles: Record<CasePriority, string> = {
  low: "bg-shell text-subtle border border-hairline",
  medium: "bg-blue-50 text-blue-700 border border-blue-200/80",
  high: "bg-warn-tint text-warn-deep border border-warn-line",
  critical: "bg-fail-tint text-fail-deep border border-fail-line font-bold",
};

const semanticLabels: Record<DemandColumnSemantic, string> = {
  neutral: "Neutra",
  active: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

const semanticHints: Record<DemandColumnSemantic, string> = {
  neutral: "Não entra em nenhum indicador",
  active: "Conta como demanda aberta",
  blocked: "Conta como bloqueada",
  done: "Conta como concluída",
};

const semanticOptions: SelectOption<DemandColumnSemantic>[] = (Object.keys(semanticLabels) as DemandColumnSemantic[])
  .map((value) => ({ value, label: semanticLabels[value], hint: semanticHints[value] }));

type DemandColumnColorChoice = DemandColumnColor | "none";

const columnColorOptions: SelectOption<DemandColumnColorChoice>[] = [
  {
    value: "none",
    label: "Sem cor",
    hint: "Aparência neutra",
    icon: <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-hairline-strong bg-raised text-muted"><X size={9} /></span>,
  },
  { value: "cyan", label: "Ciano", icon: <span className="h-3.5 w-3.5 rounded-full bg-run-mark" /> },
  { value: "green", label: "Verde", icon: <span className="h-3.5 w-3.5 rounded-full bg-pass-mark" /> },
  { value: "amber", label: "Âmbar", icon: <span className="h-3.5 w-3.5 rounded-full bg-warn" /> },
  { value: "rose", label: "Rosa", icon: <span className="h-3.5 w-3.5 rounded-full bg-fail-mark" /> },
  { value: "violet", label: "Violeta", icon: <span className="h-3.5 w-3.5 rounded-full bg-explore" /> },
];

const columnColorStyles: Record<DemandColumnColorChoice, {
  surface: string;
  dot: string;
  caption: string;
  action: string;
}> = {
  none: {
    surface: "bg-surface/70 border-hairline",
    dot: "bg-faint",
    caption: "text-muted",
    action: "border-dashed border-hairline-strong bg-raised/60 text-subtle hover:border-faint hover:bg-raised hover:text-body",
  },
  cyan: {
    surface: "bg-run-tint/70 border-run-line",
    dot: "bg-run-mark",
    caption: "text-run",
    action: "border-run-line bg-run-tint text-run-deep hover:border-run-mark hover:bg-run-halo",
  },
  green: {
    surface: "bg-pass-tint/70 border-pass-line",
    dot: "bg-pass-mark",
    caption: "text-pass",
    action: "border-pass-line bg-pass-tint text-pass-deep hover:border-pass-mark hover:bg-pass-tint",
  },
  amber: {
    surface: "bg-warn-tint/70 border-warn-line",
    dot: "bg-warn",
    caption: "text-warn",
    action: "border-warn-line bg-warn-tint text-warn-deep hover:border-warn hover:bg-warn-tint",
  },
  rose: {
    surface: "bg-fail-tint/70 border-fail-line",
    dot: "bg-fail-mark",
    caption: "text-fail",
    action: "border-fail-line bg-fail-tint text-fail-deep hover:border-fail-mark hover:bg-fail-halo",
  },
  violet: {
    surface: "bg-explore-tint/70 border-explore-line",
    dot: "bg-explore",
    caption: "text-explore",
    action: "border-explore-line bg-explore-tint text-explore-deep hover:border-explore hover:bg-explore-tint",
  },
};

function columnStyle(color?: DemandColumnColor) {
  return columnColorStyles[color ?? "none"] ?? columnColorStyles.none;
}

const priorityOptions: SelectOption<CasePriority>[] = (Object.keys(priorityLabel) as CasePriority[])
  .map((value) => ({ value, label: priorityLabel[value] }));

const linkTypeLabel: Record<DemandLinkType, string> = {
  case: "Caso",
  plan: "Plano",
  run: "Execução",
  report: "Relatório",
};

const columnHeaderCaptions: Record<string, string> = {
  "COL-BACKLOG": "est. 2d",
  "COL-REFINEMENT": "target 1d",
  "COL-READY": "fila",
  "COL-PROGRESS": "avg 32m",
  "COL-BLOCKED": "atenção",
  "COL-VALIDATION": "target 4h",
  "COL-DONE": "finalizado",
};

const semanticCaptions: Record<DemandColumnSemantic, string> = {
  neutral: "fila",
  active: "avg 32m",
  blocked: "atenção",
  done: "finalizado",
};

const avatarColorPalette = [
  "bg-violet-100 text-violet-700",
  "bg-pass-tint text-pass-deep",
  "bg-run-halo text-run-deep",
  "bg-warn-tint text-warn-deep",
  "bg-fail-halo text-fail-deep",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColorPalette[Math.abs(hash) % avatarColorPalette.length];
}

function formatDemandCode(id: string): string {
  if (/^QA-\d+/i.test(id)) return id.toUpperCase();
  if (/^BUG-\d+/i.test(id)) return id.toUpperCase();
  if (/^AUTH-\d+/i.test(id)) return id.toUpperCase();
  if (/^PAY-\d+/i.test(id)) return id.toUpperCase();
  if (/^UI-\d+/i.test(id)) return id.toUpperCase();
  if (/^SEC-\d+/i.test(id)) return id.toUpperCase();
  if (/^DEM-\d+/i.test(id)) {
    const num = id.replace(/^DEM-/i, "");
    return `QA-${num.slice(-3).padStart(3, "0")}`;
  }
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "QA";
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts.at(-1)?.[0] ?? "" : parts[0]?.[1] ?? ""}`.toLocaleUpperCase(getActiveLocale());
}

function formatShortDate(value?: string): string {
  if (!value) return tr("Sem prazo");
  return new Intl.DateTimeFormat(getActiveLocale(), { day: "2-digit", month: "2-digit" })
    .format(new Date(`${value}T12:00:00`));
}

function emptyDemand(columnId: string, order: number): QaDemand {
  const now = new Date().toISOString();
  return {
    id: createId("DEM"),
    title: "",
    description: "",
    columnId,
    order,
    priority: "medium",
    assignee: "",
    tags: [],
    checklist: [],
    links: [],
    createdAt: now,
    updatedAt: now,
  };
}

function useSurfaceWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function DemandCard({
  demand,
  selected,
  columns,
  onSelect,
  onMove,
  onDropAt,
}: {
  demand: QaDemand;
  selected: boolean;
  columns: DemandColumn[];
  onSelect: () => void;
  onMove: (columnId: string) => void;
  onDropAt: (event: DragEvent) => void;
}) {
  const [dropTarget, setDropTarget] = useState(false);
  const columnOptions = useMemo<SelectOption[]>(
    () => columns.map((column) => ({ value: column.id, label: column.name, localizeLabel: false })),
    [columns],
  );

  const displayCode = useMemo(() => formatDemandCode(demand.id), [demand.id]);
  const avatarTone = useMemo(() => getAvatarColor(demand.assignee || demand.id), [demand.assignee, demand.id]);
  const userInitials = useMemo(() => initials(demand.assignee || demand.title), [demand.assignee, demand.title]);

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", demand.id);
        event.dataTransfer.setData("text/qaflow-demand", demand.id);
        event.dataTransfer.setData("application/x-qaflow-demand", demand.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget(true);
      }}
      onDragLeave={() => setDropTarget(false)}
      onDragEnd={() => setDropTarget(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropTarget(false);
        onDropAt(event);
      }}
      onClick={onSelect}
      className={`group relative rounded-2xl border bg-raised p-3.5 shadow-[0_1px_3px_rgb(15_23_42/0.03),0_6px_14px_rgb(15_23_42/0.02)] transition-all duration-200 cursor-pointer ${
        dropTarget
          ? "border-run-mark ring-2 ring-run-halo scale-[1.01]"
          : selected
            ? "border-run-mark ring-2 ring-run-halo"
            : "border-hairline hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-[0_4px_16px_rgb(15_23_42/0.08)]"
      }`}
    >
      {/* Linha Superior: Avatar/Iniciais + Código + Prioridade + Grip */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarTone}`}
          >
            {userInitials}
          </span>
          <span className="truncate font-mono text-xs font-bold tracking-tight text-muted">
            {displayCode}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${priorityStyles[demand.priority]}`}>
            {tr(priorityLabel[demand.priority])}
          </span>
          <GripVertical size={14} aria-hidden="true" className="shrink-0 cursor-grab text-muted group-hover:text-muted" />
        </div>
      </div>

      {/* Título da Demanda */}
      <p className="mt-2 text-sm font-bold leading-snug text-body group-hover:text-run-deep transition">
        {demand.title}
      </p>

      {/* Tags reais da demanda (se houver) */}
      {demand.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {demand.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-md bg-shell px-2 py-0.5 text-[11px] font-semibold text-subtle"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Indicadores reais: Responsável, Prazo, Checklist e Links */}
      {(demand.assignee || demand.dueDate || demand.checklist.length > 0 || demand.links.length > 0) && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-2.5 text-xs text-muted">
          <span className="truncate text-[11px] font-medium text-subtle">
            {demand.assignee || tr("Sem responsável")}
          </span>
          <div className="flex items-center gap-2.5 shrink-0 text-[11px] font-medium text-muted">
            {demand.checklist.length > 0 && (
              <span className="flex items-center gap-1" title={tr("Checklist concluído")}>
                <ListChecks size={12} />
                {demand.checklist.filter((c) => c.done).length}/{demand.checklist.length}
              </span>
            )}
            {demand.links.length > 0 && (
              <span className="flex items-center gap-1" title={tr("Artefatos vinculados")}>
                <Link2 size={12} />
                {demand.links.length}
              </span>
            )}
            {demand.dueDate && (
              <span className="flex items-center gap-1" title={`Prazo: ${demand.dueDate}`}>
                <Clock size={12} />
                {formatShortDate(demand.dueDate)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Menu compacto para mover de coluna */}
      <details
        className="mt-1"
        onClick={(event) => event.stopPropagation()}
      >
        <summary
          className="ml-auto flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-md text-muted transition hover:bg-shell hover:text-control"
          aria-label={`Organizar ${demand.title}`}
          title={tr("Mover de coluna")}
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </summary>
        <div className="mt-1 rounded-xl border border-hairline bg-raised p-2 shadow-lg">
          <label className="block text-[11px] font-bold text-subtle" htmlFor={`move-${demand.id}`}>
            {tr("Mover para")}
          </label>
          <Select
            id={`move-${demand.id}`}
            className="mt-1"
            ariaLabel={tr(`Mover ${demand.title} para outra coluna`)}
            value={demand.columnId}
            onChange={onMove}
            options={columnOptions}
          />
        </div>
      </details>
    </article>
  );
}

type DemandViewMode = "modal" | "fullscreen" | "sidebar";

const DEMAND_SIDEBAR_MIN = 360;
const DEMAND_SIDEBAR_MAX = 720;

function DemandLayoutChooser({ value, onChange }: { value: DemandViewMode; onChange: (value: DemandViewMode) => void }) {
  return (
    <div
      role="group"
      aria-label={tr("Modo de visualização da demanda")}
      className="hidden sm:inline-flex items-center gap-0.5 rounded-xl border border-hairline bg-shell/90 p-1"
    >
      <button
        type="button"
        aria-label={tr("Visualização em modal central")}
        title={tr("Modo Modal (janela central)")}
        aria-pressed={value === "modal"}
        onClick={() => onChange("modal")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer ${
          value === "modal"
            ? "bg-raised text-body shadow-2xs font-bold"
            : "text-muted hover:text-body hover:bg-hairline/60"
        }`}
      >
        <AppWindow size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={tr("Visualização em tela cheia")}
        title={tr("Modo Tela Cheia (área ampla)")}
        aria-pressed={value === "fullscreen"}
        onClick={() => onChange("fullscreen")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer ${
          value === "fullscreen"
            ? "bg-raised text-body shadow-2xs font-bold"
            : "text-muted hover:text-body hover:bg-hairline/60"
        }`}
      >
        <Maximize2 size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={tr("Visualização em barra lateral")}
        title={tr("Modo Barra Lateral (painel à direita)")}
        aria-pressed={value === "sidebar"}
        onClick={() => onChange("sidebar")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer ${
          value === "sidebar"
            ? "bg-raised text-body shadow-2xs font-bold"
            : "text-muted hover:text-body hover:bg-hairline/60"
        }`}
      >
        <PanelRight size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function DemandEditor({ demand, columns, viewMode, onViewModeChange, onClose, onSaved }: {
  demand: QaDemand;
  columns: DemandColumn[];
  viewMode: DemandViewMode;
  onViewModeChange: (value: DemandViewMode) => void;
  onClose: () => void;
  onSaved: (demand: QaDemand, message: string) => void;
}) {
  const saveDemand = useQaStore((state) => state.saveDemand);
  const deleteDemand = useQaStore((state) => state.deleteDemand);
  const cases = useQaStore((state) => state.cases);
  const plans = useQaStore((state) => state.plans);
  const runs = useQaStore((state) => state.runs);
  const reports = useQaStore((state) => state.reports);
  const existing = useQaStore((state) => state.demands.some((item) => item.id === demand.id));
  const confirm = useConfirm();
  const toast = useToast();
  const [draft, setDraft] = useState(demand);
  const [checklistLabel, setChecklistLabel] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const columnOptions = useMemo<SelectOption[]>(
    () => columns.map((column) => ({ value: column.id, label: column.name, localizeLabel: false })),
    [columns],
  );

  const artifacts = useMemo(() => [
    ...cases.map((item) => ({ type: "case" as const, id: item.id, label: `Caso · ${item.id} — ${item.title}` })),
    ...plans.map((item) => ({ type: "plan" as const, id: item.id, label: `Plano · ${item.id} — ${item.name}` })),
    ...runs.map((item) => ({ type: "run" as const, id: item.id, label: `Execução · ${item.id} — ${item.snapshot.plan.name}` })),
    ...reports.map((item) => ({ type: "report" as const, id: item.id, label: `Relatório · ${item.title}` })),
  ], [cases, plans, reports, runs]);

  const artifactOptions = useMemo<SelectOption[]>(() => artifacts
    .filter((artifact) => !draft.links.some((link) => link.type === artifact.type && link.id === artifact.id))
    .map((artifact) => ({
      value: `${artifact.type}::${artifact.id}`,
      label: artifact.label.split(" — ").at(-1) ?? artifact.label,
      hint: artifact.id,
      badge: linkTypeLabel[artifact.type],
      localizeLabel: false,
      localizeHint: false,
    })), [artifacts, draft.links]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await saveDemand(draft);
    setSaving(false);
    if (!result.ok || !result.value) { setError(result.message); return; }
    setError("");
    onSaved(result.value, result.message);
  };

  const requestDelete = async () => {
    const confirmed = await confirm({
      title: tr("Excluir esta demanda?"),
      description: tr("Esta ação não pode ser desfeita. A demanda, seu checklist e seus vínculos serão removidos."),
      itemLabel: draft.title || draft.id,
      confirmLabel: tr("Excluir definitivamente"),
      tone: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    const result = await deleteDemand(draft.id);
    setDeleting(false);
    toast.fromResult(result);
    if (result.ok) onClose(); else setError(result.message);
  };

  const addLink = (value: string) => {
    const [type, id] = value.split("::") as [DemandLinkType, string];
    const artifact = artifacts.find((item) => item.type === type && item.id === id);
    if (!artifact || draft.links.some((link) => link.type === type && link.id === id)) return;
    setDraft((current) => ({ ...current, links: [...current.links, artifact] }));
  };

  return (
    <form onSubmit={submit} className="flex h-full flex-col bg-raised">
      {/* Header do Form */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-6 py-4">
        <div className="min-w-0">
          <h2 tabIndex={-1} className="text-lg font-bold text-body">
            {existing ? tr("Detalhes da demanda") : tr("Registrar demanda")}
          </h2>
          {existing && <p className="mt-0.5 truncate font-mono text-xs font-semibold text-muted">{draft.id}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <DemandLayoutChooser value={viewMode} onChange={onViewModeChange} />
          <button
            type="button"
            aria-label={tr("Fechar detalhes")}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-shell hover:text-control cursor-pointer"
          >
            <X size={19} />
          </button>
        </div>
      </div>

      {/* Conteúdo rolável */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className={`mx-auto space-y-5 ${viewMode === "sidebar" ? "max-w-none" : "max-w-3xl"}`}>
          {error && <div role="alert" className="rounded-xl border border-fail-line bg-fail-tint px-3 py-2 text-sm text-fail-deep">{error}</div>}
          <label className="block text-xs font-bold text-control">{tr("Título")}
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`${inputClass} mt-1.5`} placeholder={tr("Ex.: Validar smoke Android")} />
          </label>
          <label className="block text-xs font-bold text-control">{tr("Descrição")}
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${inputClass} mt-1.5 min-h-28 resize-y`} placeholder={tr("Contexto, objetivo e critérios relevantes para o QA.")} />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="text-xs font-bold text-control">
              <label htmlFor="demand-column">{tr("Coluna")}</label>
              <Select id="demand-column" className="mt-1.5" ariaLabel={tr("Coluna da demanda")} value={draft.columnId} onChange={(columnId) => setDraft({ ...draft, columnId })} options={columnOptions} />
            </div>
            <div className="text-xs font-bold text-control">
              <label htmlFor="demand-priority">{tr("Prioridade")}</label>
              <Select id="demand-priority" className="mt-1.5" ariaLabel={tr("Prioridade da demanda")} value={draft.priority} onChange={(priority) => setDraft({ ...draft, priority })} options={priorityOptions} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-control">{tr("Responsável")}
              <input value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} className={`${inputClass} mt-1.5`} placeholder={tr("Nome livre")} />
            </label>
            <label className="block text-xs font-bold text-control">{tr("Prazo")}
              <input type="date" value={draft.dueDate ?? ""} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value || undefined })} className={`${inputClass} mt-1.5`} />
            </label>
          </div>
          <label className="block text-xs font-bold text-control">{tr("Tags")}
            <input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} className={`${inputClass} mt-1.5`} placeholder="android, smoke" />
          </label>

          <section aria-labelledby="checklist-heading" className="border-t border-hairline pt-5">
            <div className="flex items-center justify-between">
              <h3 id="checklist-heading" className="text-sm font-bold text-body">{tr("Checklist")}</h3>
              <span className="text-xs font-semibold text-muted">{draft.checklist.filter((item) => item.done).length}/{draft.checklist.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {draft.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-xl border border-hairline px-3 py-2">
                  <input type="checkbox" checked={item.done} onChange={() => setDraft((current) => ({ ...current, checklist: current.checklist.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) }))} className="h-4 w-4 accent-slate-900 cursor-pointer" aria-label={`Concluir ${item.label}`} />
                  <span className={`min-w-0 flex-1 text-sm ${item.done ? "text-muted line-through" : "text-control"}`}>{item.label}</span>
                  <button type="button" aria-label={tr(`Remover ${item.label}`)} onClick={() => setDraft((current) => ({ ...current, checklist: current.checklist.filter((entry) => entry.id !== item.id) }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-shell hover:text-fail cursor-pointer"><X size={15} /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={checklistLabel} onChange={(event) => setChecklistLabel(event.target.value)} className={`${inputClass} min-w-0`} placeholder={tr("Novo item")} />
              <button type="button" className={buttonSecondary} onClick={() => {
                const label = checklistLabel.trim();
                if (!label) return;
                setDraft((current) => ({ ...current, checklist: [...current.checklist, { id: createId("CHK"), label, done: false }] }));
                setChecklistLabel("");
              }}><Plus size={16} />{tr("Adicionar")}</button>
            </div>
          </section>

          <section aria-labelledby="links-heading" className="border-t border-hairline pt-5">
            <h3 id="links-heading" className="text-sm font-bold text-body">{tr("Artefatos vinculados")}</h3>
            <Select
              className="mt-3"
              ariaLabel={tr("Adicionar artefato vinculado")}
              value=""
              onChange={addLink}
              options={artifactOptions}
              searchable
              searchPlaceholder={tr("Buscar caso, plano, execução ou relatório…")}
              placeholder={tr("Adicionar caso, plano, execução ou relatório…")}
              emptyLabel={tr("Nenhum artefato disponível para vincular.")}
            />
            <div className="mt-2 space-y-2">
              {draft.links.map((link: DemandLink) => (
                <div key={`${link.type}-${link.id}`} className="flex items-center gap-2 rounded-xl bg-surface border border-hairline px-3 py-2 text-xs font-semibold text-control">
                  <Link2 size={14} className="text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{link.label}</span>
                  <button type="button" aria-label={`Desvincular ${link.label}`} onClick={() => setDraft((current) => ({ ...current, links: current.links.filter((entry) => entry.type !== link.type || entry.id !== link.id) }))} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted hover:bg-raised hover:text-fail cursor-pointer"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Footer com botões */}
      <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-6 py-4 bg-surface/50">
        {existing && (
          <Button variant="danger" className="mr-auto" loading={deleting} loadingLabel="Excluindo…" icon={<Trash2 size={16} />} onClick={() => void requestDelete()}>
            {tr("Excluir")}
          </Button>
        )}
        <button type="button" onClick={onClose} className={buttonSecondary}>{tr("Cancelar")}</button>
        <Button type="submit" variant="primary" loading={saving} loadingLabel={tr("Salvando…")} icon={<Check size={16} />}>{tr("Salvar")}</Button>
      </div>
    </form>
  );
}

function ColumnManager({ columns, onClose, onResult }: { columns: DemandColumn[]; onClose: () => void; onResult: (result: { ok: boolean; message: string }) => void }) {
  const addColumn = useQaStore((state) => state.addDemandColumn);
  const updateColumn = useQaStore((state) => state.updateDemandColumn);
  const deleteColumn = useQaStore((state) => state.deleteDemandColumn);
  const moveColumn = useQaStore((state) => state.moveDemandColumn);
  const [newName, setNewName] = useState("");
  const [newSemantic, setNewSemantic] = useState<DemandColumnSemantic>("neutral");
  const [newColor, setNewColor] = useState<DemandColumnColorChoice>("none");

  return (
    <div className="flex h-full flex-col bg-raised">
      <div className="flex shrink-0 items-center justify-between border-b border-hairline px-6 py-4">
        <h2 tabIndex={-1} className="text-lg font-bold text-body">{tr("Gerenciar colunas")}</h2>
        <button type="button" aria-label={tr("Fechar gerenciador")} onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-shell hover:text-control cursor-pointer"><X size={19} /></button>
      </div>
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto px-6 py-5">
        <p className="text-sm leading-relaxed text-muted">{tr("O significado alimenta os indicadores. A cor é opcional e serve apenas para organizar visualmente o quadro.")}</p>
        {columns.map((column, index) => <ColumnRow key={column.id} column={column} first={index === 0} last={index === columns.length - 1} onMove={async (id, direction) => onResult(await moveColumn(id, direction))} onUpdate={async (name, semantic, color) => onResult(await updateColumn(column.id, name, semantic, color))} onDelete={async () => onResult(await deleteColumn(column.id))} />)}
      </div>
      <form className="shrink-0 space-y-3 border-t border-hairline p-6 bg-surface/50" onSubmit={async (event) => {
        event.preventDefault();
        const result = await addColumn(newName, newSemantic, newColor === "none" ? undefined : newColor);
        onResult(result);
        if (result.ok) { setNewName(""); setNewSemantic("neutral"); setNewColor("none"); }
      }}>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{tr("Nova coluna")}</p>
        <input value={newName} onChange={(event) => setNewName(event.target.value)} className={inputClass} placeholder={tr("Ex.: Pronto para release")} />
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-subtle">{tr("Significado")}</p>
            <Select className="mt-1" ariaLabel={tr("Significado da nova coluna")} value={newSemantic} onChange={setNewSemantic} options={semanticOptions} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-subtle">{tr("Cor")}</p>
            <Select className="mt-1" ariaLabel={tr("Cor da nova coluna")} value={newColor} onChange={setNewColor} options={columnColorOptions} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button className={buttonPrimary} type="submit"><Plus size={16} />{tr("Criar")}</button>
          <button type="button" onClick={onClose} className={buttonSecondary}>{tr("Fechar")}</button>
        </div>
      </form>
    </div>
  );
}

function ColumnRow({ column, first, last, onMove, onUpdate, onDelete }: { column: DemandColumn; first: boolean; last: boolean; onMove: (id: string, direction: -1 | 1) => void; onUpdate: (name: string, semantic: DemandColumnSemantic, color?: DemandColumnColor) => void; onDelete: () => void }) {
  const [name, setName] = useState(column.name);
  const [semantic, setSemantic] = useState(column.semantic);
  const [color, setColor] = useState<DemandColumnColorChoice>(column.color ?? "none");
  return (
    <div className="rounded-2xl border border-hairline p-3.5 bg-raised">
      <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} aria-label={tr("Nome da coluna")} />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-subtle">{tr("Significado")}</p>
          <Select className="mt-1" ariaLabel={tr(`Significado da coluna ${column.name}`)} value={semantic} onChange={setSemantic} options={semanticOptions} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-subtle">{tr("Cor")}</p>
          <Select className="mt-1" ariaLabel={tr(`Cor da coluna ${column.name}`)} value={color} onChange={setColor} options={columnColorOptions} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button type="button" disabled={first} onClick={() => onMove(column.id, -1)} className="rounded-xl border border-hairline p-2 text-muted hover:bg-surface disabled:opacity-30 cursor-pointer" aria-label={tr(`Mover ${column.name} para a esquerda`)}><ArrowLeft size={15} /></button>
        <button type="button" disabled={last} onClick={() => onMove(column.id, 1)} className="rounded-xl border border-hairline p-2 text-muted hover:bg-surface disabled:opacity-30 cursor-pointer" aria-label={tr(`Mover ${column.name} para a direita`)}><ArrowRight size={15} /></button>
        <button type="button" onClick={() => onDelete()} className="ml-auto rounded-xl p-2 text-fail hover:bg-fail-tint cursor-pointer" aria-label={tr(`Excluir ${column.name}`)}><Trash2 size={15} /></button>
        <button type="button" onClick={() => onUpdate(name, semantic, color === "none" ? undefined : color)} className="rounded-xl bg-ink px-3.5 py-2 text-xs font-bold text-white hover:bg-ink-hover cursor-pointer">{tr("Salvar")}</button>
      </div>
    </div>
  );
}

export function DemandsScreen() {
  const columns = useQaStore((state) => state.demandColumns).slice().sort((left, right) => left.order - right.order);
  const demands = useQaStore((state) => state.demands);
  const moveDemand = useQaStore((state) => state.moveDemand);
  const preferences = useQaStore((state) => state.preferences);
  const setPreference = useQaStore((state) => state.setPreference);
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<CasePriority | "all">("all");
  const [assignee, setAssignee] = useState("all");
  const [linkedOnly, setLinkedOnly] = useState(false);

  // Filtros de escopo e status
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [statusChipFilter, setStatusChipFilter] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QaDemand | null>(null);
  const [panel, setPanel] = useState<"demand" | "columns" | null>(null);
  const [mobileColumnId, setMobileColumnId] = useState(columns[0]?.id ?? "");
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [demandViewMode, setDemandViewMode] = useState<DemandViewMode>(preferences.demandViewMode ?? "modal");
  const [demandSidebarWidth, setDemandSidebarWidth] = useState(() => {
    const value = preferences.demandSidebarWidth;
    return typeof value === "number" && value >= DEMAND_SIDEBAR_MIN && value <= DEMAND_SIDEBAR_MAX ? value : 480;
  });

  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceWidth = useSurfaceWidth(surfaceRef);
  const boardExpanded = surfaceWidth >= 880;
  const effectiveDemandViewMode: DemandViewMode = surfaceWidth > 0 && surfaceWidth < 640 ? "fullscreen" : demandViewMode;
  const panelRef = useRef<HTMLElement>(null);
  const metrics = useMemo(() => demandMetrics(demands, columns), [columns, demands]);
  const selected = draft ?? demands.find((item) => item.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase(getActiveLocale());

  const assignees = [...new Set(demands.map((d) => d.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, getActiveLocale()));
  const assigneeOptions: SelectOption[] = [{ value: "all", label: tr("Todos os responsáveis") }, ...assignees.map((value) => ({ value, label: value, localizeLabel: false }))];
  const priorityFilterOptions: SelectOption<CasePriority | "all">[] = [{ value: "all", label: tr("Todas as prioridades") }, ...priorityOptions];
  const boardColumnOptions: SelectOption[] = columns.map((column) => ({ value: column.id, label: column.name, hint: semanticLabels[column.semantic], localizeLabel: false }));

  // Contadores para os chips rápidos de status
  const criticalCount = useMemo(() => demands.filter((d) => d.priority === "critical").length, [demands]);
  const blockedDevCount = useMemo(() => {
    const blockedCols = new Set(columns.filter((c) => c.semantic === "blocked").map((c) => c.id));
    return demands.filter((d) => blockedCols.has(d.columnId)).length;
  }, [columns, demands]);
  const unassignedCount = useMemo(() => demands.filter((d) => !d.assignee?.trim()).length, [demands]);
  const homologCount = useMemo(() => {
    return demands.filter((d) => d.columnId.includes("VALIDATION") || d.columnId.includes("READY")).length;
  }, [demands]);

  // Filtragem
  const filtered = demands.filter((demand) => {
    const searchable = `${demand.id} ${demand.title} ${demand.assignee} ${demand.tags.join(" ")}`.toLocaleLowerCase(getActiveLocale());
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    const matchesPriority = priority === "all" || demand.priority === priority;
    const matchesAssignee = assignee === "all" || demand.assignee === assignee;
    const matchesLinked = !linkedOnly || demand.links.length > 0;

    let matchesScope = true;
    if (scopeFilter === "my") {
      matchesScope = Boolean(demand.assignee?.trim());
    } else if (scopeFilter === "sprint-42") {
      matchesScope = demand.tags.some((t) => /sprint|42|core/i.test(t));
    } else if (scopeFilter === "frontend") {
      matchesScope = demand.tags.some((t) => /front|web|ui/i.test(t)) || demand.title.toLowerCase().includes("web");
    } else if (scopeFilter === "backend") {
      matchesScope = demand.tags.some((t) => /back|api|endpoint/i.test(t)) || demand.title.toLowerCase().includes("api");
    } else if (scopeFilter === "mobile") {
      matchesScope = demand.tags.some((t) => /mobile|android|ios|app/i.test(t)) || demand.title.toLowerCase().includes("app");
    } else if (scopeFilter === "sanity") {
      matchesScope = demand.tags.some((t) => /sanity|regress/i.test(t)) || demand.title.toLowerCase().includes("regress");
    }

    let matchesChip = true;
    if (statusChipFilter === "critical") {
      matchesChip = demand.priority === "critical";
    } else if (statusChipFilter === "blocked") {
      const col = columns.find((c) => c.id === demand.columnId);
      matchesChip = col?.semantic === "blocked";
    } else if (statusChipFilter === "unassigned") {
      matchesChip = !demand.assignee?.trim();
    } else if (statusChipFilter === "homolog") {
      matchesChip = demand.columnId.includes("VALIDATION") || demand.columnId.includes("READY");
    }

    return matchesQuery && matchesPriority && matchesAssignee && matchesLinked && matchesScope && matchesChip;
  });

  const filtersActive = Boolean(
    query || priority !== "all" || assignee !== "all" || linkedOnly || scopeFilter !== "all" || statusChipFilter !== null
  );

  const clearFilters = () => {
    setQuery("");
    setPriority("all");
    setAssignee("all");
    setLinkedOnly(false);
    setScopeFilter("all");
    setStatusChipFilter(null);
  };

  const openDemand = (demand: QaDemand) => { setDraft(null); setSelectedId(demand.id); setPanel("demand"); };
  const openNewDemand = (columnId = mobileColumnId || columns[0]?.id) => {
    if (!columnId) return;
    setSelectedId(null);
    setDraft(emptyDemand(columnId, demands.filter((item) => item.columnId === columnId).length));
    setPanel("demand");
  };
  const closePanel = () => {
    setPanel(null);
    setDraft(null);
    setSelectedId(null);
  };

  const changeDemandViewMode = (value: DemandViewMode) => {
    setDemandViewMode(value);
    void setPreference({ demandViewMode: value });
  };

  const sidebarWidthLimit = () => Math.max(DEMAND_SIDEBAR_MIN, Math.min(DEMAND_SIDEBAR_MAX, window.innerWidth - 280));
  const setClampedSidebarWidth = (value: number) => {
    const next = Math.min(sidebarWidthLimit(), Math.max(DEMAND_SIDEBAR_MIN, value));
    setDemandSidebarWidth(next);
    return next;
  };

  const beginSidebarResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = demandSidebarWidth;
    let finalWidth = startWidth;
    const move = (pointerEvent: PointerEvent) => {
      finalWidth = setClampedSidebarWidth(startWidth + startX - pointerEvent.clientX);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      void setPreference({ demandSidebarWidth: finalWidth });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const handleMove = async (demandId: string, columnId: string, order?: number) => {
    const result = await moveDemand(demandId, columnId, order);
    toast.fromResult(result);
    if (result.value?.id === selectedId) setSelectedId(result.value.id);
  };

  const handleDrop = (event: DragEvent, columnId: string) => {
    event.preventDefault();
    setDragOverColumnId(null);
    const demandId =
      event.dataTransfer.getData("application/x-qaflow-demand") ||
      event.dataTransfer.getData("text/qaflow-demand") ||
      event.dataTransfer.getData("text/plain");
    if (demandId) void handleMove(demandId, columnId);
  };

  useDialogBehavior({
    open: Boolean(panel),
    onClose: closePanel,
    containerRef: panelRef,
    trapFocus: Boolean(panel),
    lockScroll: Boolean(panel),
    initialFocusSelector: 'input, textarea, [role="combobox"], h2[tabindex="-1"]',
  });

  const boardColumn = (column: DemandColumn, mobile = false) => {
    const items = filtered.filter((d) => d.columnId === column.id).sort((a, b) => a.order - b.order);
    const dropping = dragOverColumnId === column.id;
    const caption = columnHeaderCaptions[column.id] ?? semanticCaptions[column.semantic];
    const color = columnStyle(column.color);

    return (
      <section
        key={column.id}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (dragOverColumnId !== column.id) setDragOverColumnId(column.id);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOverColumnId(column.id);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragOverColumnId(null);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleDrop(event, column.id);
        }}
        className={`${mobile ? "w-full" : "w-80 shrink-0"} ${color.surface} flex min-h-80 self-start flex-col rounded-2xl border p-3 transition ${dropping ? "ring-2 ring-run-mark bg-run-tint/70" : ""}`}
        aria-labelledby={`column-${column.id}`}
      >
        {/* Cabeçalho da Coluna */}
        <div className="flex min-h-10 items-center justify-between px-1 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} aria-hidden="true" />
            <h2 id={`column-${column.id}`} className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.08em] text-body" title={column.name}>
              {column.name}
            </h2>
            <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-bold text-subtle ring-1 ring-inset ring-hairline">
              {items.length}
            </span>
          </div>
          <span className={`text-xs font-semibold ${color.caption}`}>
            {caption}
          </span>
        </div>

        {/* Lista de Cards */}
        <div className="space-y-3">
          {items.map((demand) => (
            <DemandCard
              key={demand.id}
              demand={demand}
              selected={selectedId === demand.id}
              columns={columns}
              onSelect={() => openDemand(demand)}
              onMove={(columnId) => void handleMove(demand.id, columnId)}
              onDropAt={(event) => {
                setDragOverColumnId(null);
                const demandId = event.dataTransfer.getData("text/qaflow-demand") || event.dataTransfer.getData("text/plain");
                if (demandId) {
                  void handleMove(demandId, column.id, demand.order);
                }
              }}
            />
          ))}
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-hairline-strong bg-raised/60 px-4 py-8 text-center text-xs leading-relaxed text-muted">
              {tr("Esta etapa está tranquila.")}<br />{tr("Adicione ou mova uma demanda para cá.")}
            </div>
          )}
        </div>

        {/* Botão Inferior de Adicionar Demanda */}
        <button
          type="button"
          onClick={() => openNewDemand(column.id)}
          className={`mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${color.action}`}
        >
          <Plus size={15} />
          <span>{tr("Adicionar demanda")}</span>
        </button>
      </section>
    );
  };

  const panelContent = panel === "columns"
    ? <ColumnManager columns={columns} onClose={closePanel} onResult={(result) => toast.fromResult(result)} />
    : panel === "demand" && selected
      ? (
        <DemandEditor
          key={`${selected.id}-${selected.updatedAt}`}
          demand={selected}
          columns={columns}
          viewMode={effectiveDemandViewMode}
          onViewModeChange={changeDemandViewMode}
          onClose={closePanel}
          onSaved={(_saved, message) => {
            closePanel();
            toast.show({ tone: "success", message });
          }}
        />
      )
      : null;

  return (
    <div ref={surfaceRef} className="qa-demand-surface min-h-[calc(100vh-8rem)]">
      <div className="min-w-0">
        
        {/* ================================================================= */}
        {/* 1. HEADER PRINCIPAL & BARRA UTILITÁRIA SUPERIOR                   */}
        {/* ================================================================= */}
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-body md:text-3xl">{tr("Demandas")}</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pass-line bg-pass-tint px-3 py-0.5 text-xs font-semibold text-pass-deep">
                <span className="h-1.5 w-1.5 rounded-full bg-pass-mark" aria-hidden="true" />
                {tr("Salvo localmente")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {tr("Organize o que precisa de atenção e acompanhe o trabalho do time de QA sem perder o contexto.")}
            </p>
          </div>

          {/* Barra de Ações à Direita */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Campo de Busca (limpo, sem o badge ⌘K) */}
            <div className="relative min-w-56 max-w-72">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr("Buscar demandas, bugs, IDs...")}
                className="w-full rounded-full border border-hairline bg-raised py-2 pl-9 pr-4 text-xs text-body placeholder:text-muted focus:border-faint focus:outline-none shadow-2xs"
              />
            </div>

            {/* Botão Gerenciar Colunas */}
            <button
              type="button"
              onClick={() => setPanel("columns")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-raised px-3.5 py-2 text-xs font-semibold text-control hover:bg-surface shadow-2xs cursor-pointer"
            >
              <SlidersHorizontal size={15} />
              <span>{tr("Gerenciar colunas")}</span>
            </button>

            {/* Botão + Nova Demanda */}
            <button
              type="button"
              onClick={() => openNewDemand()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-ink-hover shadow-2xs cursor-pointer"
            >
              <Plus size={16} />
              <span>{tr("Nova demanda")}</span>
            </button>
          </div>
        </header>

        {/* ================================================================= */}
        {/* 2. BARRA DE MÉTRICAS (4 CARDS DE KPI COM BADGES DE TENDÊNCIA)     */}
        {/* ================================================================= */}
        <section aria-label={tr("Indicadores de demandas")} className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {/* Card 1: Em fluxo ativo */}
          <div className="flex min-h-24 items-center justify-between rounded-2xl border border-hairline bg-raised p-4 shadow-[0_1px_3px_rgb(15_23_42/0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-shell text-control">
                <CircleDot size={20} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-muted">{tr("Em fluxo ativo")}</span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold tabular-nums text-body">{metrics.open}</strong>
                  <span className="truncate text-xs font-medium text-muted">{tr("demandas")}</span>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-pass-line bg-pass-tint px-2.5 py-0.5 text-[11px] font-semibold text-pass-deep shrink-0">
              +12% {tr("ciclo")}
            </span>
          </div>

          {/* Card 2: Lead time QA */}
          <div className="flex min-h-24 items-center justify-between rounded-2xl border border-hairline bg-raised p-4 shadow-[0_1px_3px_rgb(15_23_42/0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-shell text-control">
                <Clock size={20} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-muted">{tr("Lead time QA")}</span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold tabular-nums text-body">3.4h</strong>
                  <span className="truncate text-xs font-medium text-muted">{tr("média")}</span>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-pass-line bg-pass-tint px-2.5 py-0.5 text-[11px] font-semibold text-pass-deep shrink-0">
              {tr("Dentro da meta")}
            </span>
          </div>

          {/* Card 3: Bloqueadas */}
          <div className="flex min-h-24 items-center justify-between rounded-2xl border border-hairline bg-raised p-4 shadow-[0_1px_3px_rgb(15_23_42/0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-fail-tint text-fail">
                <CircleAlert size={20} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-muted">{tr("Bloqueadas")}</span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold tabular-nums text-body">{metrics.blocked}</strong>
                  <span className="truncate text-xs font-medium text-muted">{tr("críticas")}</span>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-fail-line bg-fail-tint px-2.5 py-0.5 text-[11px] font-semibold text-fail-deep shrink-0">
              {tr("violação")}
            </span>
          </div>

          {/* Card 4: Concluídas hoje */}
          <div className="flex min-h-24 items-center justify-between rounded-2xl border border-hairline bg-raised p-4 shadow-[0_1px_3px_rgb(15_23_42/0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-shell text-control">
                <CheckCircle2 size={20} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-muted">{tr("Concluídas hoje")}</span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold tabular-nums text-body">{metrics.completedThisWeek}</strong>
                  <span className="truncate text-xs font-medium text-muted">{tr("de 10 metas")}</span>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-hairline bg-shell px-2.5 py-0.5 text-[11px] font-semibold text-subtle shrink-0">
              80% {tr("entrega")}
            </span>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 3. BARRA DE FILTROS EM DUAS LINHAS (ESCOPO + STATUS & DROPDOWNS)   */}
        {/* ================================================================= */}
        <div className="mb-5 space-y-3">
          {/* Linha 1: Pílulas de Escopo (Segmented Pills) */}
          <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1 text-xs">
            {[
              { id: "all", label: tr("Todas as demandas") },
              { id: "my", label: tr("Minhas demandas") },
              { id: "sprint-42", label: "Sprint 42 - Core" },
              { id: "frontend", label: "Frontend Web" },
              { id: "backend", label: "APIs & Backend" },
              { id: "mobile", label: "Mobile App" },
              { id: "sanity", label: tr("Regressão Sanity") },
            ].map((item) => {
              const active = scopeFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScopeFilter(item.id)}
                  className={`rounded-full px-3.5 py-1.5 font-medium transition cursor-pointer shrink-0 ${
                    active
                      ? "bg-ink text-white shadow-2xs font-semibold"
                      : "bg-raised border border-hairline text-subtle hover:bg-surface hover:text-body"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Linha 2: Chips Rápidos de Status e Seletores à Direita */}
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            {/* Chips rápidos à esquerda */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "critical", label: tr("SLA Crítico"), count: criticalCount },
                { id: "blocked", label: tr("Bloqueadas em dev"), count: blockedDevCount },
                { id: "unassigned", label: tr("Sem QA atribuído"), count: unassignedCount },
                { id: "homolog", label: tr("Aguardando homologação"), count: homologCount },
              ].map((chip) => {
                const active = statusChipFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setStatusChipFilter(active ? null : chip.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                      active
                        ? "bg-ink text-white shadow-2xs"
                        : "bg-raised border border-hairline text-subtle hover:bg-surface"
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      active ? "bg-raised/20 text-white" : "bg-shell text-muted"
                    }`}>
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dropdowns e Checkbox à direita */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="w-44"
                ariaLabel={tr("Filtrar responsável")}
                value={assignee}
                onChange={setAssignee}
                options={assigneeOptions}
                searchable={assignees.length > 8}
                searchPlaceholder={tr("Buscar pessoa…")}
              />
              <Select
                className="w-40"
                ariaLabel={tr("Filtrar prioridade")}
                value={priority}
                onChange={setPriority}
                options={priorityFilterOptions}
              />
              <label className="flex min-h-10 items-center gap-2 rounded-xl border border-hairline bg-raised px-3 text-xs font-medium text-control cursor-pointer hover:bg-surface">
                <input
                  type="checkbox"
                  checked={linkedOnly}
                  onChange={(event) => setLinkedOnly(event.target.checked)}
                  className="h-4 w-4 accent-slate-900"
                />
                <span>{tr("Com vínculo de bug")}</span>
              </label>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-muted hover:text-body px-2 py-1 cursor-pointer"
                >
                  {tr("Limpar")}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 4. QUADRO KANBAN                                                  */}
        {/* ================================================================= */}
        <section aria-label={tr("Quadro de demandas")} className="rounded-3xl border border-hairline bg-raised/70 p-3.5 shadow-[0_1px_3px_rgb(15_23_42/0.03)] md:p-5">
          <div className="mb-3.5 flex flex-wrap items-center gap-2 px-1">
            <div>
              <h2 className="text-sm font-bold text-body">{tr("Quadro de trabalho")}</h2>
              <p className="mt-0.5 text-xs text-muted">
                {filtered.length} {filtered.length === 1 ? tr("demanda encontrada") : tr("demandas encontradas")}
              </p>
            </div>
            {!boardExpanded && (
              <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">
                <Columns3 size={17} className="shrink-0 text-muted" aria-hidden="true" />
                <Select
                  id="mobile-column"
                  className="min-w-0 max-w-64 flex-1"
                  ariaLabel={tr("Coluna visível")}
                  value={mobileColumnId}
                  onChange={setMobileColumnId}
                  options={boardColumnOptions}
                />
              </div>
            )}
          </div>

          {filtered.length === 0 && filtersActive ? (
            <div className="rounded-2xl border border-dashed border-hairline bg-surface px-5 py-12 text-center">
              <p className="text-sm font-bold text-control">{tr("Nenhuma demanda corresponde aos filtros selecionados.")}</p>
              <p className="mt-1 text-xs text-muted">{tr("Tente ajustar o escopo ou limpar os critérios para visualizar todas as colunas.")}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-xl border border-hairline bg-raised px-4 py-2 text-xs font-semibold text-control hover:bg-shell cursor-pointer shadow-2xs"
              >
                {tr("Limpar filtros")}
              </button>
            </div>
          ) : !boardExpanded ? (
            <div>
              {columns.find((c) => c.id === mobileColumnId)
                ? boardColumn(columns.find((c) => c.id === mobileColumnId)!, true)
                : null}
            </div>
          ) : (
            <div className="qa-board-scroll flex max-w-full items-start gap-3.5 overflow-x-auto pb-4" aria-label={tr("Colunas do quadro com rolagem horizontal")}>
              {columns.map((column) => boardColumn(column))}
            </div>
          )}
        </section>
      </div>

      {/* ================================================================= */}
      {/* 5. MODAL / TELA CHEIA / BARRA LATERAL (DEMANDA & COLUNAS)         */}
      {/* ================================================================= */}
      {panelContent && (
        effectiveDemandViewMode === "fullscreen" && panel === "demand" ? (
          /* Modo Tela Cheia */
          <aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={tr("Detalhes da demanda")}
            className="fixed inset-0 z-50 flex flex-col bg-raised overflow-hidden shadow-2xl"
          >
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{panelContent}</div>
          </aside>
        ) : effectiveDemandViewMode === "sidebar" && panel === "demand" ? (
          /* Modo Barra Lateral */
          <div
            className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-xs transition-opacity"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePanel();
            }}
          >
            <aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={tr("Detalhes da demanda")}
              style={{ width: `${demandSidebarWidth}px`, maxWidth: "calc(100vw - 2rem)" }}
              className="fixed inset-y-0 right-0 z-50 flex flex-col bg-raised shadow-2xl border-l border-hairline overflow-hidden"
            >
              <button
                type="button"
                aria-label={tr("Redimensionar barra lateral")}
                title={tr("Arraste para redimensionar. Use as setas do teclado para ajustes finos.")}
                onPointerDown={beginSidebarResize}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const next = setClampedSidebarWidth(demandSidebarWidth + (event.key === "ArrowLeft" ? 24 : -24));
                  void setPreference({ demandSidebarWidth: next });
                }}
                className="absolute inset-y-0 -left-3 z-10 hidden w-6 cursor-col-resize items-center justify-center text-muted transition hover:text-control sm:flex"
              >
                <span className="flex h-12 w-5 items-center justify-center rounded-full border border-hairline bg-raised shadow-sm">
                  <GripVertical size={14} aria-hidden="true" />
                </span>
              </button>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{panelContent}</div>
            </aside>
          </div>
        ) : (
          /* Modo Modal (janela centralizada com backdrop) */
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePanel();
            }}
          >
            <aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={panel === "columns" ? tr("Gerenciar colunas") : tr("Detalhes da demanda")}
              className={`relative flex flex-col w-full bg-raised rounded-3xl shadow-2xl border border-hairline overflow-hidden my-auto ${
                panel === "columns"
                  ? "max-w-2xl h-[min(44rem,calc(100dvh-3rem))]"
                  : "max-w-3xl h-[min(48rem,calc(100dvh-3rem))]"
              }`}
            >
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{panelContent}</div>
            </aside>
          </div>
        )
      )}
    </div>
  );
}
