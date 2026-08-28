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
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { SegmentedControl, type SegmentedOption } from "../../ui/SegmentedControl";
import { useToast } from "../../ui/ToastProvider";
import { CaseEditor } from "./CaseEditor";
import { createBlankCase } from "./caseFactory";
import {
  EmptyState,
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
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<CasePriority | "all">("all");
  const [status, setStatus] = useState<LifecycleStatus | "all">("active");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<CaseDefinition | null>(null);
  const [importPreview, setImportPreview] = useState<CaseDefinition[] | null>(null);
  const [importing, setImporting] = useState(false);
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

  const matchesQuery = useMemo(() => {
    const needle = query.toLowerCase();
    return (testCase: CaseDefinition) =>
      [testCase.id, testCase.title, testCase.description ?? "", testCase.path.join(" "), testCase.tags.join(" ")]
        .join(" ").toLowerCase().includes(needle);
  }, [query]);

  const filtered = useMemo(() => cases.filter((testCase) =>
    matchesQuery(testCase)
    && (priority === "all" || testCase.priority === priority)
    && (status === "all" || testCase.status === status)), [cases, matchesQuery, priority, status]);

  // Cada filtro conta o resultado do outro: o número mostra o tamanho antes do clique.
  const priorityOptions = useMemo<SegmentedOption<CasePriority | "all">[]>(() => {
    const pool = cases.filter((testCase) => matchesQuery(testCase) && (status === "all" || testCase.status === status));
    return [
      { value: "all", label: "Todas", count: pool.length },
      ...(Object.keys(priorityLabel) as CasePriority[]).map((item) => ({
        value: item,
        label: priorityLabel[item],
        count: pool.filter((testCase) => testCase.priority === item).length,
      })),
    ];
  }, [cases, matchesQuery, status]);

  const statusOptions = useMemo<SegmentedOption<LifecycleStatus | "all">[]>(() => {
    const pool = cases.filter((testCase) => matchesQuery(testCase) && (priority === "all" || testCase.priority === priority));
    return [
      { value: "all", label: "Todos", count: pool.length },
      ...(Object.keys(lifecycleLabel) as LifecycleStatus[]).map((item) => ({
        value: item,
        label: lifecycleLabel[item],
        count: pool.filter((testCase) => testCase.status === item).length,
      })),
    ];
  }, [cases, matchesQuery, priority]);

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
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        Papa.parse<CsvRecord>(file, {
          header: true,
          skipEmptyLines: false,
          complete: (result) => setImportPreview(parseCsvCases(result.data.filter((row) => Object.values(row).some((value) => value?.trim())))),
          error: (error) => toast.show({ tone: "error", message: "Falha ao ler o CSV.", description: error.message }),
        });
      } else {
        const parsed = JSON.parse(await file.text()) as unknown;
        setImportPreview((Array.isArray(parsed) ? parsed : [parsed]) as CaseDefinition[]);
      }
    } catch (error) {
      toast.show({ tone: "error", message: "Arquivo inválido.", description: error instanceof Error ? error.message : undefined });
    } finally {
      event.target.value = "";
    }
  };

  const importCases = async () => {
    if (!importPreview) return;
    setImporting(true);
    let imported = 0;
    const errors: string[] = [];
    try {
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
    } finally {
      setImporting(false);
    }
    toast.show({
      tone: errors.length ? "warning" : "success",
      message: `${imported} caso(s) importado(s).`,
      description: errors.length ? `${errors.length} rejeitado(s): ${errors.slice(0, 3).join("; ")}` : undefined,
    });
    setImportPreview(null);
  };

  const handleArchive = async (testCase: CaseDefinition) => {
    const impact = plans
      .filter((plan) => plan.status !== "archived" && plan.caseRefs.some((reference) => reference.caseId === testCase.id))
      .map((plan) => plan.name);
    const confirmed = await confirm({
      title: "Arquivar este caso?",
      description: "Ele sai do catálogo ativo. Snapshots de execuções e referências de planos continuam preservados.",
      itemLabel: testCase.title,
      impact,
      impactTitle: `Referenciado por ${impact.length} plano(s) ativo(s)`,
      confirmLabel: "Arquivar caso",
      tone: "danger",
    });
    if (!confirmed) return;
    toast.fromResult(await archiveCase(testCase.id));
  };

  const closeEditor = (resultMessage?: string) => {
    if (resultMessage) toast.show({ tone: "success", message: resultMessage });
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

      {importPreview && (
        <section className="mb-5 rounded-2xl border border-run-line bg-run-tint p-5" aria-labelledby="import-preview-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="import-preview-title" className="font-bold text-run-deep">Pré-visualização da importação</h2>
              <p className="mt-1 text-sm text-run-deep">{importPreview.length} caso(s) detectado(s). Itens inválidos serão rejeitados com diagnóstico.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" className={buttonSecondary} disabled={importing} onClick={() => setImportPreview(null)}>Cancelar</button>
              <Button variant="primary" loading={importing} loadingLabel="Importando…" onClick={() => void importCases()}>Validar e importar</Button>
            </div>
          </div>
          <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-xs text-run-deep">
            {importPreview.slice(0, 20).map((item, index) => <li key={`${item.id}-${index}`}>{item.id || "Sem ID"} · {item.title || "Sem título"} · {item.steps?.length ?? 0} passo(s)</li>)}
          </ul>
        </section>
      )}

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-hairline bg-raised p-4 shadow-sm lg:flex-row lg:items-center">
        <label className="relative lg:w-72">
          <span className="sr-only">Buscar casos</span>
          <Search className="pointer-events-none absolute left-3 top-3 text-muted" size={18} />
          <input className={`${inputClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por ID, título, pasta ou tag" />
        </label>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <SegmentedControl size="sm" ariaLabel="Filtrar prioridade" value={priority} onChange={setPriority} options={priorityOptions} />
          <SegmentedControl size="sm" ariaLabel="Filtrar status" value={status} onChange={setStatus} options={statusOptions} />
        </div>
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
              <section key={group} className="overflow-hidden rounded-2xl border border-hairline bg-raised shadow-sm">
                <button type="button" aria-expanded={open} onClick={() => setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(group)) next.delete(group); else next.add(group);
                  return next;
                })} className="flex w-full items-center gap-3 bg-surface px-4 py-3 text-left transition hover:bg-shell">
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <Folder size={18} className="text-run" />
                  <span className="flex-1 font-bold text-body">{group}</span>
                  <span className="rounded-full bg-raised px-2.5 py-1 text-xs font-bold text-subtle ring-1 ring-hairline">{items.length}</span>
                </button>
                {open && (
                  <div className="divide-y divide-hairline">
                    {items.map((testCase) => (
                      <article key={testCase.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-run">{testCase.id}</span>
                            <StatusBadge value={testCase.status} label={lifecycleLabel[testCase.status]} />
                            <span className="text-xs font-bold text-subtle">{priorityLabel[testCase.priority]}</span>
                            <span className="text-xs text-muted">rev. {testCase.revision}</span>
                          </div>
                          <h2 className="mt-1 truncate font-bold text-body">{testCase.title}</h2>
                          <p className="mt-1 text-xs text-muted">{testCase.path.join(" / ") || "Sem pasta"} · {testCase.steps.length} passo(s){testCase.automationLinks.length ? " · automatizado" : ""}</p>
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
