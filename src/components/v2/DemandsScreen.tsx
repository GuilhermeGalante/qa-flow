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

const priorityStyles: Record<CasePriority, string> = {
  low: "bg-slate-100 text-slate-600 border border-slate-200/80",
  medium: "bg-blue-50 text-blue-700 border border-blue-200/80",
  high: "bg-amber-50 text-amber-800 border border-amber-200/80",
  critical: "bg-rose-50 text-rose-700 border border-rose-200/80 font-bold",
};

const semanticLabels: Record<DemandColumnSemantic, string> = {
  neutral: "Neutra",
  active: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

const semanticDots: Record<DemandColumnSemantic, string> = {
  neutral: "bg-slate-400",
  active: "bg-sky-500",
  blocked: "bg-rose-500",
  done: "bg-emerald-500",
};

const semanticHints: Record<DemandColumnSemantic, string> = {
  neutral: "Não entra em nenhum indicador",
  active: "Conta como demanda aberta",
  blocked: "Conta como bloqueada",
  done: "Conta como concluída",
};

const semanticOptions: SelectOption<DemandColumnSemantic>[] = (Object.keys(semanticLabels) as DemandColumnSemantic[])
  .map((value) => ({ value, label: semanticLabels[value], hint: semanticHints[value] }));

const priorityOptions: SelectOption<CasePriority>[] = (Object.keys(priorityLabel) as CasePriority[])
  .map((value) => ({ value, label: priorityLabel[value] }));

const linkTypeLabel: Record<DemandLinkType, string> = {
  case: "Caso",
  plan: "Plano",
  run: "Execução",
  report: "Relatório",
};

const semanticSurfaces: Record<DemandColumnSemantic, string> = {
  neutral: "bg-slate-50/70 border-slate-200/80",
  active: "bg-sky-50/40 border-sky-200/90 ring-1 ring-sky-100/70",
  blocked: "bg-rose-50/40 border-rose-200/90 ring-1 ring-rose-100/70",
  done: "bg-emerald-50/30 border-emerald-200/80",
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
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
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
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts.at(-1)?.[0] ?? "" : parts[0]?.[1] ?? ""}`.toLocaleUpperCase("pt-BR");
}

function formatShortDate(value?: string): string {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" })
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
    () => columns.map((column) => ({ value: column.id, label: column.name })),
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
      className={`group relative rounded-2xl border bg-white p-3.5 shadow-[0_1px_3px_rgb(15_23_42/0.03),0_6px_14px_rgb(15_23_42/0.02)] transition-all duration-200 cursor-pointer ${
        dropTarget
          ? "border-sky-400 ring-2 ring-sky-100 scale-[1.01]"
          : selected
            ? "border-sky-500 ring-2 ring-sky-100"
            : "border-slate-200/80 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_4px_16px_rgb(15_23_42/0.08)]"
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
          <span className="truncate font-mono text-xs font-bold tracking-tight text-slate-500">
            {displayCode}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${priorityStyles[demand.priority]}`}>
            {priorityLabel[demand.priority]}
          </span>
          <GripVertical size={14} aria-hidden="true" className="shrink-0 cursor-grab text-slate-300 group-hover:text-slate-500" />
        </div>
      </div>

      {/* Título da Demanda */}
      <p className="mt-2 text-sm font-bold leading-snug text-slate-900 group-hover:text-sky-700 transition">
        {demand.title}
      </p>

      {/* Tags reais da demanda (se houver) */}
      {demand.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {demand.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Indicadores reais: Responsável, Prazo, Checklist e Links */}
      {(demand.assignee || demand.dueDate || demand.checklist.length > 0 || demand.links.length > 0) && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          <span className="truncate text-[11px] font-medium text-slate-600">
            {demand.assignee || "Sem responsável"}
          </span>
          <div className="flex items-center gap-2.5 shrink-0 text-[11px] font-medium text-slate-400">
            {demand.checklist.length > 0 && (
              <span className="flex items-center gap-1" title="Checklist concluído">
                <ListChecks size={12} />
                {demand.checklist.filter((c) => c.done).length}/{demand.checklist.length}
              </span>
            )}
            {demand.links.length > 0 && (
              <span className="flex items-center gap-1" title="Artefatos vinculados">
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
          className="ml-auto flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={`Organizar ${demand.title}`}
          title="Mover de coluna"
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </summary>
        <div className="mt-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <label className="block text-[11px] font-bold text-slate-600" htmlFor={`move-${demand.id}`}>
            Mover para
          </label>
          <Select
            id={`move-${demand.id}`}
            className="mt-1"
            ariaLabel={`Mover ${demand.title} para outra coluna`}
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
      aria-label="Modo de visualização da demanda"
      className="hidden sm:inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100/90 p-1"
    >
      <button
        type="button"
        aria-label="Visualização em modal central"
        title="Modo Modal (janela central)"
        aria-pressed={value === "modal"}
        onClick={() => onChange("modal")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer ${
          value === "modal"
            ? "bg-white text-slate-950 shadow-2xs font-bold"
            : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/60"
        }`}
      >
        <AppWindow size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Visualização em tela cheia"
        title="Modo Tela Cheia (área ampla)"
        aria-pressed={value === "fullscreen"}
        onClick={() => onChange("fullscreen")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer ${
          value === "fullscreen"
            ? "bg-white text-slate-950 shadow-2xs font-bold"
            : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/60"
        }`}
      >
        <Maximize2 size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Visualização em barra lateral"
        title="Modo Barra Lateral (painel à direita)"
        aria-pressed={value === "sidebar"}
        onClick={() => onChange("sidebar")}
        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition cursor-pointer ${
          value === "sidebar"
            ? "bg-white text-slate-950 shadow-2xs font-bold"
            : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/60"
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
    () => columns.map((column) => ({ value: column.id, label: column.name })),
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
      title: "Excluir esta demanda?",
      description: "Esta ação não pode ser desfeita. A demanda, seu checklist e seus vínculos serão removidos.",
      itemLabel: draft.title || draft.id,
      confirmLabel: "Excluir definitivamente",
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
    <form onSubmit={submit} className="flex h-full flex-col bg-white">
      {/* Header do Form */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div className="min-w-0">
          <h2 tabIndex={-1} className="text-lg font-bold text-slate-900">
            {existing ? "Detalhes da demanda" : "Registrar demanda"}
          </h2>
          {existing && <p className="mt-0.5 truncate font-mono text-xs font-semibold text-slate-400">{draft.id}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <DemandLayoutChooser value={viewMode} onChange={onViewModeChange} />
          <button
            type="button"
            aria-label="Fechar detalhes"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X size={19} />
          </button>
        </div>
      </div>

      {/* Conteúdo rolável */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <div className={`mx-auto space-y-5 ${viewMode === "sidebar" ? "max-w-none" : "max-w-3xl"}`}>
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <label className="block text-xs font-bold text-slate-700">Título
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Ex.: Validar smoke Android" />
          </label>
          <label className="block text-xs font-bold text-slate-700">Descrição
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${inputClass} mt-1.5 min-h-28 resize-y`} placeholder="Contexto, objetivo e critérios relevantes para o QA." />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="text-xs font-bold text-slate-700">
              <label htmlFor="demand-column">Coluna</label>
              <Select id="demand-column" className="mt-1.5" ariaLabel="Coluna da demanda" value={draft.columnId} onChange={(columnId) => setDraft({ ...draft, columnId })} options={columnOptions} />
            </div>
            <div className="text-xs font-bold text-slate-700">
              <label htmlFor="demand-priority">Prioridade</label>
              <Select id="demand-priority" className="mt-1.5" ariaLabel="Prioridade da demanda" value={draft.priority} onChange={(priority) => setDraft({ ...draft, priority })} options={priorityOptions} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">Responsável
              <input value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Nome livre" />
            </label>
            <label className="block text-xs font-bold text-slate-700">Prazo
              <input type="date" value={draft.dueDate ?? ""} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value || undefined })} className={`${inputClass} mt-1.5`} />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-700">Tags
            <input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} className={`${inputClass} mt-1.5`} placeholder="android, smoke" />
          </label>

          <section aria-labelledby="checklist-heading" className="border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between">
              <h3 id="checklist-heading" className="text-sm font-bold text-slate-900">Checklist</h3>
              <span className="text-xs font-semibold text-slate-400">{draft.checklist.filter((item) => item.done).length}/{draft.checklist.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {draft.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <input type="checkbox" checked={item.done} onChange={() => setDraft((current) => ({ ...current, checklist: current.checklist.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) }))} className="h-4 w-4 accent-slate-900 cursor-pointer" aria-label={`Concluir ${item.label}`} />
                  <span className={`min-w-0 flex-1 text-sm ${item.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{item.label}</span>
                  <button type="button" aria-label={`Remover ${item.label}`} onClick={() => setDraft((current) => ({ ...current, checklist: current.checklist.filter((entry) => entry.id !== item.id) }))} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600 cursor-pointer"><X size={15} /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={checklistLabel} onChange={(event) => setChecklistLabel(event.target.value)} className={`${inputClass} min-w-0`} placeholder="Novo item" />
              <button type="button" className={buttonSecondary} onClick={() => {
                const label = checklistLabel.trim();
                if (!label) return;
                setDraft((current) => ({ ...current, checklist: [...current.checklist, { id: createId("CHK"), label, done: false }] }));
                setChecklistLabel("");
              }}><Plus size={16} />Adicionar</button>
            </div>
          </section>

          <section aria-labelledby="links-heading" className="border-t border-slate-100 pt-5">
            <h3 id="links-heading" className="text-sm font-bold text-slate-900">Artefatos vinculados</h3>
            <Select
              className="mt-3"
              ariaLabel="Adicionar artefato vinculado"
              value=""
              onChange={addLink}
              options={artifactOptions}
              searchable
              searchPlaceholder="Buscar caso, plano, execução ou relatório…"
              placeholder="Adicionar caso, plano, execução ou relatório…"
              emptyLabel="Nenhum artefato disponível para vincular."
            />
            <div className="mt-2 space-y-2">
              {draft.links.map((link: DemandLink) => (
                <div key={`${link.type}-${link.id}`} className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  <Link2 size={14} className="text-slate-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{link.label}</span>
                  <button type="button" aria-label={`Desvincular ${link.label}`} onClick={() => setDraft((current) => ({ ...current, links: current.links.filter((entry) => entry.type !== link.type || entry.id !== link.id) }))} className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-rose-600 cursor-pointer"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Footer com botões */}
      <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
        {existing && (
          <Button variant="danger" className="mr-auto" loading={deleting} loadingLabel="Excluindo…" icon={<Trash2 size={16} />} onClick={() => void requestDelete()}>
            Excluir
          </Button>
        )}
        <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
        <Button type="submit" variant="primary" loading={saving} loadingLabel="Salvando…" icon={<Check size={16} />}>Salvar</Button>
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

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
        <h2 tabIndex={-1} className="text-lg font-bold text-slate-900">Gerenciar colunas</h2>
        <button type="button" aria-label="Fechar gerenciador" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"><X size={19} /></button>
      </div>
      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto px-6 py-5">
        <p className="text-sm leading-relaxed text-slate-500">O significado alimenta os indicadores, independentemente do nome escolhido.</p>
        {columns.map((column, index) => <ColumnRow key={column.id} column={column} first={index === 0} last={index === columns.length - 1} onMove={async (id, direction) => onResult(await moveColumn(id, direction))} onUpdate={async (name, semantic) => onResult(await updateColumn(column.id, name, semantic))} onDelete={async () => onResult(await deleteColumn(column.id))} />)}
      </div>
      <form className="shrink-0 space-y-3 border-t border-slate-100 p-6 bg-slate-50/50" onSubmit={async (event) => {
        event.preventDefault();
        const result = await addColumn(newName, newSemantic);
        onResult(result);
        if (result.ok) { setNewName(""); setNewSemantic("neutral"); }
      }}>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Nova coluna</p>
        <input value={newName} onChange={(event) => setNewName(event.target.value)} className={inputClass} placeholder="Ex.: Pronto para release" />
        <div className="flex items-center gap-2">
          <Select className="min-w-0 flex-1" ariaLabel="Significado da nova coluna" value={newSemantic} onChange={setNewSemantic} options={semanticOptions} />
          <button className={buttonPrimary} type="submit"><Plus size={16} />Criar</button>
          <button type="button" onClick={onClose} className={buttonSecondary}>Fechar</button>
        </div>
      </form>
    </div>
  );
}

function ColumnRow({ column, first, last, onMove, onUpdate, onDelete }: { column: DemandColumn; first: boolean; last: boolean; onMove: (id: string, direction: -1 | 1) => void; onUpdate: (name: string, semantic: DemandColumnSemantic) => void; onDelete: () => void }) {
  const [name, setName] = useState(column.name);
  const [semantic, setSemantic] = useState(column.semantic);
  return (
    <div className="rounded-2xl border border-slate-200 p-3.5 bg-white">
      <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} aria-label="Nome da coluna" />
      <Select className="mt-2" ariaLabel={`Significado da coluna ${column.name}`} value={semantic} onChange={setSemantic} options={semanticOptions} />
      <div className="mt-2 flex items-center gap-1.5">
        <button type="button" disabled={first} onClick={() => onMove(column.id, -1)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30 cursor-pointer" aria-label={`Mover ${column.name} para a esquerda`}><ArrowLeft size={15} /></button>
        <button type="button" disabled={last} onClick={() => onMove(column.id, 1)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30 cursor-pointer" aria-label={`Mover ${column.name} para a direita`}><ArrowRight size={15} /></button>
        <button type="button" onClick={() => onDelete()} className="ml-auto rounded-xl p-2 text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label={`Excluir ${column.name}`}><Trash2 size={15} /></button>
        <button type="button" onClick={() => onUpdate(name, semantic)} className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer">Salvar</button>
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
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");

  const assignees = [...new Set(demands.map((d) => d.assignee).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const assigneeOptions: SelectOption[] = [{ value: "all", label: "Todos os responsáveis" }, ...assignees.map((value) => ({ value, label: value }))];
  const priorityFilterOptions: SelectOption<CasePriority | "all">[] = [{ value: "all", label: "Todas as prioridades" }, ...priorityOptions];
  const boardColumnOptions: SelectOption[] = columns.map((column) => ({ value: column.id, label: column.name, hint: semanticLabels[column.semantic] }));

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
    const searchable = `${demand.id} ${demand.title} ${demand.assignee} ${demand.tags.join(" ")}`.toLocaleLowerCase("pt-BR");
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
    const isExecutionCol = column.semantic === "active";
    const isBlockedCol = column.semantic === "blocked";

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
        className={`${mobile ? "w-full" : "w-80 shrink-0"} ${semanticSurfaces[column.semantic]} flex min-h-80 self-start flex-col rounded-2xl border p-3 transition ${dropping ? "ring-2 ring-sky-400 bg-sky-50/40" : ""}`}
        aria-labelledby={`column-${column.id}`}
      >
        {/* Cabeçalho da Coluna */}
        <div className="flex min-h-10 items-center justify-between px-1 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${semanticDots[column.semantic]}`} aria-hidden="true" />
            <h2 id={`column-${column.id}`} className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.08em] text-slate-900" title={column.name}>
              {column.name}
            </h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-200">
              {items.length}
            </span>
          </div>
          <span className={`text-xs font-semibold ${isExecutionCol ? "text-sky-600" : isBlockedCol ? "text-rose-600" : "text-slate-400"}`}>
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
            <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-xs leading-relaxed text-slate-500">
              Esta etapa está tranquila.<br />Adicione ou mova uma demanda para cá.
            </div>
          )}
        </div>

        {/* Botão Inferior de Adicionar Demanda */}
        <button
          type="button"
          onClick={() => openNewDemand(column.id)}
          className={`mt-3 flex min-h-10 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
            isExecutionCol
              ? "border-sky-300/80 bg-sky-50/60 text-sky-700 hover:bg-sky-100 hover:border-sky-400"
              : isBlockedCol
                ? "border-rose-300/80 bg-rose-50/60 text-rose-700 hover:bg-rose-100 hover:border-rose-400"
                : "border-dashed border-slate-300 bg-white/60 text-slate-600 hover:border-slate-400 hover:bg-white hover:text-slate-900"
          }`}
        >
          <Plus size={15} />
          <span>Adicionar demanda</span>
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
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Demandas</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50 px-3 py-0.5 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                Salvo localmente
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Organize o que precisa de atenção e acompanhe o trabalho do time de QA sem perder o contexto.
            </p>
          </div>

          {/* Barra de Ações à Direita */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Campo de Busca (limpo, sem o badge ⌘K) */}
            <div className="relative min-w-56 max-w-72">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar demandas, bugs, IDs..."
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none shadow-2xs"
              />
            </div>

            {/* Botão Gerenciar Colunas */}
            <button
              type="button"
              onClick={() => setPanel("columns")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs cursor-pointer"
            >
              <SlidersHorizontal size={15} />
              <span>Gerenciar colunas</span>
            </button>

            {/* Botão + Nova Demanda */}
            <button
              type="button"
              onClick={() => openNewDemand()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 shadow-2xs cursor-pointer"
            >
              <Plus size={16} />
              <span>Nova demanda</span>
            </button>
          </div>
        </header>

        {/* ================================================================= */}
        {/* 2. BARRA DE MÉTRICAS (4 CARDS DE KPI COM BADGES DE TENDÊNCIA)     */}
        {/* ================================================================= */}
        <section aria-label="Indicadores de demandas" className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {/* Card 1: Em fluxo ativo */}
          <div className="flex min-h-24 items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgb(15_23_42/0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
                <CircleDot size={20} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-slate-500">Em fluxo ativo</span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold tabular-nums text-slate-900">{metrics.open}</strong>
                  <span className="truncate text-xs font-medium text-slate-400">demandas</span>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 shrink-0">
              +12% ciclo
            </span>
          </div>

          {/* Card 2: Lead time QA */}
          <div className="flex min-h-24 items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgb(15_23_42/0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
                <Clock size={20} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-slate-500">Lead time QA</span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold tabular-nums text-slate-900">3.4h</strong>
                  <span className="truncate text-xs font-medium text-slate-400">média</span>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 shrink-0">
              No target
            </span>
          </div>

          {/* Card 3: Bloqueadas */}
          <div className="flex min-h-24 items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgb(15_23_42/0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <CircleAlert size={20} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-slate-500">Bloqueadas</span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold tabular-nums text-slate-900">{metrics.blocked}</strong>
                  <span className="truncate text-xs font-medium text-slate-400">críticas</span>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 shrink-0">
              breach
            </span>
          </div>

          {/* Card 4: Concluídas hoje */}
          <div className="flex min-h-24 items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgb(15_23_42/0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-800">
                <CheckCircle2 size={20} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-medium text-slate-500">Concluídas hoje</span>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-2xl font-bold tabular-nums text-slate-900">{metrics.completedThisWeek}</strong>
                  <span className="truncate text-xs font-medium text-slate-400">de 10 metas</span>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 shrink-0">
              80% entrega
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
              { id: "all", label: "Todas as demandas" },
              { id: "my", label: "Minhas demandas" },
              { id: "sprint-42", label: "Sprint 42 - Core" },
              { id: "frontend", label: "Frontend Web" },
              { id: "backend", label: "APIs & Backend" },
              { id: "mobile", label: "Mobile App" },
              { id: "sanity", label: "Regressão Sanity" },
            ].map((item) => {
              const active = scopeFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScopeFilter(item.id)}
                  className={`rounded-full px-3.5 py-1.5 font-medium transition cursor-pointer shrink-0 ${
                    active
                      ? "bg-slate-900 text-white shadow-2xs font-semibold"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
                { id: "critical", label: "SLA Crítico", count: criticalCount },
                { id: "blocked", label: "Bloqueadas em dev", count: blockedDevCount },
                { id: "unassigned", label: "Sem QA atribuído", count: unassignedCount },
                { id: "homolog", label: "Aguardando homologação", count: homologCount },
              ].map((chip) => {
                const active = statusChipFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setStatusChipFilter(active ? null : chip.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                      active
                        ? "bg-slate-900 text-white shadow-2xs"
                        : "bg-white border border-slate-200/90 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>{chip.label}</span>
                    <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
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
                ariaLabel="Filtrar responsável"
                value={assignee}
                onChange={setAssignee}
                options={assigneeOptions}
                searchable={assignees.length > 8}
                searchPlaceholder="Buscar pessoa…"
              />
              <Select
                className="w-40"
                ariaLabel="Filtrar prioridade"
                value={priority}
                onChange={setPriority}
                options={priorityFilterOptions}
              />
              <label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={linkedOnly}
                  onChange={(event) => setLinkedOnly(event.target.checked)}
                  className="h-4 w-4 accent-slate-900"
                />
                <span>Com vínculo de bug</span>
              </label>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 px-2 py-1 cursor-pointer"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 4. QUADRO KANBAN                                                  */}
        {/* ================================================================= */}
        <section aria-label="Quadro de demandas" className="rounded-3xl border border-slate-200/80 bg-white/70 p-3.5 shadow-[0_1px_3px_rgb(15_23_42/0.03)] md:p-5">
          <div className="mb-3.5 flex flex-wrap items-center gap-2 px-1">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Quadro de trabalho</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {filtered.length} {filtered.length === 1 ? "demanda encontrada" : "demandas encontradas"}
              </p>
            </div>
            {!boardExpanded && (
              <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">
                <Columns3 size={17} className="shrink-0 text-slate-400" aria-hidden="true" />
                <Select
                  id="mobile-column"
                  className="min-w-0 max-w-64 flex-1"
                  ariaLabel="Coluna visível"
                  value={mobileColumnId}
                  onChange={setMobileColumnId}
                  options={boardColumnOptions}
                />
              </div>
            )}
          </div>

          {filtered.length === 0 && filtersActive ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
              <p className="text-sm font-bold text-slate-700">Nenhuma demanda corresponde aos filtros selecionados.</p>
              <p className="mt-1 text-xs text-slate-400">Tente ajustar o escopo ou limpar os critérios para visualizar todas as colunas.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer shadow-2xs"
              >
                Limpar filtros
              </button>
            </div>
          ) : !boardExpanded ? (
            <div>
              {columns.find((c) => c.id === mobileColumnId)
                ? boardColumn(columns.find((c) => c.id === mobileColumnId)!, true)
                : null}
            </div>
          ) : (
            <div className="qa-board-scroll flex max-w-full items-start gap-3.5 overflow-x-auto pb-4" aria-label="Colunas do quadro com rolagem horizontal">
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
            aria-label="Detalhes da demanda"
            className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden shadow-2xl"
          >
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{panelContent}</div>
          </aside>
        ) : effectiveDemandViewMode === "sidebar" && panel === "demand" ? (
          /* Modo Barra Lateral */
          <div
            className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-xs transition-opacity"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePanel();
            }}
          >
            <aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Detalhes da demanda"
              style={{ width: `${demandSidebarWidth}px`, maxWidth: "calc(100vw - 2rem)" }}
              className="fixed inset-y-0 right-0 z-50 flex flex-col bg-white shadow-2xl border-l border-slate-200 overflow-hidden"
            >
              <button
                type="button"
                aria-label="Redimensionar barra lateral"
                title="Arraste para redimensionar. Use as setas do teclado para ajustes finos."
                onPointerDown={beginSidebarResize}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const next = setClampedSidebarWidth(demandSidebarWidth + (event.key === "ArrowLeft" ? 24 : -24));
                  void setPreference({ demandSidebarWidth: next });
                }}
                className="absolute inset-y-0 -left-3 z-10 hidden w-6 cursor-col-resize items-center justify-center text-slate-400 transition hover:text-slate-700 sm:flex"
              >
                <span className="flex h-12 w-5 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
                  <GripVertical size={14} aria-hidden="true" />
                </span>
              </button>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{panelContent}</div>
            </aside>
          </div>
        ) : (
          /* Modo Modal (janela centralizada com backdrop) */
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePanel();
            }}
          >
            <aside
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={panel === "columns" ? "Gerenciar colunas" : "Detalhes da demanda"}
              className={`relative flex flex-col w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto ${
                panel === "columns"
                  ? "max-w-lg h-[min(44rem,calc(100dvh-3rem))]"
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
