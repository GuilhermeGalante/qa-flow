import { useMemo, useState } from "react";
import { Archive, Download, GripVertical, Pencil, Play, Plus, Search, X } from "lucide-react";
import {
  QA_FLOW_SCHEMA_VERSION,
  type LifecycleStatus,
  type PlanCaseReference,
  type PlanDefinition,
} from "../../domain/types";
import { createId } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import {
  EmptyState,
  Notice,
  PageHeader,
  StatusBadge,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  lifecycleLabel,
  priorityLabel,
} from "./Shared";

function newPlan(): PlanDefinition {
  const now = new Date().toISOString();
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: createId("PLAN"),
    revision: 1,
    name: "",
    description: "",
    objective: "",
    project: "",
    status: "active",
    tags: [],
    caseRefs: [],
    createdBy: "",
    createdAt: now,
    updatedAt: now,
  };
}

function downloadPlan(plan: PlanDefinition): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${plan.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PlanEditor({ initial, onClose }: { initial: PlanDefinition; onClose: () => void }) {
  const cases = useQaStore((state) => state.cases);
  const savePlan = useQaStore((state) => state.savePlan);
  const isNew = useQaStore((state) => !state.plans.some((item) => item.id === initial.id));
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [caseQuery, setCaseQuery] = useState("");
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<string[]>([]);

  const available = useMemo(() => cases.filter((testCase) => {
    const selected = draft.caseRefs.some((reference) => reference.caseId === testCase.id);
    const matches = `${testCase.id} ${testCase.title} ${testCase.path.join(" ")}`.toLowerCase().includes(caseQuery.toLowerCase());
    return matches && (testCase.status === "active" || selected);
  }), [caseQuery, cases, draft.caseRefs]);

  const toggleCase = (caseId: string) => {
    const existing = draft.caseRefs.some((reference) => reference.caseId === caseId);
    if (existing) {
      setDraft({ ...draft, caseRefs: draft.caseRefs.filter((reference) => reference.caseId !== caseId) });
      return;
    }
    const testCase = cases.find((item) => item.id === caseId);
    if (testCase) setDraft({ ...draft, caseRefs: [...draft.caseRefs, { caseId, caseRevision: testCase.revision }] });
  };

  const moveReference = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= draft.caseRefs.length) return;
    const caseRefs = [...draft.caseRefs];
    [caseRefs[index], caseRefs[target]] = [caseRefs[target], caseRefs[index]];
    setDraft({ ...draft, caseRefs });
  };

  const stale = draft.caseRefs.filter((reference) => {
    const testCase = cases.find((item) => item.id === reference.caseId);
    return !testCase || testCase.revision !== reference.caseRevision;
  });

  const refreshRevisions = () => {
    const caseRefs: PlanCaseReference[] = draft.caseRefs.map((reference) => {
      const testCase = cases.find((item) => item.id === reference.caseId);
      return { ...reference, caseRevision: testCase?.revision ?? reference.caseRevision };
    });
    setDraft({ ...draft, caseRefs });
  };

  const submit = async () => {
    const result = await savePlan({
      ...draft,
      tags: tagsText.split(",").map((item) => item.trim()).filter(Boolean),
    }, isNew ? null : initial.revision);
    setMessage(result.message);
    setIssues(result.issues?.map((issue) => `${issue.path}: ${issue.message}`) ?? []);
    if (result.ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="plan-editor-title">
      <div className="max-h-[96vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-6xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <div>
            <h2 id="plan-editor-title" className="text-xl font-black text-slate-950">{initial.name ? "Editar plano" : "Novo plano"}</h2>
            <p className="text-xs text-slate-500">O plano guarda referências; os casos não são duplicados.</p>
          </div>
          <button type="button" aria-label="Fechar editor" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          {message && <Notice tone={issues.length ? "error" : "info"}>{message}</Notice>}
          {issues.length > 0 && <ul className="list-disc pl-5 text-sm text-rose-700">{issues.slice(0, 8).map((issue) => <li key={issue}>{issue}</li>)}</ul>}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">Nome <span className="text-rose-600">*</span><input className={`${inputClass} mt-1`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="text-sm font-bold text-slate-700">Projeto <span className="text-rose-600">*</span><input className={`${inputClass} mt-1`} value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} /></label>
            <label className="text-sm font-bold text-slate-700">Responsável<input className={`${inputClass} mt-1`} value={draft.createdBy} onChange={(event) => setDraft({ ...draft, createdBy: event.target.value })} /></label>
            <label className="text-sm font-bold text-slate-700">Status<select className={`${inputClass} mt-1`} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LifecycleStatus })}>{(Object.keys(lifecycleLabel) as LifecycleStatus[]).map((value) => <option key={value} value={value}>{lifecycleLabel[value]}</option>)}</select></label>
            <label className="text-sm font-bold text-slate-700 md:col-span-2">Objetivo<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value })} /></label>
            <label className="text-sm font-bold text-slate-700 md:col-span-2">Descrição<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="text-sm font-bold text-slate-700 md:col-span-2">Tags<input className={`${inputClass} mt-1`} value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="release, regressão, smoke" /></label>
          </div>

          {stale.length > 0 && (
            <Notice tone="warning">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{stale.length} referência(s) apontam para revisões antigas. Revise as alterações antes de atualizar.</span>
                <button type="button" className="font-black underline" onClick={refreshRevisions}>Usar revisões atuais</button>
              </div>
            </Notice>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <div className="mb-3">
                <h3 className="font-black text-slate-950">Casos disponíveis</h3>
                <p className="text-xs text-slate-500">Busque e selecione os casos ativos do catálogo.</p>
              </div>
              <label className="relative block">
                <span className="sr-only">Buscar casos para o plano</span>
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input className={`${inputClass} pl-10`} value={caseQuery} onChange={(event) => setCaseQuery(event.target.value)} placeholder="Buscar casos" />
              </label>
              <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                {available.map((testCase) => {
                  const selected = draft.caseRefs.some((reference) => reference.caseId === testCase.id);
                  return (
                    <label key={testCase.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${selected ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white"}`}>
                      <input type="checkbox" checked={selected} onChange={() => toggleCase(testCase.id)} className="mt-1 h-4 w-4 accent-cyan-600" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900">{testCase.title}</span>
                        <span className="block text-xs text-slate-500">{testCase.id} · {priorityLabel[testCase.priority]} · rev. {testCase.revision}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h3 className="font-black text-slate-950">Ordem de execução ({draft.caseRefs.length})</h3>
                <p className="text-xs text-slate-500">A ordem fica congelada no snapshot de cada tentativa.</p>
              </div>
              <div className="max-h-[450px] space-y-2 overflow-y-auto pr-1">
                {draft.caseRefs.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Selecione pelo menos um caso.</div>}
                {draft.caseRefs.map((reference, index) => {
                  const testCase = cases.find((item) => item.id === reference.caseId);
                  const outdated = !testCase || testCase.revision !== reference.caseRevision;
                  return (
                    <article key={reference.caseId} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <GripVertical size={17} className="text-slate-400" />
                      <span className="w-6 text-xs font-black text-slate-400">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{testCase?.title ?? reference.caseId}</p>
                        <p className={`text-xs ${outdated ? "font-bold text-amber-700" : "text-slate-500"}`}>rev. {reference.caseRevision}{outdated ? ` → atual ${testCase?.revision ?? "ausente"}` : ""}</p>
                      </div>
                      <button type="button" aria-label={`Mover ${testCase?.title} para cima`} disabled={index === 0} onClick={() => moveReference(index, -1)} className="rounded p-1 text-xs font-black disabled:opacity-25">↑</button>
                      <button type="button" aria-label={`Mover ${testCase?.title} para baixo`} disabled={index === draft.caseRefs.length - 1} onClick={() => moveReference(index, 1)} className="rounded p-1 text-xs font-black disabled:opacity-25">↓</button>
                      <button type="button" aria-label={`Remover ${testCase?.title}`} onClick={() => toggleCase(reference.caseId)} className="rounded p-1 text-rose-600"><X size={16} /></button>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:px-7">
          <button type="button" className={buttonSecondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={buttonPrimary} onClick={() => void submit()}>Salvar plano</button>
        </div>
      </div>
    </div>
  );
}

export function PlansScreen({ onRun }: { onRun: (planId: string) => void }) {
  const plans = useQaStore((state) => state.plans);
  const cases = useQaStore((state) => state.cases);
  const archivePlan = useQaStore((state) => state.archivePlan);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LifecycleStatus | "all">("active");
  const [editing, setEditing] = useState<PlanDefinition | null>(null);
  const [message, setMessage] = useState("");

  const filtered = plans.filter((plan) =>
    `${plan.id} ${plan.name} ${plan.project} ${plan.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()) &&
    (status === "all" || plan.status === status),
  );

  const handleArchive = async (plan: PlanDefinition) => {
    if (!window.confirm(`Arquivar “${plan.name}”? O histórico de execuções será preservado.`)) return;
    const result = await archivePlan(plan.id);
    setMessage(result.message);
  };

  return (
    <>
      <PageHeader title="Planos de teste" description="Combine referências do catálogo sem duplicar definições. Atualizações de revisão são sempre explícitas." actions={<button type="button" className={buttonPrimary} onClick={() => setEditing(newPlan())}><Plus size={17} /> Novo plano</button>} />
      {message && <div className="mb-4"><Notice tone="success">{message}</Notice></div>}
      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_210px]">
        <label className="relative"><span className="sr-only">Buscar planos</span><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, projeto ou tag" /></label>
        <label><span className="sr-only">Filtrar status do plano</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as LifecycleStatus | "all")}><option value="all">Todos os status</option>{(Object.keys(lifecycleLabel) as LifecycleStatus[]).map((value) => <option key={value} value={value}>{lifecycleLabel[value]}</option>)}</select></label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum plano encontrado" description={plans.length ? "Ajuste os filtros." : "Crie um plano escolhendo casos reutilizáveis da biblioteca."} action={!plans.length ? <button type="button" className={buttonPrimary} onClick={() => setEditing(newPlan())}>Criar primeiro plano</button> : undefined} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((plan) => {
            const stale = plan.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.revision !== reference.caseRevision).length;
            const inactive = plan.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.status !== "active").length;
            return (
              <article key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge value={plan.status} label={lifecycleLabel[plan.status]} /><span className="text-xs text-slate-400">rev. {plan.revision}</span>{stale > 0 && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">{stale} desatualizada(s)</span>}{inactive > 0 && <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">{inactive} caso(s) não ativo(s)</span>}</div>
                    <h2 className="mt-2 truncate text-lg font-black text-slate-950">{plan.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{plan.project} · {plan.caseRefs.length} caso(s)</p>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{plan.id}</span>
                </div>
                <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-slate-600">{plan.objective || plan.description || "Sem objetivo informado."}</p>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {plan.status === "active" && <button type="button" className={buttonPrimary} disabled={stale > 0 || inactive > 0} title={stale ? "Atualize as referências antes de executar" : inactive ? "Ative ou substitua os casos indisponíveis" : undefined} onClick={() => onRun(plan.id)}><Play size={15} /> Executar</button>}
                  <button type="button" className={buttonSecondary} onClick={() => setEditing(plan)}><Pencil size={15} /> Editar</button>
                  <button type="button" className={buttonSecondary} onClick={() => downloadPlan(plan)}><Download size={15} /><span className="hidden sm:inline">JSON</span></button>
                  {plan.status !== "archived" && <button type="button" className={buttonDanger} onClick={() => void handleArchive(plan)}><Archive size={15} /><span className="hidden sm:inline">Arquivar</span></button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {editing && <PlanEditor key={`${editing.id}-${editing.revision}`} initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
