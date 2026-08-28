import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  CheckCircle2,
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
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { Select, type SelectOption } from "../../ui/Select";
import { useToast } from "../../ui/ToastProvider";
import { useDialogBehavior } from "../../ui/useDialogBehavior";
import { buttonPrimary, buttonSecondary, inputClass, priorityLabel } from "./Shared";

const priorityStyles: Record<CasePriority, string> = {
  low: "bg-explore-tint text-explore",
  medium: "bg-warn-tint text-warn",
  high: "bg-fail-tint text-fail",
  critical: "bg-fail-halo text-fail-deep ring-1 ring-inset ring-fail-line",
};

const semanticLabels: Record<DemandColumnSemantic, string> = {
  neutral: "Neutra",
  active: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

const semanticDots: Record<DemandColumnSemantic, string> = {
  neutral: "bg-faint",
  active: "bg-run-mark",
  blocked: "bg-fail-mark",
  done: "bg-pass-mark",
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
  neutral: "bg-shell/80",
  active: "bg-run-tint/70",
  blocked: "bg-fail-tint/65",
  done: "bg-pass-tint/70",
};

const metricCards = [
  { key: "open", label: "Abertas", icon: CircleDot, tone: "text-run bg-run-tint" },
  { key: "blocked", label: "Bloqueadas", icon: LockKeyhole, tone: "text-fail bg-fail-tint" },
  { key: "overdue", label: "Vencidas", icon: CircleAlert, tone: "text-warn bg-warn-tint" },
  { key: "completedThisWeek", label: "Concluídas nesta semana", icon: CheckCircle2, tone: "text-pass bg-pass-tint" },
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
  const [dropTarget, setDropTarget] = useState(false);
  const columnOptions = useMemo<SelectOption[]>(
    () => columns.map((column) => ({ value: column.id, label: column.name })),
    [columns],
  );

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/qaflow-demand", demand.id);
      }}
      // Sem realce, o usuário arrasta às cegas: nada indica onde o card vai cair.
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDropTarget(true); }}
      onDragLeave={() => setDropTarget(false)}
      onDragEnd={() => setDropTarget(false)}
      onDrop={(event) => { event.stopPropagation(); setDropTarget(false); onDropAt(event); }}
      className={`group rounded-2xl border bg-raised p-4 shadow-[0_1px_2px_rgb(15_23_42/0.06),0_8px_20px_rgb(15_23_42/0.04)] transition duration-200 ${dropTarget ? "border-run-mark ring-2 ring-run-line" : selected ? "border-run-mark ring-2 ring-run-halo" : "border-hairline hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-[0_2px_4px_rgb(15_23_42/0.08),0_12px_24px_rgb(15_23_42/0.07)]"}`}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left" aria-label={`Abrir detalhes de ${demand.title}`}>
          <span className="block font-mono text-[0.6875rem] font-semibold tracking-wide text-muted">{demand.id.slice(0, 14)}</span>
          <span className="mt-1.5 block text-[0.9375rem] font-semibold leading-snug text-body">{demand.title}</span>
        </button>
        <GripVertical size={16} aria-hidden="true" className="mt-0.5 shrink-0 cursor-grab text-slate-300 group-hover:text-muted" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyles[demand.priority]}`}>{priorityLabel[demand.priority]}</span>
        {demand.tags.slice(0, 2).map((tag) => <span key={tag} title={tag} className="max-w-28 truncate rounded-full bg-shell px-2.5 py-1 text-xs font-medium text-subtle">{tag}</span>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-shell pt-3 text-xs text-muted">
        <span className="flex min-w-0 max-w-[68%] items-center gap-1.5" title={demand.assignee || "Sem responsável"}><UserRound size={13} aria-hidden="true" /><span className="truncate">{demand.assignee || "Sem responsável"}</span></span>
        <span className="flex shrink-0 items-center gap-1.5" title={formatDate(demand.dueDate)}><CalendarDays size={13} aria-hidden="true" />{formatShortDate(demand.dueDate)}</span>
      </div>
      {(demand.links.length > 0 || demand.checklist.length > 0) && (
        <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-muted">
          {demand.links.length > 0 && <span className="flex items-center gap-1"><Link2 size={13} aria-hidden="true" />{demand.links.length}</span>}
          {demand.checklist.length > 0 && <span className="flex items-center gap-1"><ListChecks size={13} aria-hidden="true" />{demand.checklist.filter((item) => item.done).length}/{demand.checklist.length}</span>}
        </div>
      )}
      {/* Controle compacto alinhado à direita: antes era uma barra de largura total
          com borda própria, ocupando espaço permanente em todos os cartões. */}
      <details className="mt-1">
        <summary className="ml-auto flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-muted transition hover:bg-shell hover:text-ink-hover" aria-label={`Organizar ${demand.title}`} title="Organizar demanda"><MoreHorizontal size={15} aria-hidden="true" /></summary>
        <div className="mt-1 rounded-xl border border-hairline bg-surface p-2">
          <label className="block text-xs font-bold text-subtle" htmlFor={`move-${demand.id}`}>Mover para</label>
          <Select id={`move-${demand.id}`} className="mt-1" ariaLabel={`Mover ${demand.title} para outra coluna`} value={demand.columnId} onChange={onMove} options={columnOptions} />
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button type="button" onClick={() => onReorder(demand.order - 1)} className="flex items-center justify-center gap-1 rounded-lg border border-hairline bg-raised p-2 text-xs font-bold text-subtle hover:bg-surface"><ArrowUp size={14} />Subir</button>
            <button type="button" onClick={() => onReorder(demand.order + 1)} className="flex items-center justify-center gap-1 rounded-lg border border-hairline bg-raised p-2 text-xs font-bold text-subtle hover:bg-surface"><ArrowDown size={14} />Descer</button>
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

  // Quatro tipos de artefato numa lista que cresce sem limite: precisa de busca, e o
  // tipo vira etiqueta em vez de prefixo dentro do rotulo.
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
    <form onSubmit={submit} className="flex h-full flex-col bg-raised">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <div>
          <h2 tabIndex={-1} className="text-lg font-semibold text-body">{existing ? "Detalhes da demanda" : "Registrar demanda"}</h2>
          {existing && <p className="mt-1 font-mono text-xs font-semibold text-muted">{draft.id.slice(0, 18)}</p>}
        </div>
        <button type="button" aria-label="Fechar detalhes" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-shell"><X size={19} /></button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {error && <div role="alert" className="rounded-xl border border-fail-line bg-fail-tint px-3 py-2 text-sm text-fail">{error}</div>}
        <label className="block text-xs font-bold text-control">Título
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Ex.: Validar smoke Android" />
        </label>
        <label className="block text-xs font-bold text-control">Descrição
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={`${inputClass} mt-1.5 min-h-28 resize-y`} placeholder="Contexto, objetivo e critérios relevantes para o QA." />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="text-xs font-bold text-control">
            <label htmlFor="demand-column">Coluna</label>
            <Select id="demand-column" className="mt-1.5" ariaLabel="Coluna da demanda" value={draft.columnId} onChange={(columnId) => setDraft({ ...draft, columnId })} options={columnOptions} />
          </div>
          <div className="text-xs font-bold text-control">
            <label htmlFor="demand-priority">Prioridade</label>
            <Select id="demand-priority" className="mt-1.5" ariaLabel="Prioridade da demanda" value={draft.priority} onChange={(priority) => setDraft({ ...draft, priority })} options={priorityOptions} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-bold text-control">Responsável
            <input value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Nome livre" />
          </label>
          <label className="block text-xs font-bold text-control">Prazo
            <input type="date" value={draft.dueDate ?? ""} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value || undefined })} className={`${inputClass} mt-1.5`} />
          </label>
        </div>
        <label className="block text-xs font-bold text-control">Tags
          <input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} className={`${inputClass} mt-1.5`} placeholder="android, smoke" />
        </label>

        <section aria-labelledby="checklist-heading" className="border-t border-hairline pt-5">
          <div className="flex items-center justify-between"><h3 id="checklist-heading" className="text-sm font-semibold text-body">Checklist</h3><span className="text-xs font-semibold text-muted">{draft.checklist.filter((item) => item.done).length}/{draft.checklist.length}</span></div>
          <div className="mt-3 space-y-2">
            {draft.checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2">
                <input type="checkbox" checked={item.done} onChange={() => setDraft((current) => ({ ...current, checklist: current.checklist.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) }))} className="h-4 w-4 accent-run" aria-label={`Concluir ${item.label}`} />
                <span className={`min-w-0 flex-1 text-sm ${item.done ? "text-faint line-through" : "text-control"}`}>{item.label}</span>
                <button type="button" aria-label={`Remover ${item.label}`} onClick={() => setDraft((current) => ({ ...current, checklist: current.checklist.filter((entry) => entry.id !== item.id) }))} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-faint hover:bg-shell hover:text-fail"><X size={15} /></button>
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

        <section aria-labelledby="links-heading" className="border-t border-hairline pt-5">
          <h3 id="links-heading" className="text-sm font-semibold text-body">Artefatos vinculados</h3>
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
              <div key={`${link.type}-${link.id}`} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs font-semibold text-control">
                <Link2 size={14} className="text-run" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{link.label}</span>
                <button type="button" aria-label={`Desvincular ${link.label}`} onClick={() => setDraft((current) => ({ ...current, links: current.links.filter((entry) => entry.type !== link.type || entry.id !== link.id) }))} className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-faint hover:bg-raised hover:text-fail"><X size={14} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex items-center gap-2 border-t border-hairline px-5 py-4">
        {existing && <Button variant="danger" className="mr-auto" loading={deleting} loadingLabel="Excluindo…" icon={<Trash2 size={16} />} onClick={() => void requestDelete()}>Excluir</Button>}
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
    <div className="flex h-full flex-col bg-raised">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
        <h2 tabIndex={-1} className="text-lg font-semibold text-body">Gerenciar colunas</h2>
        <button type="button" aria-label="Fechar gerenciador" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-shell"><X size={19} /></button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
        <p className="text-sm leading-relaxed text-subtle">O significado alimenta os indicadores, independentemente do nome escolhido.</p>
        {columns.map((column, index) => <ColumnRow key={column.id} column={column} first={index === 0} last={index === columns.length - 1} onMove={moveColumn} onUpdate={async (name, semantic) => onResult(await updateColumn(column.id, name, semantic))} onDelete={async () => onResult(await deleteColumn(column.id))} />)}
      </div>
      <form className="space-y-3 border-t border-hairline p-5" onSubmit={async (event) => {
        event.preventDefault();
        const result = await addColumn(newName, newSemantic);
        onResult(result);
        if (result.ok) { setNewName(""); setNewSemantic("neutral"); }
      }}>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Nova coluna</p>
        <input value={newName} onChange={(event) => setNewName(event.target.value)} className={inputClass} placeholder="Ex.: Pronto para release" />
        <div className="flex gap-2"><Select className="min-w-0 flex-1" ariaLabel="Significado da nova coluna" value={newSemantic} onChange={setNewSemantic} options={semanticOptions} /><button className={buttonPrimary} type="submit"><Plus size={16} />Criar</button></div>
      </form>
    </div>
  );
}

function ColumnRow({ column, first, last, onMove, onUpdate, onDelete }: { column: DemandColumn; first: boolean; last: boolean; onMove: (id: string, direction: -1 | 1) => void; onUpdate: (name: string, semantic: DemandColumnSemantic) => void; onDelete: () => void }) {
  const [name, setName] = useState(column.name);
  const [semantic, setSemantic] = useState(column.semantic);
  return <div className="rounded-xl border border-hairline p-3">
    <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} aria-label="Nome da coluna" />
    <Select className="mt-2" ariaLabel={`Significado da coluna ${column.name}`} value={semantic} onChange={setSemantic} options={semanticOptions} />
    <div className="mt-2 flex items-center gap-1">
      <button type="button" disabled={first} onClick={() => onMove(column.id, -1)} className="rounded-lg border border-hairline p-2 text-muted hover:bg-surface disabled:opacity-30" aria-label={`Mover ${column.name} para a esquerda`}><ArrowLeft size={15} /></button>
      <button type="button" disabled={last} onClick={() => onMove(column.id, 1)} className="rounded-lg border border-hairline p-2 text-muted hover:bg-surface disabled:opacity-30" aria-label={`Mover ${column.name} para a direita`}><ArrowRight size={15} /></button>
      <button type="button" onClick={() => onDelete()} className="ml-auto rounded-lg p-2 text-fail hover:bg-fail-tint" aria-label={`Excluir ${column.name}`}><Trash2 size={15} /></button>
      <button type="button" onClick={() => onUpdate(name, semantic)} className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white hover:bg-ink-hover">Salvar</button>
    </div>
  </div>;
}

export function DemandsScreen() {
  const columns = useQaStore((state) => state.demandColumns).slice().sort((left, right) => left.order - right.order);
  const demands = useQaStore((state) => state.demands);
  const moveDemand = useQaStore((state) => state.moveDemand);
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<CasePriority | "all">("all");
  const [assignee, setAssignee] = useState("all");
  const [tag, setTag] = useState("all");
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QaDemand | null>(null);
  const [panel, setPanel] = useState<"demand" | "columns" | null>(null);
  const [mobileColumnId, setMobileColumnId] = useState(columns[0]?.id ?? "");
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceWidth = useSurfaceWidth(surfaceRef);
  const boardExpanded = surfaceWidth >= 880;
  const wideInspector = surfaceWidth >= 1120;
  const panelRef = useRef<HTMLElement>(null);
  const metrics = useMemo(() => demandMetrics(demands, columns), [columns, demands]);
  const selected = draft ?? demands.find((item) => item.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const assignees = [...new Set(demands.map((demand) => demand.assignee).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const tags = [...new Set(demands.flatMap((demand) => demand.tags))].sort((left, right) => left.localeCompare(right, "pt-BR"));
  const assigneeOptions: SelectOption[] = [{ value: "all", label: "Todos os responsáveis" }, ...assignees.map((value) => ({ value, label: value }))];
  const tagOptions: SelectOption[] = [{ value: "all", label: "Todas as tags" }, ...tags.map((value) => ({ value, label: value }))];
  const priorityFilterOptions: SelectOption<CasePriority | "all">[] = [{ value: "all", label: "Todas as prioridades" }, ...priorityOptions];
  const boardColumnOptions: SelectOption[] = columns.map((column) => ({ value: column.id, label: column.name, hint: semanticLabels[column.semantic] }));
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

  const openDemand = (demand: QaDemand) => { setDraft(null); setSelectedId(demand.id); setPanel("demand"); };
  const openNewDemand = (columnId = mobileColumnId || columns[0]?.id) => {
    if (!columnId) return;
    setSelectedId(null);
    setDraft(emptyDemand(columnId, demands.filter((item) => item.columnId === columnId).length));
    setPanel("demand");
  };
  const closePanel = () => { setPanel(null); setDraft(null); };
  const handleMove = async (demandId: string, columnId: string) => {
    const result = await moveDemand(demandId, columnId);
    toast.fromResult(result);
    if (result.value?.id === selectedId) setSelectedId(result.value.id);
  };
  const handleDrop = (event: DragEvent, columnId: string) => {
    event.preventDefault();
    setDragOverColumnId(null);
    const demandId = event.dataTransfer.getData("text/qaflow-demand");
    if (demandId) void handleMove(demandId, columnId);
  };

  useDialogBehavior({
    open: Boolean(panel),
    onClose: closePanel,
    containerRef: panelRef,
    // Em tela larga o inspetor fica lado a lado: não é modal, não prende foco nem trava a rolagem.
    trapFocus: !wideInspector,
    lockScroll: !wideInspector,
    initialFocusSelector: 'input, textarea, [role="combobox"], h2[tabindex="-1"]',
  });

  const boardColumn = (column: DemandColumn, mobile = false) => {
    const items = filtered.filter((demand) => demand.columnId === column.id).sort((left, right) => left.order - right.order);
    const dropping = dragOverColumnId === column.id;
    return <section
      key={column.id}
      onDragOver={(event) => { event.preventDefault(); setDragOverColumnId(column.id); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverColumnId(null); }}
      onDrop={(event) => handleDrop(event, column.id)}
      className={`${mobile ? "w-full" : "w-[clamp(17rem,20vw,20rem)] shrink-0"} ${semanticSurfaces[column.semantic]} flex min-h-72 self-start flex-col rounded-2xl border p-3 transition ${dropping ? "border-run-accent ring-2 ring-run-line" : "border-hairline/90"}`}
      aria-labelledby={`column-${column.id}`}
    >
      <div className="flex min-h-10 items-center gap-2 px-1 pb-2"><span className={`h-2 w-2 shrink-0 rounded-full ${semanticDots[column.semantic]}`} aria-hidden="true" /><h2 id={`column-${column.id}`} className="min-w-0 truncate text-sm font-semibold text-ink-hover" title={column.name}>{column.name}</h2><span className="ml-auto rounded-full bg-raised/80 px-2 py-0.5 text-xs font-semibold text-subtle ring-1 ring-inset ring-hairline">{items.length}</span></div>
      <div className="space-y-3">
        {items.map((demand) => <DemandCard key={demand.id} demand={demand} selected={selectedId === demand.id} columns={columns} onSelect={() => openDemand(demand)} onMove={(columnId) => void handleMove(demand.id, columnId)} onReorder={(order) => void moveDemand(demand.id, demand.columnId, order).then((result) => toast.fromResult(result))} onDropAt={(event) => {
          setDragOverColumnId(null);
          const demandId = event.dataTransfer.getData("text/qaflow-demand");
          if (demandId) void moveDemand(demandId, column.id, demand.order).then((result) => toast.fromResult(result));
        }} />)}
        {items.length === 0 && <div className="rounded-xl border border-dashed border-hairline-strong bg-raised/65 px-4 py-8 text-center text-xs leading-relaxed text-muted">Esta etapa está tranquila.<br />Adicione ou mova uma demanda para cá.</div>}
      </div>
      <button type="button" onClick={() => openNewDemand(column.id)} className="mt-3 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-transparent text-xs font-semibold text-subtle transition hover:border-hairline-strong hover:bg-raised/75 hover:text-body"><Plus size={15} />Adicionar demanda</button>
    </section>;
  };

  const panelContent = panel === "columns"
    ? <ColumnManager columns={columns} onClose={closePanel} onResult={(result) => toast.fromResult(result)} />
    : selected ? <DemandEditor key={`${selected.id}-${selected.updatedAt}`} demand={selected} columns={columns} onClose={closePanel} onSaved={(saved, message) => { setDraft(null); setSelectedId(saved.id); toast.show({ tone: "success", message }); }} /> : null;

  return (
    <div ref={surfaceRef} className="qa-demand-surface min-h-[calc(100vh-8rem)]">
      <div className={`grid items-start gap-6 ${panel && wideInspector ? "grid-cols-[minmax(0,1fr)_24rem]" : "grid-cols-1"}`}>
        <div className="min-w-0" inert={panel && !wideInspector ? true : undefined}>
          <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-[-0.025em] text-body md:text-[1.75rem]">Demandas</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-pass-tint px-3 py-1 text-xs font-semibold text-pass ring-1 ring-inset ring-pass-line"><CheckCircle2 size={14} />Salvo localmente</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-subtle">Organize o que precisa de atenção e acompanhe o trabalho do QA sem perder o contexto.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
              <button type="button" onClick={() => setPanel("columns")} className={buttonSecondary}><Settings2 size={16} />Gerenciar colunas</button>
              <button type="button" onClick={() => openNewDemand()} className={buttonPrimary}><Plus size={16} />Nova demanda</button>
            </div>
          </header>

          <section aria-label="Resumo das demandas" className={`mb-4 grid overflow-hidden rounded-2xl border border-hairline bg-hairline shadow-sm ${surfaceWidth >= 1040 ? "grid-cols-4" : "grid-cols-2"}`}>
            {metricCards.map(({ key, label, icon: Icon, tone }) => <div key={key} className="flex min-h-20 items-center gap-3 bg-raised px-4 py-3 md:px-5"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={17} aria-hidden="true" /></span><div className="min-w-0"><strong className="block text-xl font-semibold tabular-nums text-body">{metrics[key]}</strong><span className="block text-xs font-medium leading-snug text-muted">{label}</span></div></div>)}
          </section>

          <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-hairline bg-raised p-3 shadow-sm sm:flex-row sm:flex-wrap">
            <label className="relative min-w-0 flex-1 sm:min-w-56"><span className="sr-only">Buscar demandas</span><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-9`} placeholder="Buscar por título, pessoa ou tag…" /></label>
            <details className="rounded-xl border border-hairline-strong bg-raised sm:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-control">Filtros avançados<span className="rounded-full bg-shell px-2 py-0.5 text-subtle">{advancedFilterCount}</span></summary>
              <div className="grid gap-3 border-t border-hairline p-3">
                <div className="text-xs font-semibold text-subtle"><label htmlFor="filter-assignee-mobile">Responsável</label><Select id="filter-assignee-mobile" className="mt-1" ariaLabel="Filtrar responsável" value={assignee} onChange={setAssignee} options={assigneeOptions} searchable={assignees.length > 8} /></div>
                <div className="text-xs font-semibold text-subtle"><label htmlFor="filter-priority-mobile">Prioridade</label><Select id="filter-priority-mobile" className="mt-1" ariaLabel="Filtrar prioridade" value={priority} onChange={setPriority} options={priorityFilterOptions} /></div>
                <div className="text-xs font-semibold text-subtle"><label htmlFor="filter-tag-mobile">Tag</label><Select id="filter-tag-mobile" className="mt-1" ariaLabel="Filtrar tag" value={tag} onChange={setTag} options={tagOptions} searchable={tags.length > 8} /></div>
                <label className="flex min-h-11 items-center gap-2 rounded-lg border border-hairline px-3 text-xs font-semibold text-control"><input type="checkbox" checked={linkedOnly} onChange={(event) => setLinkedOnly(event.target.checked)} className="h-4 w-4 accent-run" />Somente com artefato vinculado</label>
              </div>
            </details>
            <Select className="hidden w-44 sm:block" ariaLabel="Filtrar responsável" value={assignee} onChange={setAssignee} options={assigneeOptions} searchable={assignees.length > 8} searchPlaceholder="Buscar pessoa…" />
            <Select className="hidden w-40 sm:block" ariaLabel="Filtrar prioridade" value={priority} onChange={setPriority} options={priorityFilterOptions} />
            <Select className="hidden w-36 sm:block" ariaLabel="Filtrar tag" value={tag} onChange={setTag} options={tagOptions} searchable={tags.length > 8} searchPlaceholder="Buscar tag…" />
            <label className="hidden min-h-11 items-center gap-2 rounded-xl border border-hairline-strong bg-raised px-3 text-xs font-semibold text-control sm:flex"><input type="checkbox" checked={linkedOnly} onChange={(event) => setLinkedOnly(event.target.checked)} className="h-4 w-4 accent-run" />Com vínculo</label>
            {filtersActive && <button type="button" onClick={clearFilters} className="min-h-11 px-3 text-xs font-semibold text-run hover:text-run-deep">Limpar filtros</button>}
          </div>

          <section aria-label="Quadro de demandas" className="rounded-2xl border border-hairline bg-raised p-3 shadow-sm md:p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
              <div><h2 className="text-sm font-semibold text-ink-hover">Quadro de trabalho</h2><p className="mt-0.5 text-xs text-muted">{filtered.length} {filtered.length === 1 ? "demanda encontrada" : "demandas encontradas"}</p></div>
              {!boardExpanded && <div className="ml-auto flex min-w-0 max-w-full items-center gap-2"><Columns3 size={17} className="shrink-0 text-muted" aria-hidden="true" /><Select id="mobile-column" className="min-w-0 max-w-64 flex-1" ariaLabel="Coluna visível" value={mobileColumnId} onChange={setMobileColumnId} options={boardColumnOptions} /></div>}
            </div>
            {filtered.length === 0 && filtersActive ? (
              <div className="rounded-2xl border border-dashed border-hairline-strong bg-surface px-5 py-10 text-center">
                <p className="text-sm font-semibold text-ink-hover">Nenhuma demanda corresponde aos filtros.</p>
                <p className="mt-1 text-xs text-muted">Limpe os critérios para voltar a ver toda a fila.</p>
                <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl border border-hairline-strong bg-raised px-4 text-sm font-semibold text-control hover:bg-surface">Limpar filtros</button>
              </div>
            ) : !boardExpanded ? <div>{columns.find((column) => column.id === mobileColumnId) ? boardColumn(columns.find((column) => column.id === mobileColumnId)!, true) : null}</div> : <div className="flex max-w-full items-start gap-4 overflow-x-auto pb-3" aria-label="Colunas do quadro com rolagem horizontal">{columns.map((column) => boardColumn(column))}</div>}
          </section>
        </div>

        {panelContent && <aside ref={panelRef} role={wideInspector ? undefined : "dialog"} aria-modal={wideInspector ? undefined : true} className={wideInspector ? "sticky top-6 h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden rounded-2xl border border-hairline bg-raised shadow-sm" : "fixed inset-x-0 bottom-0 z-50 h-[58dvh] max-h-[58dvh] overflow-hidden rounded-t-3xl border border-hairline bg-raised shadow-2xl before:absolute before:left-1/2 before:top-2 before:z-10 before:h-1 before:w-10 before:-translate-x-1/2 before:rounded-full before:bg-hairline-strong sm:inset-y-0 sm:left-auto sm:h-auto sm:w-[26rem] sm:max-h-none sm:rounded-none sm:before:hidden"} aria-label={panel === "columns" ? "Gerenciar colunas" : "Detalhes da demanda"}>{panelContent}</aside>}
      </div>

      {panelContent && !wideInspector && <button type="button" aria-label="Fechar painel" className="fixed inset-0 z-40 bg-ink/45" onClick={closePanel} />}
    </div>
  );
}
