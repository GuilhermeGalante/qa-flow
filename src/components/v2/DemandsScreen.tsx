import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDot,
  Columns3,
  GripVertical,
  Link2,
  ListChecks,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
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
import { buttonDanger, buttonPrimary, buttonSecondary, inputClass, priorityLabel } from "./Shared";

const priorityStyles: Record<CasePriority, string> = {
  low: "bg-violet-50 text-violet-700",
  medium: "bg-amber-50 text-amber-800",
  high: "bg-rose-50 text-rose-700",
  critical: "bg-rose-100 text-rose-900 ring-1 ring-inset ring-rose-200",
};

const semanticLabels: Record<DemandColumnSemantic, string> = {
  neutral: "Neutra",
  active: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

const semanticDots: Record<DemandColumnSemantic, string> = {
  neutral: "bg-slate-400",
  active: "bg-cyan-500",
  blocked: "bg-rose-500",
  done: "bg-emerald-500",
};

const semanticSurfaces: Record<DemandColumnSemantic, string> = {
  neutral: "bg-slate-100/80",
  active: "bg-cyan-50/70",
  blocked: "bg-rose-50/65",
  done: "bg-emerald-50/70",
};

const metricCards = [
  { key: "open", label: "Abertas", icon: CircleDot, tone: "text-cyan-700 bg-cyan-50" },
  { key: "blocked", label: "Bloqueadas", icon: LockKeyhole, tone: "text-rose-600 bg-rose-50" },
  { key: "overdue", label: "Vencidas", icon: CircleAlert, tone: "text-amber-600 bg-amber-50" },
  { key: "completedThisWeek", label: "Concluídas nesta semana", icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" },
] as const;

function formatDate(value?: string): string {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
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
  onReorder,
  onDropAt,
}: {
  demand: QaDemand;
  selected: boolean;
  columns: DemandColumn[];
  onSelect: () => void;
  onMove: (columnId: string) => void;
  onReorder: (order: number) => void;
  onDropAt: (event: DragEvent) => void;
}) {
  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/qaflow-demand", demand.id);
      }}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onDrop={(event) => { event.stopPropagation(); onDropAt(event); }}
      className={`group rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.06),0_8px_20px_rgb(15_23_42/0.04)] transition duration-200 ${selected ? "border-cyan-500 ring-2 ring-cyan-100" : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_2px_4px_rgb(15_23_42/0.08),0_12px_24px_rgb(15_23_42/0.07)]"}`}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left" aria-label={`Abrir detalhes de ${demand.title}`}>
          <span className="block font-mono text-[0.6875rem] font-semibold tracking-wide text-slate-500">{demand.id.slice(0, 14)}</span>
          <span className="mt-1.5 block text-[0.9375rem] font-semibold leading-snug text-slate-900">{demand.title}</span>
        </button>
        <GripVertical size={16} aria-hidden="true" className="mt-0.5 shrink-0 cursor-grab text-slate-300 group-hover:text-slate-500" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyles[demand.priority]}`}>{priorityLabel[demand.priority]}</span>
        {demand.tags.slice(0, 2).map((tag) => <span key={tag} title={tag} className="max-w-28 truncate rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{tag}</span>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="flex min-w-0 max-w-[68%] items-center gap-1.5" title={demand.assignee || "Sem responsável"}><UserRound size={13} aria-hidden="true" /><span className="truncate">{demand.assignee || "Sem responsável"}</span></span>
        <span className="flex shrink-0 items-center gap-1.5" title={formatDate(demand.dueDate)}><CalendarDays size={13} aria-hidden="true" />{formatShortDate(demand.dueDate)}</span>
      </div>
      {(demand.links.length > 0 || demand.checklist.length > 0) && (
        <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-slate-500">
          {demand.links.length > 0 && <span className="flex items-center gap-1"><Link2 size={13} aria-hidden="true" />{demand.links.length}</span>}
          {demand.checklist.length > 0 && <span className="flex items-center gap-1"><ListChecks size={13} aria-hidden="true" />{demand.checklist.filter((item) => item.done).length}/{demand.checklist.length}</span>}
        </div>
      )}
      <details className="relative mt-2 border-t border-slate-100 pt-2">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Organizar demanda<MoreHorizontal size={15} aria-hidden="true" /></summary>
        <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <label className="block text-xs font-bold text-slate-600">Mover para
            <select value={demand.columnId} onChange={(event) => onMove(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700">
              {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button type="button" onClick={() => onReorder(demand.order - 1)} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 p-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><ArrowUp size={14} />Subir</button>
            <button type="button" onClick={() => onReorder(demand.order + 1)} className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 p-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><ArrowDown size={14} />Descer</button>
          </div>
        </div>
      </details>
    </article>
  );
}

function DemandEditor({ demand, columns, onClose, onSaved }: {
  demand: QaDemand;
  columns: DemandColumn[];
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
  const [draft, setDraft] = useState(demand);
  const [checklistLabel, setChecklistLabel] = useState("");
  const [error, setError] = useState("");

  const artifacts = useMemo(() => [
    ...cases.map((item) => ({ type: "case" as const, id: item.id, label: `Caso · ${item.id} — ${item.title}` })),
    ...plans.map((item) => ({ type: "plan" as const, id: item.id, label: `Plano · ${item.id} — ${item.name}` })),
    ...runs.map((item) => ({ type: "run" as const, id: item.id, label: `Execução · ${item.id} — ${item.snapshot.plan.name}` })),
    ...reports.map((item) => ({ type: "report" as const, id: item.id, label: `Relatório · ${item.title}` })),
  ], [cases, plans, reports, runs]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await saveDemand(draft);
    if (!result.ok || !result.value) { setError(result.message); return; }
    onSaved(result.value, result.message);
  };

  const addLink = (value: string) => {
    const [type, id] = value.split("::") as [DemandLinkType, string];
    const artifact = artifacts.find((item) => item.type === type && item.id === id);
    if (!artifact || draft.links.some((link) => link.type === type && link.id === id)) return;
    setDraft((current) => ({ ...current, links: [...current.links, artifact] }));
  };

  return (
    <form onSubmit={submit} className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 tabIndex={-1} className="text-lg font-semibold text-slate-950">{existing ? "Detalhes da demanda" : "Registrar demanda"}</h2>
          {existing && <p className="mt-1 font-mono text-xs font-semibold text-slate-500">{draft.id.slice(0, 18)}</p>}
        </div>
        <button type="button" aria-label="Fechar detalhes" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={19} /></button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
        <label className="block text-xs font-bold text-slate-700">Título
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Ex.: Validar smoke Android" />
        </label>
        <label className="block text-xs font-bold text-slate-700">Descrição
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${inputClass} mt-1.5 min-h-28 resize-y`} placeholder="Contexto, objetivo e critérios relevantes para o QA." />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-slate-700">Coluna
            <select value={draft.columnId} onChange={(event) => setDraft({ ...draft, columnId: event.target.value })} className={`${inputClass} mt-1.5`}>
              {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-700">Prioridade
            <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as CasePriority })} className={`${inputClass} mt-1.5`}>
              {(Object.keys(priorityLabel) as CasePriority[]).map((priority) => <option key={priority} value={priority}>{priorityLabel[priority]}</option>)}
            </select>
          </label>
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

        <section aria-labelledby="checklist-heading" className="border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between"><h3 id="checklist-heading" className="text-sm font-semibold text-slate-900">Checklist</h3><span className="text-xs font-semibold text-slate-500">{draft.checklist.filter((item) => item.done).length}/{draft.checklist.length}</span></div>
          <div className="mt-3 space-y-2">
            {draft.checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <input type="checkbox" checked={item.done} onChange={() => setDraft((current) => ({ ...current, checklist: current.checklist.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) }))} className="h-4 w-4 accent-cyan-600" aria-label={`Concluir ${item.label}`} />
                <span className={`min-w-0 flex-1 text-sm ${item.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{item.label}</span>
                <button type="button" aria-label={`Remover ${item.label}`} onClick={() => setDraft((current) => ({ ...current, checklist: current.checklist.filter((entry) => entry.id !== item.id) }))} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-rose-600"><X size={15} /></button>
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

        <section aria-labelledby="links-heading" className="border-t border-slate-200 pt-5">
          <h3 id="links-heading" className="text-sm font-semibold text-slate-900">Artefatos vinculados</h3>
          <select defaultValue="" onChange={(event) => { addLink(event.target.value); event.currentTarget.value = ""; }} className={`${inputClass} mt-3`}>
            <option value="">Adicionar caso, plano, execução ou relatório…</option>
            {artifacts.map((artifact) => <option key={`${artifact.type}-${artifact.id}`} value={`${artifact.type}::${artifact.id}`}>{artifact.label}</option>)}
          </select>
          <div className="mt-2 space-y-2">
            {draft.links.map((link: DemandLink) => (
              <div key={`${link.type}-${link.id}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <Link2 size={14} className="text-cyan-700" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{link.label}</span>
                <button type="button" aria-label={`Desvincular ${link.label}`} onClick={() => setDraft((current) => ({ ...current, links: current.links.filter((entry) => entry.type !== link.type || entry.id !== link.id) }))} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-rose-600"><X size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-4">
        {existing && <button type="button" className={`${buttonDanger} mr-auto`} onClick={async () => {
          if (!window.confirm("Excluir esta demanda? Esta ação não pode ser desfeita.")) return;
          const result = await deleteDemand(draft.id);
          if (result.ok) onClose(); else setError(result.message);
        }}><Trash2 size={16} />Excluir</button>}
        <button type="button" onClick={onClose} className={buttonSecondary}>Cancelar</button>
        <button type="submit" className={buttonPrimary}><Check size={16} />Salvar</button>
      </div>
    </form>
  );
}

