import { useMemo, useState } from "react";
import { Archive, Download, GripVertical, Pencil, Play, Plus, Search, X } from "lucide-react";
import {
  QA_FLOW_SCHEMA_VERSION,
  type LifecycleStatus,
  type PlanCaseReference,
  type PlanDefinition,
  type ValidationIssue,
} from "../../domain/types";
import { createId } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { Modal } from "../../ui/Modal";
import { SegmentedControl, type SegmentedOption } from "../../ui/SegmentedControl";
import { Select, type SelectOption } from "../../ui/Select";
import { useToast } from "../../ui/ToastProvider";
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

const lifecycleOptions: SelectOption<LifecycleStatus>[] = (Object.keys(lifecycleLabel) as LifecycleStatus[])
  .map((value) => ({ value, label: lifecycleLabel[value] }));

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

function PlanEditor({ initial, onClose }: { initial: PlanDefinition; onClose: () => void }) {
  const cases = useQaStore((state) => state.cases);
  const savePlan = useQaStore((state) => state.savePlan);
  const isNew = useQaStore((state) => !state.plans.some((item) => item.id === initial.id));
  const toast = useToast();
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [caseQuery, setCaseQuery] = useState("");
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    const result = await savePlan({
      ...draft,
      tags: tagsText.split(",").map((item) => item.trim()).filter(Boolean),
    }, isNew ? null : initial.revision);
    setSaving(false);
    setIssues(result.issues ?? []);
    if (result.ok) {
      // Sucesso fecha o editor: a mensagem precisa sobreviver ao desmonte da tela.
      toast.fromResult(result);
      setError("");
      onClose();
      return;
    }
    setError(result.message);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial.name ? "Editar plano" : "Novo plano"}
      description="O plano guarda referências; os casos não são duplicados."
      size="xl"
      closeOnBackdrop={false}
      footer={(
        <>
          <button type="button" className={buttonSecondary} onClick={onClose}>Cancelar</button>
          <Button variant="primary" loading={saving} loadingLabel="Salvando…" onClick={() => void submit()}>Salvar plano</Button>
        </>
      )}
    >
      <div className="space-y-6">
        {error && (
          <Notice tone="error" title={error} onDismiss={() => { setError(""); setIssues([]); }}>
            {issues.length > 0
              ? <ul className="list-disc space-y-1 pl-5">{issues.slice(0, 8).map((issue) => <li key={`${issue.path}-${issue.message}`}>{issue.path}: {issue.message}</li>)}</ul>
              : "Revise os campos obrigatórios e tente novamente."}
          </Notice>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-control">Nome <span className="text-fail">*</span><input className={`${inputClass} mt-1`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="text-sm font-bold text-control">Projeto <span className="text-fail">*</span><input className={`${inputClass} mt-1`} value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} /></label>
          <label className="text-sm font-bold text-control">Responsável<input className={`${inputClass} mt-1`} value={draft.createdBy} onChange={(event) => setDraft({ ...draft, createdBy: event.target.value })} /></label>
          <div className="text-sm font-bold text-control">
            <label htmlFor="plan-status">Status</label>
            <Select id="plan-status" className="mt-1" ariaLabel="Status do plano" value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={lifecycleOptions} />
          </div>
          <label className="text-sm font-bold text-control md:col-span-2">Objetivo<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value })} /></label>
          <label className="text-sm font-bold text-control md:col-span-2">Descrição<textarea className={`${inputClass} mt-1 min-h-20 resize-y`} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className="text-sm font-bold text-control md:col-span-2">Tags<input className={`${inputClass} mt-1`} value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="release, regressão, smoke" /></label>
        </div>

        {stale.length > 0 && (
          <Notice tone="warning">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{stale.length} referência(s) apontam para revisões antigas. Revise as alterações antes de atualizar.</span>
              <button type="button" className="font-bold underline" onClick={refreshRevisions}>Usar revisões atuais</button>
            </div>
          </Notice>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <section>
            <div className="mb-3">
              <h3 className="font-bold text-body">Casos disponíveis</h3>
              <p className="text-xs text-muted">Busque e selecione os casos ativos do catálogo.</p>
            </div>
            <label className="relative block">
              <span className="sr-only">Buscar casos para o plano</span>
              <Search className="absolute left-3 top-3 text-faint" size={18} />
              <input className={`${inputClass} pl-10`} value={caseQuery} onChange={(event) => setCaseQuery(event.target.value)} placeholder="Buscar casos" />
            </label>
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {available.map((testCase) => {
                const selected = draft.caseRefs.some((reference) => reference.caseId === testCase.id);
                return (
                  <label key={testCase.id} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${selected ? "border-run-line bg-run-tint" : "border-hairline bg-raised"}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleCase(testCase.id)} className="mt-1 h-4 w-4 accent-run" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-body">{testCase.title}</span>
                      <span className="block text-xs text-muted">{testCase.id} · {priorityLabel[testCase.priority]} · rev. {testCase.revision}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h3 className="font-bold text-body">Ordem de execução ({draft.caseRefs.length})</h3>
              <p className="text-xs text-muted">A ordem fica congelada no snapshot de cada tentativa.</p>
            </div>
            <div className="max-h-[450px] space-y-2 overflow-y-auto pr-1">
              {draft.caseRefs.length === 0 && <div className="rounded-xl border border-dashed border-hairline-strong p-8 text-center text-sm text-muted">Selecione pelo menos um caso.</div>}
              {draft.caseRefs.map((reference, index) => {
                const testCase = cases.find((item) => item.id === reference.caseId);
                const outdated = !testCase || testCase.revision !== reference.caseRevision;
                return (
                  <article key={reference.caseId} className="flex items-center gap-2 rounded-xl border border-hairline bg-surface p-3">
                    <GripVertical size={17} className="text-faint" />
                    <span className="w-6 text-xs font-bold text-faint">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-body">{testCase?.title ?? reference.caseId}</p>
                      <p className={`text-xs ${outdated ? "font-bold text-warn" : "text-muted"}`}>rev. {reference.caseRevision}{outdated ? ` → atual ${testCase?.revision ?? "ausente"}` : ""}</p>
                    </div>
                    <button type="button" aria-label={`Mover ${testCase?.title} para cima`} disabled={index === 0} onClick={() => moveReference(index, -1)} className="rounded p-1 text-xs font-bold disabled:opacity-25">↑</button>
                    <button type="button" aria-label={`Mover ${testCase?.title} para baixo`} disabled={index === draft.caseRefs.length - 1} onClick={() => moveReference(index, 1)} className="rounded p-1 text-xs font-bold disabled:opacity-25">↓</button>
                    <button type="button" aria-label={`Remover ${testCase?.title}`} onClick={() => toggleCase(reference.caseId)} className="rounded p-1 text-fail"><X size={16} /></button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

export function PlansScreen({ onRun }: { onRun: (planId: string) => void }) {
  const plans = useQaStore((state) => state.plans);
  const cases = useQaStore((state) => state.cases);
  const archivePlan = useQaStore((state) => state.archivePlan);
  const toast = useToast();
  const saveGeneratedFile = useQaStore((state) => state.saveGeneratedFile);

  const downloadPlan = async (plan: PlanDefinition) => {
    toast.fromResult(await saveGeneratedFile(
      { suggestedName: `${plan.id}.json`, mimeType: "application/json", extension: ".json" },
      new TextEncoder().encode(JSON.stringify(plan, null, 2)),
    ));
  };
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LifecycleStatus | "all">("active");
  const [editing, setEditing] = useState<PlanDefinition | null>(null);

  const matching = plans.filter((plan) =>
    `${plan.id} ${plan.name} ${plan.project} ${plan.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const filtered = matching.filter((plan) => status === "all" || plan.status === status);

  const statusOptions: SegmentedOption<LifecycleStatus | "all">[] = [
    { value: "all", label: "Todos", count: matching.length },
    ...(Object.keys(lifecycleLabel) as LifecycleStatus[]).map((value) => ({
      value,
      label: lifecycleLabel[value],
      count: matching.filter((plan) => plan.status === value).length,
    })),
  ];

  const handleArchive = async (plan: PlanDefinition) => {
    const confirmed = await confirm({
      title: "Arquivar este plano?",
      description: "Ele sai da lista executável. O histórico de execuções e os snapshots já criados são preservados.",
      itemLabel: plan.name,
      confirmLabel: "Arquivar plano",
      tone: "danger",
    });
    if (!confirmed) return;
    toast.fromResult(await archivePlan(plan.id));
  };

  return (
    <>
      <PageHeader title="Planos de teste" description="Combine referências do catálogo sem duplicar definições. Atualizações de revisão são sempre explícitas." actions={<button type="button" className={buttonPrimary} onClick={() => setEditing(newPlan())}><Plus size={17} /> Novo plano</button>} />
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-hairline bg-raised p-4 shadow-sm lg:flex-row lg:items-center">
        <label className="relative lg:w-80"><span className="sr-only">Buscar planos</span><Search className="absolute left-3 top-3 text-faint" size={18} /><input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, projeto ou tag" /></label>
        <SegmentedControl size="sm" ariaLabel="Filtrar status do plano" value={status} onChange={setStatus} options={statusOptions} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum plano encontrado" description={plans.length ? "Ajuste os filtros." : "Crie um plano escolhendo casos reutilizáveis da biblioteca."} action={!plans.length ? <button type="button" className={buttonPrimary} onClick={() => setEditing(newPlan())}>Criar primeiro plano</button> : undefined} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((plan) => {
            const stale = plan.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.revision !== reference.caseRevision).length;
            const inactive = plan.caseRefs.filter((reference) => cases.find((item) => item.id === reference.caseId)?.status !== "active").length;
            return (
              <article key={plan.id} className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge value={plan.status} label={lifecycleLabel[plan.status]} /><span className="text-xs text-faint">rev. {plan.revision}</span>{stale > 0 && <span className="rounded-full bg-warn-tint px-2 py-1 text-xs font-bold text-warn">{stale} desatualizada(s)</span>}{inactive > 0 && <span className="rounded-full bg-explore-tint px-2 py-1 text-xs font-bold text-explore">{inactive} caso(s) não ativo(s)</span>}</div>
                    <h2 className="mt-2 truncate text-lg font-bold text-body">{plan.name}</h2>
                    <p className="mt-1 text-sm text-muted">{plan.project} · {plan.caseRefs.length} caso(s)</p>
                  </div>
                  <span className="font-mono text-[11px] text-faint">{plan.id}</span>
                </div>
                <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-subtle">{plan.objective || plan.description || "Sem objetivo informado."}</p>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
                  {plan.status === "active" && <button type="button" className={buttonPrimary} disabled={stale > 0 || inactive > 0} title={stale ? "Atualize as referências antes de executar" : inactive ? "Ative ou substitua os casos indisponíveis" : undefined} onClick={() => onRun(plan.id)}><Play size={15} /> Executar</button>}
                  <button type="button" className={buttonSecondary} onClick={() => setEditing(plan)}><Pencil size={15} /> Editar</button>
                  <button type="button" className={buttonSecondary} onClick={() => void downloadPlan(plan)}><Download size={15} /><span className="hidden sm:inline">JSON</span></button>
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
