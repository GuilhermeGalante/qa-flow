import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Link2,
  ListChecks,
  MoreVertical,
  PanelRightOpen,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  type CaseDefinition,
  type CasePriority,
  type CaseStep,
  type LifecycleStatus,
  type ValidationIssue,
} from "../../domain/types";
import { createId } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import {
  Notice,
  StatusBadge,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  lifecycleLabel,
  priorityLabel,
} from "./Shared";

type InspectorTab = "properties" | "automation" | "references";

interface CaseEditorProps {
  initial: CaseDefinition;
  onClose: (message?: string) => void;
}

export function CaseEditor({ initial, onClose }: CaseEditorProps) {
  const saveCase = useQaStore((state) => state.saveCase);
  const isNew = useQaStore((state) => !state.cases.some((item) => item.id === initial.id));
  const [draft, setDraft] = useState<CaseDefinition>(() => ({ ...structuredClone(initial), description: initial.description ?? "" }));
  const [pathText, setPathText] = useState(initial.path.join(" / "));
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [automationPath, setAutomationPath] = useState(initial.automationLinks[0]?.path ?? "");
  const [automationFramework, setAutomationFramework] = useState(initial.automationLinks[0]?.framework ?? "Playwright");
  const [externalSystem, setExternalSystem] = useState(initial.externalReferences[0]?.system ?? "Jira");
  const [externalValue, setExternalValue] = useState(initial.externalReferences[0]?.value ?? "");
  const [externalUrl, setExternalUrl] = useState(initial.externalReferences[0]?.url ?? "");
  const [tab, setTab] = useState<InspectorTab>("properties");
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stepMenuOpen, setStepMenuOpen] = useState<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);

  const issueFor = (path: string) => issues.find((issue) => issue.path === path);

  useEffect(() => {
    if (!mobileDetailsOpen) return;
    const sheet = sheetRef.current;
    const detailsButton = detailsButtonRef.current;
    const focusable = () => [...(sheet?.querySelectorAll<HTMLElement>('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter((element) => !element.hasAttribute("disabled"));
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileDetailsOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      detailsButton?.focus();
    };
  }, [mobileDetailsOpen]);

  useEffect(() => {
    if (stepMenuOpen === null) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(`[data-step-menu="${stepMenuOpen}"]`)) return;
      setStepMenuOpen(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStepMenuOpen(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [stepMenuOpen]);

  const markDraft = (next: CaseDefinition) => {
    setDraft(next);
    setDirty(true);
  };

  const patchStep = (index: number, update: Partial<CaseStep>) => {
    markDraft({
      ...draft,
      steps: draft.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...update } : step),
    });
  };

  const moveStep = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    markDraft({ ...draft, steps });
  };

  const addStep = () => markDraft({
    ...draft,
    steps: [...draft.steps, { id: createId("STEP"), type: "and", action: "", expectedResult: "" }],
  });

  const requestClose = () => {
    if (!dirty || window.confirm("Descartar as alterações deste caso?")) onClose();
  };

  const submit = async () => {
    const candidate: CaseDefinition = {
      ...draft,
      description: draft.description?.trim() ?? "",
      path: pathText.split("/").map((item) => item.trim()).filter(Boolean),
      tags: tagsText.split(",").map((item) => item.trim()).filter(Boolean),
      automationLinks: automationPath.trim()
        ? [{ framework: automationFramework.trim() || "Outro", path: automationPath.trim() }]
        : [],
      externalReferences: externalValue.trim()
        ? [{ system: externalSystem.trim() || "Outro", value: externalValue.trim(), url: externalUrl.trim() || undefined }]
        : [],
    };
    setSaving(true);
    const result = await saveCase(candidate, isNew ? null : initial.revision);
    setSaving(false);
    setMessage(result.message);
    const nextIssues = result.issues ?? [];
    setIssues(nextIssues);
    if (result.ok) {
      onClose(result.message);
      return;
    }
    window.requestAnimationFrame(() => {
      const firstPath = nextIssues[0]?.path;
      const firstInvalidField = [...document.querySelectorAll<HTMLElement>("[data-validation-path]")]
        .find((element) => element.dataset.validationPath === firstPath);
      firstInvalidField?.focus();
    });
  };

  const renderInspector = () => (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="grid grid-cols-3 border-b border-slate-200 px-3">
        {([
          ["properties", "Propriedades", ListChecks],
          ["automation", "Automação", Bot],
          ["references", "Referências", Link2],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`flex min-h-12 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-bold transition ${tab === value ? "border-cyan-500 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {tab === "properties" && (
          <>
            <label className="block text-xs font-bold text-slate-600">ID do caso
              <input aria-label="ID do caso" data-validation-path="id" className={`${inputClass} mt-1.5`} value={draft.id} disabled={!isNew} onChange={(event) => markDraft({ ...draft, id: event.target.value })} />
            </label>
            <label className="block text-xs font-bold text-slate-600">Caminho
              <input className={`${inputClass} mt-1.5`} value={pathText} onChange={(event) => { setPathText(event.target.value); setDirty(true); }} placeholder="Produto / Módulo / Fluxo" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-600">Prioridade
                <select className={`${inputClass} mt-1.5`} value={draft.priority} onChange={(event) => markDraft({ ...draft, priority: event.target.value as CasePriority })}>
                  {(Object.keys(priorityLabel) as CasePriority[]).map((value) => <option key={value} value={value}>{priorityLabel[value]}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">Status
                <select className={`${inputClass} mt-1.5`} value={draft.status} onChange={(event) => markDraft({ ...draft, status: event.target.value as LifecycleStatus })}>
                  {(Object.keys(lifecycleLabel) as LifecycleStatus[]).map((value) => <option key={value} value={value}>{lifecycleLabel[value]}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-600">Tags
              <input className={`${inputClass} mt-1.5`} value={tagsText} onChange={(event) => { setTagsText(event.target.value); setDirty(true); }} placeholder="smoke, autenticação" />
            </label>
            <label className="block text-xs font-bold text-slate-600">Pré-condição
              <textarea className={`${inputClass} mt-1.5 min-h-20 resize-y`} value={draft.precondition} onChange={(event) => markDraft({ ...draft, precondition: event.target.value })} placeholder="Estado necessário antes de executar" />
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              <strong className="block text-slate-900">Histórico preservado</strong>
              {isNew ? "A primeira versão será criada ao salvar." : `A próxima edição criará a revisão ${initial.revision + 1}. Execuções antigas manterão o snapshot atual.`}
            </div>
          </>
        )}

        {tab === "automation" && (
          <>
            <p className="text-xs leading-relaxed text-slate-600">O vínculo é informativo. O caso continua utilizável sem automação.</p>
            <label className="block text-xs font-bold text-slate-600">Framework
              <input className={`${inputClass} mt-1.5`} value={automationFramework} onChange={(event) => { setAutomationFramework(event.target.value); setDirty(true); }} placeholder="Playwright" />
            </label>
            <label className="block text-xs font-bold text-slate-600">Arquivo ou identificador
              <input className={`${inputClass} mt-1.5`} value={automationPath} onChange={(event) => { setAutomationPath(event.target.value); setDirty(true); }} placeholder="tests/login.spec.ts" />
            </label>
          </>
        )}

        {tab === "references" && (
          <>
            <p className="text-xs leading-relaxed text-slate-600">Conecte um requisito ou ticket sem criar dependência do sistema externo.</p>
            <label className="block text-xs font-bold text-slate-600">Sistema
              <input className={`${inputClass} mt-1.5`} value={externalSystem} onChange={(event) => { setExternalSystem(event.target.value); setDirty(true); }} placeholder="Jira" />
            </label>
            <label className="block text-xs font-bold text-slate-600">Chave
              <input className={`${inputClass} mt-1.5`} value={externalValue} onChange={(event) => { setExternalValue(event.target.value); setDirty(true); }} placeholder="QA-123" />
            </label>
            <label className="block text-xs font-bold text-slate-600">URL opcional
              <input type="url" className={`${inputClass} mt-1.5`} value={externalUrl} onChange={(event) => { setExternalUrl(event.target.value); setDirty(true); }} placeholder="https://…" />
            </label>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="flex min-h-screen flex-col bg-white min-[1120px]:grid min-[1120px]:grid-cols-[minmax(0,1fr)_300px] min-[1120px]:grid-rows-[auto_1fr_auto]" inert={mobileDetailsOpen ? true : undefined}>
        <header className="col-span-full flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" aria-label="Voltar para casos" onClick={requestClose} className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100">
              <ArrowLeft size={19} />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
              <span>Casos</span><span aria-hidden="true">›</span><span className="truncate font-mono font-bold text-slate-700">{draft.id}</span>
              <StatusBadge value={draft.status} label={lifecycleLabel[draft.status]} />
            </div>
          </div>
          <div className="hidden items-center gap-3 text-xs text-slate-500 sm:flex">
            <span>{isNew ? "Novo caso" : `Revisão ${initial.revision} · edição cria nova revisão`}</span>
            <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
            <Check size={15} className="text-emerald-600" aria-hidden="true" />
            <span>{dirty ? "Alterações ainda não salvas" : "Definição atual carregada"}</span>
          </div>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {saving ? "Salvando caso." : issues.length ? "" : message || (dirty ? "Alterações ainda não salvas." : "Definição persistida carregada.")}
          </span>
        </header>

        <main className="min-w-0 bg-white" aria-label="Conteúdo do caso">
          <div className="space-y-5 p-4 pb-32 md:pb-28">
            {message && issues.length === 0 && <Notice tone="info">{message}</Notice>}
            {issues.length > 0 && (
              <div role="alert" aria-live="assertive" aria-atomic="true" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                <p className="font-bold">{message}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4" aria-label="Erros do caso">
                  {issues.slice(0, 8).map((issue) => <li key={`${issue.path}-${issue.message}`}>{issue.path}: {issue.message}</li>)}
                </ul>
              </div>
            )}

            <section aria-labelledby="case-content-title" className="space-y-4">
              <h1 id="case-content-title" className="sr-only">{isNew ? "Novo caso" : `Editar ${initial.title}`}</h1>
              <label className="block text-xs font-bold text-slate-600">Título do caso <span className="text-rose-600">*</span>
                <input
                  autoFocus
                  required
                  data-validation-path="title"
                  aria-invalid={Boolean(issueFor("title"))}
                  aria-describedby={issueFor("title") ? "case-title-error" : undefined}
                  className={`${inputClass} mt-1.5 text-base font-bold ${issueFor("title") ? "border-rose-500 focus:border-rose-500 focus:ring-rose-100" : ""}`}
                  value={draft.title}
                  onChange={(event) => markDraft({ ...draft, title: event.target.value })}
                  placeholder="Ex.: Login com credenciais válidas"
                />
                {issueFor("title") && <span id="case-title-error" className="mt-1.5 block text-xs font-bold text-rose-700">{issueFor("title")?.message}</span>}
              </label>
              <label className="block text-xs font-bold text-slate-600">Descrição
                <textarea rows={1} className={`${inputClass} mt-1.5 min-h-14 resize-y`} value={draft.description ?? ""} onChange={(event) => markDraft({ ...draft, description: event.target.value })} placeholder="O comportamento que este caso valida" />
              </label>
            </section>

            <section aria-labelledby="steps-title">
              <h2 id="steps-title" className="mb-2 text-xs font-black text-slate-950">Passos e resultados esperados</h2>

              <div className="hidden grid-cols-[34px_minmax(0,1fr)_minmax(0,1.12fr)_44px] border-y border-slate-200 bg-slate-50 text-xs font-bold text-slate-500 md:grid">
                <span className="border-r border-slate-200 px-3 py-2">#</span>
                <span className="border-r border-slate-200 px-3 py-2">Ação</span>
                <span className="border-r border-slate-200 px-3 py-2">Resultado esperado</span>
                <span className="px-2 py-2"><span className="sr-only">Organizar</span></span>
              </div>
              <div className="relative divide-y divide-slate-200 overflow-visible rounded-xl border border-slate-200 md:rounded-t-none md:border-t-0">
                {draft.steps.map((step, index) => (
                  <article key={step.id} className="grid grid-cols-[30px_minmax(0,1fr)_40px] bg-white md:grid-cols-[34px_minmax(0,1fr)_minmax(0,1.12fr)_44px] md:items-stretch">
                    <span className="row-span-2 flex items-start justify-center border-r border-slate-200 px-1 py-3 text-xs font-black tabular-nums text-slate-400 md:row-span-1">{index + 1}</span>
                    <label className="col-span-1 col-start-2 border-b border-slate-200 px-2 py-1 text-xs font-bold text-slate-500 md:col-start-auto md:border-b-0 md:border-r md:px-2">
                      <span className="md:sr-only">Ação do passo {index + 1}</span>
                      <textarea
                        rows={1}
                        aria-label={`Ação do passo ${index + 1}`}
                        data-validation-path={`steps[${index}].action`}
                        aria-invalid={Boolean(issueFor(`steps[${index}].action`))}
                        aria-describedby={issueFor(`steps[${index}].action`) ? `step-${index}-action-error` : undefined}
                        className={`${inputClass} min-h-16 resize-y rounded-lg border-transparent bg-transparent px-2 py-2 focus:bg-white md:min-h-10 ${issueFor(`steps[${index}].action`) ? "border-rose-500 focus:border-rose-500 focus:ring-rose-100" : ""}`}
                        value={step.action}
                        onChange={(event) => patchStep(index, { action: event.target.value })}
                        placeholder="O que o QA executa"
                      />
                      {issueFor(`steps[${index}].action`) && <span id={`step-${index}-action-error`} className="mt-1.5 block text-xs font-bold text-rose-700">{issueFor(`steps[${index}].action`)?.message}</span>}
                    </label>
                    <label className="col-span-2 col-start-2 border-r border-slate-200 px-2 py-1 text-xs font-bold text-slate-500 md:col-span-1 md:col-start-auto">
                      <span className="md:sr-only">Resultado esperado do passo {index + 1}</span>
                      <textarea
                        rows={1}
                        aria-label={`Resultado esperado do passo ${index + 1}`}
                        data-validation-path={`steps[${index}].expectedResult`}
                        aria-invalid={Boolean(issueFor(`steps[${index}].expectedResult`))}
                        aria-describedby={issueFor(`steps[${index}].expectedResult`) ? `step-${index}-expected-error` : undefined}
                        className={`${inputClass} min-h-16 resize-y rounded-lg border-transparent bg-transparent px-2 py-2 focus:bg-white md:min-h-10 ${issueFor(`steps[${index}].expectedResult`) ? "border-rose-500 focus:border-rose-500 focus:ring-rose-100" : ""}`}
                        value={step.expectedResult}
                        onChange={(event) => patchStep(index, { expectedResult: event.target.value })}
                        placeholder="A evidência de sucesso"
                      />
                      {issueFor(`steps[${index}].expectedResult`) && <span id={`step-${index}-expected-error`} className="mt-1.5 block text-xs font-bold text-rose-700">{issueFor(`steps[${index}].expectedResult`)?.message}</span>}
                    </label>
                    <div data-step-menu={index} className="relative col-start-3 row-start-1 flex items-start justify-center px-1 py-1 md:col-start-auto md:row-start-auto md:items-center">
                      <button
                        type="button"
                        aria-label={`Organizar passo ${index + 1}`}
                        aria-haspopup="menu"
                        aria-expanded={stepMenuOpen === index}
                        onClick={() => setStepMenuOpen((current) => current === index ? null : index)}
                        className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                      >
                        <MoreVertical size={16} aria-hidden="true" />
                      </button>
                      {stepMenuOpen === index && (
                        <div role="menu" aria-label={`Organizar passo ${index + 1}`} className="absolute right-1 top-10 z-30 w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-xl">
                          <button role="menuitem" type="button" disabled={index === 0} onClick={() => { moveStep(index, -1); setStepMenuOpen(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-35"><ChevronUp size={15} /> Mover para cima</button>
                          <button role="menuitem" type="button" disabled={index === draft.steps.length - 1} onClick={() => { moveStep(index, 1); setStepMenuOpen(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-35"><ChevronDown size={15} /> Mover para baixo</button>
                          <button role="menuitem" type="button" disabled={draft.steps.length === 1} onClick={() => { markDraft({ ...draft, steps: draft.steps.filter((_, stepIndex) => stepIndex !== index) }); setStepMenuOpen(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-35"><Trash2 size={15} /> Remover passo</button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              <button type="button" className={`${buttonSecondary} mt-3`} onClick={addStep}><Plus size={16} /> Adicionar passo</button>
            </section>
          </div>
        </main>

        <aside className="hidden min-h-0 border-l border-slate-200 min-[1120px]:flex" aria-label="Propriedades do caso">
          {renderInspector()}
        </aside>

        <footer className="fixed inset-x-0 bottom-0 z-20 flex min-h-18 items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:left-52 min-[1120px]:static min-[1120px]:col-span-full min-[1120px]:left-auto min-[1120px]:bg-white">
          <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
            <Check size={16} className="text-emerald-600" aria-hidden="true" />
            <span>{dirty ? "Revise e salve para criar a nova revisão." : "Você está vendo a definição persistida."}</span>
          </div>
          <button ref={detailsButtonRef} type="button" className={`${buttonSecondary} mr-auto min-[1120px]:hidden`} onClick={() => setMobileDetailsOpen(true)}><PanelRightOpen size={16} /> Detalhes</button>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className={`${buttonSecondary} hidden sm:inline-flex`} onClick={requestClose}>Cancelar</button>
            <button type="button" className={`${buttonPrimary} ring-2 ring-cyan-400 ring-offset-2`} disabled={saving} onClick={() => void submit()}><Save size={16} /> {saving ? "Salvando…" : "Salvar caso"}</button>
          </div>
        </footer>
      </div>

      {mobileDetailsOpen && (
        <div className="fixed inset-0 z-50 min-[1120px]:hidden">
          <button type="button" aria-label="Fechar detalhes" className="absolute inset-0 bg-slate-950/45" onClick={() => setMobileDetailsOpen(false)} />
          <section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="case-details-title" className="absolute inset-x-0 bottom-0 flex max-h-[58vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-300" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="font-mono text-xs font-bold text-slate-500">{draft.id}</p>
                <h2 id="case-details-title" className="font-black text-slate-950">Detalhes do caso</h2>
              </div>
              <button type="button" aria-label="Fechar detalhes" onClick={() => setMobileDetailsOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={19} /></button>
            </div>
            {renderInspector()}
          </section>
        </div>
      )}
    </div>
  );
}