function ColumnManager({ columns, onClose, onNotice }: { columns: DemandColumn[]; onClose: () => void; onNotice: (message: string) => void }) {
  const addColumn = useQaStore((state) => state.addDemandColumn);
  const updateColumn = useQaStore((state) => state.updateDemandColumn);
  const deleteColumn = useQaStore((state) => state.deleteDemandColumn);
  const moveColumn = useQaStore((state) => state.moveDemandColumn);
  const [newName, setNewName] = useState("");
  const [newSemantic, setNewSemantic] = useState<DemandColumnSemantic>("neutral");

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 tabIndex={-1} className="text-lg font-semibold text-slate-950">Gerenciar colunas</h2>
        <button type="button" aria-label="Fechar gerenciador" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
        <p className="text-sm leading-relaxed text-slate-600">O significado alimenta os indicadores, independentemente do nome escolhido.</p>
        {columns.map((column, index) => <ColumnRow key={column.id} column={column} first={index === 0} last={index === columns.length - 1} onMove={moveColumn} onUpdate={async (name, semantic) => onNotice((await updateColumn(column.id, name, semantic)).message)} onDelete={async () => onNotice((await deleteColumn(column.id)).message)} />)}
      </div>
      <form className="space-y-3 border-t border-slate-200 p-5" onSubmit={async (event) => {
        event.preventDefault();
        const result = await addColumn(newName, newSemantic);
        onNotice(result.message);
        if (result.ok) { setNewName(""); setNewSemantic("neutral"); }
      }}>
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Nova coluna</p>
        <input value={newName} onChange={(event) => setNewName(event.target.value)} className={inputClass} placeholder="Ex.: Pronto para release" />
        <div className="flex gap-2"><select value={newSemantic} onChange={(event) => setNewSemantic(event.target.value as DemandColumnSemantic)} className={`${inputClass} min-w-0`}>{Object.entries(semanticLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className={buttonPrimary} type="submit"><Plus size={16} />Criar</button></div>
      </form>
    </div>
  );
}

function ColumnRow({ column, first, last, onMove, onUpdate, onDelete }: { column: DemandColumn; first: boolean; last: boolean; onMove: (id: string, direction: -1 | 1) => void; onUpdate: (name: string, semantic: DemandColumnSemantic) => void; onDelete: () => void }) {
  const [name, setName] = useState(column.name);
  const [semantic, setSemantic] = useState(column.semantic);
  return <div className="rounded-xl border border-slate-200 p-3">
    <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} aria-label="Nome da coluna" />
    <select value={semantic} onChange={(event) => setSemantic(event.target.value as DemandColumnSemantic)} className={`${inputClass} mt-2`} aria-label="Significado da coluna">{Object.entries(semanticLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <div className="mt-2 flex items-center gap-1">
      <button type="button" disabled={first} onClick={() => onMove(column.id, -1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30" aria-label={`Mover ${column.name} para a esquerda`}><ArrowLeft size={15} /></button>
      <button type="button" disabled={last} onClick={() => onMove(column.id, 1)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-30" aria-label={`Mover ${column.name} para a direita`}><ArrowRight size={15} /></button>
      <button type="button" onClick={() => onDelete()} className="ml-auto rounded-lg p-2 text-rose-700 hover:bg-rose-50" aria-label={`Excluir ${column.name}`}><Trash2 size={15} /></button>
      <button type="button" onClick={() => onUpdate(name, semantic)} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Salvar</button>
    </div>
  </div>;
}

export function DemandsScreen() {
  const columns = useQaStore((state) => state.demandColumns).slice().sort((left, right) => left.order - right.order);
  const demands = useQaStore((state) => state.demands);
  const moveDemand = useQaStore((state) => state.moveDemand);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<CasePriority | "all">("all");
  const [assignee, setAssignee] = useState("all");
  const [tag, setTag] = useState("all");
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QaDemand | null>(null);
  const [panel, setPanel] = useState<"demand" | "columns" | null>(null);
  const [mobileColumnId, setMobileColumnId] = useState(columns[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceWidth = useSurfaceWidth(surfaceRef);
  const boardExpanded = surfaceWidth >= 880;
  const wideInspector = surfaceWidth >= 1120;
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const metrics = useMemo(() => demandMetrics(demands, columns), [columns, demands]);
  const selected = draft ?? demands.find((item) => item.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const assignees = [...new Set(demands.map((demand) => demand.assignee).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const tags = [...new Set(demands.flatMap((demand) => demand.tags))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const filtered = demands.filter((demand) => {
    const searchable = `${demand.id} ${demand.title} ${demand.assignee} ${demand.tags.join(" ")}`.toLocaleLowerCase("pt-BR");
    return (!normalizedQuery || searchable.includes(normalizedQuery))
      && (priority === "all" || demand.priority === priority)
      && (assignee === "all" || demand.assignee === assignee)
      && (tag === "all" || demand.tags.includes(tag))
      && (!linkedOnly || demand.links.length > 0);
  });
  const filtersActive = Boolean(query || priority !== "all" || assignee !== "all" || tag !== "all" || linkedOnly);
  const advancedFilterCount = Number(priority !== "all") + Number(assignee !== "all") + Number(tag !== "all") + Number(linkedOnly);
  const clearFilters = () => { setQuery(""); setPriority("all"); setAssignee("all"); setTag("all"); setLinkedOnly(false); };

  const rememberFocus = () => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };

  const openDemand = (demand: QaDemand) => { rememberFocus(); setDraft(null); setSelectedId(demand.id); setPanel("demand"); };
  const openNewDemand = (columnId = mobileColumnId || columns[0]?.id) => {
    if (!columnId) return;
    rememberFocus();
    setSelectedId(null);
    setDraft(emptyDemand(columnId, demands.filter((item) => item.columnId === columnId).length));
    setPanel("demand");
  };
  const closePanel = () => { setPanel(null); setDraft(null); };
  const handleMove = async (demandId: string, columnId: string) => {
    const result = await moveDemand(demandId, columnId);
    setNotice(result.message);
    if (result.value?.id === selectedId) setSelectedId(result.value.id);
  };
  const handleDrop = (event: DragEvent, columnId: string) => {
    event.preventDefault();
    const demandId = event.dataTransfer.getData("text/qaflow-demand");
    if (demandId) void handleMove(demandId, columnId);
  };

  useEffect(() => {
    if (!panel) return;
    const container = panelRef.current;
    const focusable = () => [...(container?.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter((element) => !element.hasAttribute("disabled"));
    const frame = window.requestAnimationFrame(() => {
      const target = container?.querySelector<HTMLElement>('input, select, textarea, h2[tabindex="-1"]');
      target?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closePanel(); return; }
      if (wideInspector || event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [panel, wideInspector]);

  const boardColumn = (column: DemandColumn, mobile = false) => {
    const items = filtered.filter((demand) => demand.columnId === column.id).sort((left, right) => left.order - right.order);
    return <section key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, column.id)} className={`${mobile ? "w-full" : "w-[clamp(17rem,20vw,20rem)] shrink-0"} ${semanticSurfaces[column.semantic]} flex min-h-72 self-start flex-col rounded-2xl border border-slate-200/90 p-3`} aria-labelledby={`column-${column.id}`}>
      <div className="flex min-h-10 items-center gap-2 px-1 pb-2"><span className={`h-2 w-2 shrink-0 rounded-full ${semanticDots[column.semantic]}`} aria-hidden="true" /><h2 id={`column-${column.id}`} className="min-w-0 truncate text-sm font-semibold text-slate-800" title={column.name}>{column.name}</h2><span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">{items.length}</span></div>
      <div className="space-y-3">
        {items.map((demand) => <DemandCard key={demand.id} demand={demand} selected={selectedId === demand.id} columns={columns} onSelect={() => openDemand(demand)} onMove={(columnId) => void handleMove(demand.id, columnId)} onReorder={(order) => void moveDemand(demand.id, demand.columnId, order).then((result) => setNotice(result.message))} onDropAt={(event) => {
          const demandId = event.dataTransfer.getData("text/qaflow-demand");
          if (demandId) void moveDemand(demandId, column.id, demand.order).then((result) => setNotice(result.message));
        }} />)}
        {items.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white/65 px-4 py-8 text-center text-xs leading-relaxed text-slate-500">Esta etapa está tranquila.<br />Adicione ou mova uma demanda para cá.</div>}
      </div>
      <button type="button" onClick={() => openNewDemand(column.id)} className="mt-3 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-transparent text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white/75 hover:text-slate-900"><Plus size={15} />Adicionar demanda</button>
    </section>;
  };

  const panelContent = panel === "columns"
    ? <ColumnManager columns={columns} onClose={closePanel} onNotice={setNotice} />
    : selected ? <DemandEditor key={`${selected.id}-${selected.updatedAt}`} demand={selected} columns={columns} onClose={closePanel} onSaved={(saved, message) => { setDraft(null); setSelectedId(saved.id); setNotice(message); }} /> : null;

  return (
    <div ref={surfaceRef} className="qa-demand-surface min-h-[calc(100vh-8rem)]">
      <div className={`grid items-start gap-6 ${panel && wideInspector ? "grid-cols-[minmax(0,1fr)_24rem]" : "grid-cols-1"}`}>
        <div className="min-w-0" inert={panel && !wideInspector ? true : undefined}>
          <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-[-0.025em] text-slate-950 md:text-[1.75rem]">Demandas</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-100"><CheckCircle2 size={14} />Salvo localmente</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">Organize o que precisa de atenção e acompanhe o trabalho do QA sem perder o contexto.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
              <button type="button" onClick={() => { rememberFocus(); setPanel("columns"); }} className={buttonSecondary}><Settings2 size={16} />Gerenciar colunas</button>
              <button type="button" onClick={() => openNewDemand()} className={buttonPrimary}><Plus size={16} />Nova demanda</button>
            </div>
          </header>

          <section aria-label="Resumo das demandas" className={`mb-4 grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 shadow-sm ${surfaceWidth >= 1040 ? "grid-cols-4" : "grid-cols-2"}`}>
            {metricCards.map(({ key, label, icon: Icon, tone }) => <div key={key} className="flex min-h-20 items-center gap-3 bg-white px-4 py-3 md:px-5"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={17} aria-hidden="true" /></span><div className="min-w-0"><strong className="block text-xl font-semibold tabular-nums text-slate-950">{metrics[key]}</strong><span className="block text-xs font-medium leading-snug text-slate-500">{label}</span></div></div>)}
          </section>

          <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap">
            <label className="relative min-w-0 flex-1 sm:min-w-56"><span className="sr-only">Buscar demandas</span><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-9`} placeholder="Buscar por título, pessoa ou tag…" /></label>
            <details className="rounded-xl border border-slate-300 bg-white sm:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-slate-700">Filtros avançados<span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{advancedFilterCount}</span></summary>
              <div className="grid gap-3 border-t border-slate-200 p-3">
                <label className="text-xs font-semibold text-slate-600">Responsável<select value={assignee} onChange={(event) => setAssignee(event.target.value)} className={`${inputClass} mt-1`}><option value="all">Todos os responsáveis</option>{assignees.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600">Prioridade<select value={priority} onChange={(event) => setPriority(event.target.value as CasePriority | "all")} className={`${inputClass} mt-1`}><option value="all">Todas</option>{(Object.keys(priorityLabel) as CasePriority[]).map((value) => <option key={value} value={value}>{priorityLabel[value]}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-600">Tag<select value={tag} onChange={(event) => setTag(event.target.value)} className={`${inputClass} mt-1`}><option value="all">Todas</option>{tags.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"><input type="checkbox" checked={linkedOnly} onChange={(event) => setLinkedOnly(event.target.checked)} className="h-4 w-4 accent-cyan-600" />Somente com artefato vinculado</label>
              </div>
            </details>
            <label className="relative hidden w-44 sm:block"><span className="sr-only">Filtrar responsável</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)} className={`${inputClass} appearance-none pr-8`}><option value="all">Todos responsáveis</option>{assignees.map((value) => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" /></label>
            <label className="relative hidden w-36 sm:block"><span className="sr-only">Filtrar prioridade</span><select value={priority} onChange={(event) => setPriority(event.target.value as CasePriority | "all")} className={`${inputClass} appearance-none pr-8`}><option value="all">Prioridades</option>{(Object.keys(priorityLabel) as CasePriority[]).map((value) => <option key={value} value={value}>{priorityLabel[value]}</option>)}</select><ChevronDown size={15} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" /></label>
            <label className="relative hidden w-32 sm:block"><span className="sr-only">Filtrar tag</span><select value={tag} onChange={(event) => setTag(event.target.value)} className={`${inputClass} appearance-none pr-8`}><option value="all">Todas as tags</option>{tags.map((value) => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={15} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" /></label>
            <label className="hidden min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 sm:flex"><input type="checkbox" checked={linkedOnly} onChange={(event) => setLinkedOnly(event.target.checked)} className="h-4 w-4 accent-cyan-600" />Com vínculo</label>
            {filtersActive && <button type="button" onClick={clearFilters} className="min-h-11 px-3 text-xs font-semibold text-cyan-700 hover:text-cyan-900">Limpar filtros</button>}
          </div>

          <section aria-label="Quadro de demandas" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
              <div><h2 className="text-sm font-semibold text-slate-800">Quadro de trabalho</h2><p className="mt-0.5 text-xs text-slate-500">{filtered.length} {filtered.length === 1 ? "demanda encontrada" : "demandas encontradas"}</p></div>
              {!boardExpanded && <div className="ml-auto flex min-w-0 max-w-full items-center gap-2"><Columns3 size={17} className="shrink-0 text-slate-500" aria-hidden="true" /><label htmlFor="mobile-column" className="sr-only">Coluna</label><select id="mobile-column" value={mobileColumnId} onChange={(event) => setMobileColumnId(event.target.value)} className={`${inputClass} min-w-0 max-w-64`}>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></div>}
            </div>
            {filtered.length === 0 && filtersActive ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
                <p className="text-sm font-semibold text-slate-800">Nenhuma demanda corresponde aos filtros.</p>
                <p className="mt-1 text-xs text-slate-500">Limpe os critérios para voltar a ver toda a fila.</p>
                <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Limpar filtros</button>
              </div>
            ) : !boardExpanded ? <div>{columns.find((column) => column.id === mobileColumnId) ? boardColumn(columns.find((column) => column.id === mobileColumnId)!, true) : null}</div> : <div className="flex max-w-full items-start gap-4 overflow-x-auto pb-3" aria-label="Colunas do quadro com rolagem horizontal">{columns.map((column) => boardColumn(column))}</div>}
          </section>
        </div>

        {panelContent && <aside ref={panelRef} role={wideInspector ? undefined : "dialog"} aria-modal={wideInspector ? undefined : true} className={wideInspector ? "sticky top-6 h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" : "fixed inset-x-0 bottom-0 z-50 h-[58dvh] max-h-[58dvh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl before:absolute before:left-1/2 before:top-2 before:z-10 before:h-1 before:w-10 before:-translate-x-1/2 before:rounded-full before:bg-slate-300 sm:inset-y-0 sm:left-auto sm:h-auto sm:w-[26rem] sm:max-h-none sm:rounded-none sm:before:hidden"} aria-label={panel === "columns" ? "Gerenciar colunas" : "Detalhes da demanda"}>{panelContent}</aside>}
      </div>

      {panelContent && !wideInspector && <button type="button" aria-label="Fechar painel" className="fixed inset-0 z-40 bg-slate-950/45" onClick={closePanel} />}
      <p className="sr-only" aria-live="polite">{notice}</p>
    </div>
  );
}
