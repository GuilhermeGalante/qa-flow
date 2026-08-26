import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Papa from "papaparse";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Download,
  FileUp,
  Folder,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { parseCsvCases, type CsvRecord } from "../../domain/importers";
import {
  QA_FLOW_SCHEMA_VERSION,
  type CaseDefinition,
  type CasePriority,
  type CaseStep,
  type LifecycleStatus,
  type StepType,
} from "../../domain/types";
import { createId, validateCaseDefinition } from "../../domain/validation";
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

const stepTypeLabel: Record<StepType, string> = {
  given: "Dado",
  when: "Quando",
  then: "Então",
  and: "E",
};

function newCase(): CaseDefinition {
  const now = new Date().toISOString();
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: createId("TC"),
    revision: 1,
    title: "",
    path: [],
    priority: "medium",
    status: "active",
    tags: [],
    precondition: "",
    steps: [{ id: createId("STEP"), type: "given", action: "", expectedResult: "" }],
    automationLinks: [],
    externalReferences: [],
    createdAt: now,
    updatedAt: now,
  };
}

function downloadJson(value: unknown, fileName: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface CaseEditorProps {
  initial: CaseDefinition;
  onClose: () => void;
}

function CaseEditor({ initial, onClose }: CaseEditorProps) {
  const saveCase = useQaStore((state) => state.saveCase);
  const isNew = useQaStore((state) => !state.cases.some((item) => item.id === initial.id));
  const [draft, setDraft] = useState<CaseDefinition>(() => structuredClone(initial));
  const [pathText, setPathText] = useState(initial.path.join(" / "));
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [automationPath, setAutomationPath] = useState(initial.automationLinks[0]?.path ?? "");
  const [automationFramework, setAutomationFramework] = useState(initial.automationLinks[0]?.framework ?? "Playwright");
  const [externalSystem, setExternalSystem] = useState(initial.externalReferences[0]?.system ?? "Jira");
  const [externalValue, setExternalValue] = useState(initial.externalReferences[0]?.value ?? "");
  const [externalUrl, setExternalUrl] = useState(initial.externalReferences[0]?.url ?? "");
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<string[]>([]);

  const patchStep = (index: number, update: Partial<CaseStep>) => {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...update } : step),
    }));
  };

  const moveStep = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    setDraft({ ...draft, steps });
  };

  const submit = async () => {
    const candidate: CaseDefinition = {
      ...draft,
      path: pathText.split("/").map((item) => item.trim()).filter(Boolean),
      tags: tagsText.split(",").map((item) => item.trim()).filter(Boolean),
      automationLinks: automationPath.trim()
        ? [{ framework: automationFramework.trim() || "Outro", path: automationPath.trim() }]
        : [],
      externalReferences: externalValue.trim()
        ? [{ system: externalSystem.trim() || "Outro", value: externalValue.trim(), url: externalUrl.trim() || undefined }]
        : [],
    };
    const result = await saveCase(candidate, isNew ? null : initial.revision);
    setMessage(result.message);
    setIssues(result.issues?.map((issue) => `${issue.path}: ${issue.message}`) ?? []);
    if (result.ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="case-editor-title">
      <div className="max-h-[96vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-5xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <div>
            <h2 id="case-editor-title" className="text-xl font-black text-slate-950">{initial.title ? "Editar caso" : "Novo caso"}</h2>
            <p className="text-xs text-slate-500">Ao editar, uma nova revisão será criada.</p>
          </div>
          <button type="button" aria-label="Fechar editor" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          {message && <Notice tone={issues.length ? "error" : "info"}>{message}</Notice>}
          {issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-rose-700">{issues.slice(0, 8).map((issue) => <li key={issue}>{issue}</li>)}</ul>}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">ID do caso
              <input aria-label="ID do caso" className={`${inputClass} mt-1`} value={draft.id} disabled={Boolean(initial.title)} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
            </label>
            <label className="text-sm font-bold text-slate-700">Título <span className="text-rose-600">*</span>
              <input className={`${inputClass} mt-1`} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ex.: Login com credenciais válidas" />
            </label>
            <label className="text-sm font-bold text-slate-700">Caminho
              <input className={`${inputClass} mt-1`} value={pathText} onChange={(event) => setPathText(event.target.value)} placeholder="Produto / Módulo / Funcionalidade" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-bold text-slate-700">Prioridade
                <select className={`${inputClass} mt-1`} value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as CasePriority })}>
                  {(Object.keys(priorityLabel) as CasePriority[]).map((item) => <option key={item} value={item}>{priorityLabel[item]}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">Status
                <select className={`${inputClass} mt-1`} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LifecycleStatus })}>
                  {(Object.keys(lifecycleLabel) as LifecycleStatus[]).map((item) => <option key={item} value={item}>{lifecycleLabel[item]}</option>)}
                </select>
              </label>
            </div>
            <label className="text-sm font-bold text-slate-700 md:col-span-2">Tags
              <input className={`${inputClass} mt-1`} value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="smoke, regressão, mobile" />
            </label>
            <label className="text-sm font-bold text-slate-700 md:col-span-2">Pré-condição
              <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} value={draft.precondition} onChange={(event) => setDraft({ ...draft, precondition: event.target.value })} placeholder="Estado necessário antes de iniciar o caso" />
            </label>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-950">Passos</h3>
                <p className="text-xs text-slate-500">Ação e resultado esperado são obrigatórios.</p>
              </div>
              <button type="button" className={buttonSecondary} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: createId("STEP"), type: "and", action: "", expectedResult: "" }] })}><Plus size={16} /> Passo</button>
            </div>
            <div className="space-y-3">
              {draft.steps.map((step, index) => (
                <article key={step.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Passo {index + 1}</span>
                    <div className="flex gap-1">
                      <button type="button" aria-label={`Mover passo ${index + 1} para cima`} disabled={index === 0} onClick={() => moveStep(index, -1)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-30">↑</button>
                      <button type="button" aria-label={`Mover passo ${index + 1} para baixo`} disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-600 disabled:opacity-30">↓</button>
                      <button type="button" aria-label={`Remover passo ${index + 1}`} disabled={draft.steps.length === 1} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, stepIndex) => stepIndex !== index) })} className="rounded-lg p-1.5 text-rose-600 disabled:opacity-30"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[140px_1fr_1fr]">
                    <label className="text-xs font-bold text-slate-600">Tipo
                      <select className={`${inputClass} mt-1`} value={step.type} onChange={(event) => patchStep(index, { type: event.target.value as StepType })}>
                        {(Object.keys(stepTypeLabel) as StepType[]).map((type) => <option key={type} value={type}>{stepTypeLabel[type]}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-slate-600">Ação
                      <textarea aria-label={`Ação do passo ${index + 1}`} className={`${inputClass} mt-1 min-h-20 resize-y`} value={step.action} onChange={(event) => patchStep(index, { action: event.target.value })} />
                    </label>
                    <label className="text-xs font-bold text-slate-600">Resultado esperado
                      <textarea aria-label={`Resultado esperado do passo ${index + 1}`} className={`${inputClass} mt-1 min-h-20 resize-y`} value={step.expectedResult} onChange={(event) => patchStep(index, { expectedResult: event.target.value })} />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-black text-slate-950">Cobertura automatizada</h3>
            <p className="mb-3 text-xs text-slate-500">O vínculo é informativo; o QA Flow continua funcionando sem automação.</p>
            <div className="grid gap-3 md:grid-cols-[220px_1fr]">
              <label className="text-xs font-bold text-slate-600">Framework
                <input className={`${inputClass} mt-1`} value={automationFramework} onChange={(event) => setAutomationFramework(event.target.value)} />
              </label>
              <label className="text-xs font-bold text-slate-600">Arquivo ou identificador do teste
                <input className={`${inputClass} mt-1`} value={automationPath} onChange={(event) => setAutomationPath(event.target.value)} placeholder="tests/login.spec.ts" />
              </label>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-black text-slate-950">Referência externa</h3>
            <p className="mb-3 text-xs text-slate-500">Conecte o caso a um requisito, história ou ticket sem criar dependência do sistema externo.</p>
            <div className="grid gap-3 md:grid-cols-[180px_220px_1fr]">
              <label className="text-xs font-bold text-slate-600">Sistema<input className={`${inputClass} mt-1`} value={externalSystem} onChange={(event) => setExternalSystem(event.target.value)} /></label>
              <label className="text-xs font-bold text-slate-600">Chave<input className={`${inputClass} mt-1`} value={externalValue} onChange={(event) => setExternalValue(event.target.value)} placeholder="QA-123" /></label>
              <label className="text-xs font-bold text-slate-600">URL opcional<input type="url" className={`${inputClass} mt-1`} value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://..." /></label>
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:px-7">
          <button type="button" className={buttonSecondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={buttonPrimary} onClick={() => void submit()}>Salvar caso</button>
        </div>
      </div>
    </div>
  );
}

export function CasesScreen() {
  const cases = useQaStore((state) => state.cases);
  const plans = useQaStore((state) => state.plans);
  const saveCase = useQaStore((state) => state.saveCase);
  const archiveCase = useQaStore((state) => state.archiveCase);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<CasePriority | "all">("all");
  const [status, setStatus] = useState<LifecycleStatus | "all">("active");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CaseDefinition | null>(null);
  const [message, setMessage] = useState("");
  const [importPreview, setImportPreview] = useState<CaseDefinition[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => cases.filter((testCase) => {
    const haystack = [testCase.id, testCase.title, testCase.path.join(" "), testCase.tags.join(" ")].join(" ").toLowerCase();
    return haystack.includes(query.toLowerCase()) && (priority === "all" || testCase.priority === priority) && (status === "all" || testCase.status === status);
  }), [cases, priority, query, status]);

  const groups = useMemo(() => {
    const grouped = new Map<string, CaseDefinition[]>();
    filtered.forEach((testCase) => {
      const key = testCase.path[0] || "Sem pasta";
      grouped.set(key, [...(grouped.get(key) ?? []), testCase]);
    });
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right, "pt-BR"));
  }, [filtered]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        Papa.parse<CsvRecord>(file, {
          header: true,
          skipEmptyLines: false,
          complete: (result) => setImportPreview(parseCsvCases(result.data.filter((row) => Object.values(row).some((value) => value?.trim())))),
          error: (error) => setMessage(`Falha ao ler CSV: ${error.message}`),
        });
      } else {
        const parsed = JSON.parse(await file.text()) as unknown;
        const candidates = Array.isArray(parsed) ? parsed : [parsed];
        setImportPreview(candidates as CaseDefinition[]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Arquivo inválido.");
    } finally {
      event.target.value = "";
    }
  };

  const importCases = async () => {
    if (!importPreview) return;
    let imported = 0;
    const errors: string[] = [];
    for (const candidate of importPreview) {
      const validation = validateCaseDefinition(candidate);
      if (!validation.ok) {
        errors.push(`${candidate.title || candidate.id || "Caso"}: ${validation.issues[0]?.message}`);
        continue;
      }
      const result = await saveCase(candidate, null);
      if (result.ok) imported += 1;
      else errors.push(`${candidate.title}: ${result.message}`);
    }
    setMessage(`${imported} caso(s) importado(s).${errors.length ? ` ${errors.length} rejeitado(s): ${errors.slice(0, 3).join("; ")}` : ""}`);
    setImportPreview(null);
  };

  const handleArchive = async (testCase: CaseDefinition) => {
    const impact = plans.filter((plan) => plan.status !== "archived" && plan.caseRefs.some((reference) => reference.caseId === testCase.id));
    const detail = impact.length ? `\n\nImpacto: ${impact.map((plan) => plan.name).join(", ")}. Os snapshots e referências serão preservados.` : "";
    if (!window.confirm(`Arquivar “${testCase.title}”?${detail}`)) return;
    const result = await archiveCase(testCase.id);
    setMessage(result.message);
  };

  return (
    <>
      <PageHeader
        title="Biblioteca de casos"
        description="Mantenha uma única definição reutilizável por caso. Planos apontam para revisões e execuções guardam snapshots imutáveis."
        actions={(
          <>
            <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={(event) => void handleFile(event)} />
            <button type="button" className={buttonSecondary} onClick={() => fileRef.current?.click()}><FileUp size={17} /> Importar</button>
            <button type="button" className={buttonPrimary} onClick={() => setEditing(newCase())}><Plus size={17} /> Novo caso</button>
          </>
        )}
      />
      {message && <div className="mb-4"><Notice tone={message.includes("rejeitado") || message.includes("Falha") ? "warning" : "success"}>{message}</Notice></div>}

      {importPreview && (
        <div className="mb-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black text-cyan-950">Pré-visualização da importação</h2>
              <p className="mt-1 text-sm text-cyan-900">{importPreview.length} caso(s) detectado(s). Casos inválidos serão rejeitados com diagnóstico.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setImportPreview(null)}>Cancelar</button>
              <button type="button" className={buttonPrimary} onClick={() => void importCases()}>Validar e importar</button>
            </div>
          </div>
          <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-cyan-950">
            {importPreview.slice(0, 20).map((item, index) => <li key={`${item.id}-${index}`}>{item.id || "Sem ID"} · {item.title || "Sem título"} · {item.steps?.length ?? 0} passo(s)</li>)}
          </ul>
        </div>
      )}

      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_190px_190px]">
        <label className="relative">
          <span className="sr-only">Buscar casos</span>
          <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
          <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por ID, título, pasta ou tag" />
        </label>
        <label><span className="sr-only">Filtrar prioridade</span><select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value as CasePriority | "all")}><option value="all">Todas as prioridades</option>{(Object.keys(priorityLabel) as CasePriority[]).map((item) => <option key={item} value={item}>{priorityLabel[item]}</option>)}</select></label>
        <label><span className="sr-only">Filtrar status</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as LifecycleStatus | "all")}><option value="all">Todos os status</option>{(Object.keys(lifecycleLabel) as LifecycleStatus[]).map((item) => <option key={item} value={item}>{lifecycleLabel[item]}</option>)}</select></label>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Nenhum caso encontrado" description={cases.length ? "Ajuste a busca ou os filtros." : "Crie manualmente ou importe JSON/CSV. O catálogo fica salvo no seu navegador."} action={!cases.length ? <button type="button" className={buttonPrimary} onClick={() => setEditing(newCase())}>Criar primeiro caso</button> : undefined} />
      ) : (
        <div className="space-y-3">
          {groups.map(([group, items]) => {
            const open = expanded.has(group);
            return (
              <section key={group} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button type="button" aria-expanded={open} onClick={() => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(group)) next.delete(group); else next.add(group);
                  return next;
                })} className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100">
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <Folder size={18} className="text-cyan-700" />
                  <span className="flex-1 font-black text-slate-900">{group}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{items.length}</span>
                </button>
                {open && (
                  <div className="divide-y divide-slate-100">
                    {items.map((testCase) => (
                      <article key={testCase.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-cyan-800">{testCase.id}</span>
                            <StatusBadge value={testCase.status} label={lifecycleLabel[testCase.status]} />
                            <span className="text-xs font-bold text-slate-500">{priorityLabel[testCase.priority]}</span>
                            <span className="text-xs text-slate-400">rev. {testCase.revision}</span>
                          </div>
                          <h2 className="mt-1 truncate font-bold text-slate-950">{testCase.title}</h2>
                          <p className="mt-1 text-xs text-slate-500">{testCase.path.join(" / ") || "Sem pasta"} · {testCase.steps.length} passo(s){testCase.automationLinks.length ? " · automatizado" : ""}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button type="button" aria-label={`Exportar ${testCase.title}`} className={buttonSecondary} onClick={() => downloadJson(testCase, `${testCase.id}.json`)}><Download size={15} /><span className="hidden xl:inline">JSON</span></button>
                          <button type="button" aria-label={`Editar ${testCase.title}`} className={buttonSecondary} onClick={() => setEditing(testCase)}><Pencil size={15} /> Editar</button>
                          {testCase.status !== "archived" && <button type="button" aria-label={`Arquivar ${testCase.title}`} className={buttonDanger} onClick={() => void handleArchive(testCase)}><Archive size={15} /><span className="hidden xl:inline">Arquivar</span></button>}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editing && <CaseEditor key={`${editing.id}-${editing.revision}`} initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
