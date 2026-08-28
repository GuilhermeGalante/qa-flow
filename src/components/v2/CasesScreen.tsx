import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
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
} from "lucide-react";
import { parseCsvCases, type CsvRecord } from "../../domain/importers";
import type { CaseDefinition, CasePriority, LifecycleStatus } from "../../domain/types";
import { validateCaseDefinition } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import { CaseEditor } from "./CaseEditor";
import { createBlankCase } from "./caseFactory";
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

function downloadJson(value: unknown, fileName: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface CasesScreenProps {
  newCaseRequested?: boolean;
  onNewCaseRequestHandled?: () => void;
  onEditorStateChange?: (open: boolean) => void;
}

export function CasesScreen({ newCaseRequested = false, onNewCaseRequestHandled, onEditorStateChange }: CasesScreenProps) {
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

  useEffect(() => {
    if (!newCaseRequested) return;
    setEditing(createBlankCase());
    onNewCaseRequestHandled?.();
  }, [newCaseRequested, onNewCaseRequestHandled]);

  useEffect(() => {
    onEditorStateChange?.(Boolean(editing));
  }, [editing, onEditorStateChange]);

  useEffect(() => () => onEditorStateChange?.(false), [onEditorStateChange]);

  const filtered = useMemo(() => cases.filter((testCase) => {
    const haystack = [testCase.id, testCase.title, testCase.description ?? "", testCase.path.join(" "), testCase.tags.join(" ")].join(" ").toLowerCase();
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
        setImportPreview((Array.isArray(parsed) ? parsed : [parsed]) as CaseDefinition[]);
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
      const normalized = { ...candidate, description: candidate.description ?? "" };
      const validation = validateCaseDefinition(normalized);
      if (!validation.ok) {
        errors.push(`${candidate.title || candidate.id || "Caso"}: ${validation.issues[0]?.message}`);
        continue;
      }
      const result = await saveCase(normalized, null);
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

  const closeEditor = (resultMessage?: string) => {
    if (resultMessage) setMessage(resultMessage);
    setEditing(null);
  };

  if (editing) return <CaseEditor key={`${editing.id}-${editing.revision}`} initial={editing} onClose={closeEditor} />;

  return (
    <>
      <PageHeader
        title="Casos"
        description="Definições reutilizáveis e versionadas. Planos apontam para revisões; execuções preservam snapshots imutáveis."
        actions={(
          <>
            <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden" onChange={(event) => void handleFile(event)} />
            <button type="button" className={buttonSecondary} onClick={() => fileRef.current?.click()}><FileUp size={17} /> Importar</button>
            <button type="button" className={buttonPrimary} onClick={() => setEditing(createBlankCase())}><Plus size={17} /> Novo caso</button>
          </>
        )}
      />

      {message && <div className="mb-4"><Notice tone={message.includes("rejeitado") || message.includes("Falha") ? "warning" : "success"}>{message}</Notice></div>}

      {importPreview && (
        <section className="mb-5 rounded-2xl border border-cyan-200 bg-cyan-50 p-5" aria-labelledby="import-preview-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="import-preview-title" className="font-black text-cyan-950">Pré-visualização da importação</h2>
              <p className="mt-1 text-sm text-cyan-900">{importPreview.length} caso(s) detectado(s). Itens inválidos serão rejeitados com diagnóstico.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setImportPreview(null)}>Cancelar</button>
              <button type="button" className={buttonPrimary} onClick={() => void importCases()}>Validar e importar</button>
            </div>
          </div>
          <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-cyan-950">
            {importPreview.slice(0, 20).map((item, index) => <li key={`${item.id}-${index}`}>{item.id || "Sem ID"} · {item.title || "Sem título"} · {item.steps?.length ?? 0} passo(s)</li>)}
          </ul>
        </section>
      )}

      <div className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_190px_190px]">
        <label className="relative">
          <span className="sr-only">Buscar casos</span>
          <Search className="pointer-events-none absolute left-3 top-3 text-slate-500" size={18} />
          <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por ID, título, pasta ou tag" />
        </label>
        <label><span className="sr-only">Filtrar prioridade</span><select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value as CasePriority | "all")}><option value="all">Todas as prioridades</option>{(Object.keys(priorityLabel) as CasePriority[]).map((item) => <option key={item} value={item}>{priorityLabel[item]}</option>)}</select></label>
        <label><span className="sr-only">Filtrar status</span><select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as LifecycleStatus | "all")}><option value="all">Todos os status</option>{(Object.keys(lifecycleLabel) as LifecycleStatus[]).map((item) => <option key={item} value={item}>{lifecycleLabel[item]}</option>)}</select></label>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="Nenhum caso encontrado"
          description={cases.length ? "Ajuste a busca ou os filtros." : "Crie manualmente ou importe JSON/CSV. O catálogo fica salvo no seu dispositivo."}
          action={!cases.length ? <button type="button" className={buttonPrimary} onClick={() => setEditing(createBlankCase())}>Criar primeiro caso</button> : undefined}
        />
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
                })} className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100">
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <Folder size={18} className="text-cyan-700" />
                  <span className="flex-1 font-black text-slate-900">{group}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">{items.length}</span>
                </button>
                {open && (
                  <div className="divide-y divide-slate-100">
                    {items.map((testCase) => (
                      <article key={testCase.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-cyan-800">{testCase.id}</span>
                            <StatusBadge value={testCase.status} label={lifecycleLabel[testCase.status]} />
                            <span className="text-xs font-bold text-slate-600">{priorityLabel[testCase.priority]}</span>
                            <span className="text-xs text-slate-500">rev. {testCase.revision}</span>
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
    </>
  );
}
