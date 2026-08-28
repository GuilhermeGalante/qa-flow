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
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { Select, type SelectOption } from "../../ui/Select";
import { useDialogBehavior } from "../../ui/useDialogBehavior";
import {
  Notice,
  StatusBadge,
  buttonSecondary,
  inputClass,
  lifecycleLabel,
  priorityLabel,
} from "./Shared";

const priorityOptions: SelectOption<CasePriority>[] = (Object.keys(priorityLabel) as CasePriority[])
  .map((value) => ({ value, label: priorityLabel[value] }));

const lifecycleOptions: SelectOption<LifecycleStatus>[] = (Object.keys(lifecycleLabel) as LifecycleStatus[])
  .map((value) => ({ value, label: lifecycleLabel[value] }));

type InspectorTab = "properties" | "automation" | "references";

interface CaseEditorProps {
  initial: CaseDefinition;
  onClose: (message?: string) => void;
}

export function CaseEditor({ initial, onClose }: CaseEditorProps) {
  const saveCase = useQaStore((state) => state.saveCase);
  const isNew = useQaStore((state) => !state.cases.some((item) => item.id === initial.id));
  const confirm = useConfirm();
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

  useDialogBehavior({
    open: mobileDetailsOpen,
    onClose: () => setMobileDetailsOpen(false),
    containerRef: sheetRef,
  });

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

  const requestClose = async () => {
    if (!dirty) { onClose(); return; }
    const discard = await confirm({
      title: "Descartar as alterações?",
      description: "As edições feitas neste caso serão perdidas. A definição salva permanece como está.",
      itemLabel: draft.title || draft.id,
      confirmLabel: "Descartar alterações",
      cancelLabel: "Continuar editando",
    });
    if (discard) onClose();
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
    <div className="flex min-h-0 flex-1 flex-col bg-raised">
      <div className="grid grid-cols-3 border-b border-hairline px-3">
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
            className={`flex min-h-12 items-center justify-center gap-1.5 border-b-2 px-2 text-xs font-bold transition ${tab === value ? "border-run-mark text-body" : "border-transparent text-muted hover:text-ink-hover"}`}
          >
            <Icon size={14} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {tab === "properties" && (
          <>
            <label className="block text-xs font-bold text-subtle">ID do caso
              <input aria-label="ID do caso" data-validation-path="id" className={`${inputClass} mt-1.5`} value={draft.id} disabled={!isNew} onChange={(event) => markDraft({ ...draft, id: event.target.value })} />
            </label>
            <label className="block text-xs font-bold text-subtle">Caminho
              <input className={`${inputClass} mt-1.5`} value={pathText} onChange={(event) => { setPathText(event.target.value); setDirty(true); }} placeholder="Produto / Módulo / Fluxo" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-xs font-bold text-subtle">
                <label htmlFor="case-priority">Prioridade</label>
                <Select id="case-priority" className="mt-1.5" ariaLabel="Prioridade do caso" value={draft.priority} onChange={(priority) => markDraft({ ...draft, priority })} options={priorityOptions} />
              </div>
              <div className="text-xs font-bold text-subtle">
                <label htmlFor="case-status">Status</label>
                <Select id="case-status" className="mt-1.5" ariaLabel="Status do caso" value={draft.status} onChange={(status) => markDraft({ ...draft, status })} options={lifecycleOptions} />
              </div>
            </div>
            <label className="block text-xs font-bold text-subtle">Tags
              <input className={`${inputClass} mt-1.5`} value={tagsText} onChange={(event) => { setTagsText(event.target.value); setDirty(true); }} placeholder="smoke, autenticação" />
            </label>
            <label className="block text-xs font-bold text-subtle">Pré-condição
              <textarea className={`${inputClass} mt-1.5 min-h-20 resize-y`} value={draft.precondition} onChange={(event) => markDraft({ ...draft, precondition: event.target.value })} placeholder="Estado necessário antes de executar" />
            </label>
            <div className="rounded-xl border border-hairline bg-surface p-3 text-xs leading-relaxed text-subtle">
              <strong className="block text-body">Histórico preservado</strong>
              {isNew ? "A primeira versão será criada ao salvar." : `A próxima edição criará a revisão ${initial.revision + 1}. Execuções antigas manterão o snapshot atual.`}
            </div>
          </>
        )}

        {tab === "automation" && (
          <>
            <p className="text-xs leading-relaxed text-subtle">O vínculo é informativo. O caso continua utilizável sem automação.</p>
            <label className="block text-xs font-bold text-subtle">Framework
              <input className={`${inputClass} mt-1.5`} value={automationFramework} onChange={(event) => { setAutomationFramework(event.target.value); setDirty(true); }} placeholder="Playwright" />
            </label>
            <label className="block text-xs font-bold text-subtle">Arquivo ou identificador
              <input className={`${inputClass} mt-1.5`} value={automationPath} onChange={(event) => { setAutomationPath(event.target.value); setDirty(true); }} placeholder="tests/login.spec.ts" />
            </label>
          </>
        )}

        {tab === "references" && (
          <>
            <p className="text-xs leading-relaxed text-subtle">Conecte um requisito ou ticket sem criar dependência do sistema externo.</p>
            <label className="block text-xs font-bold text-subtle">Sistema
              <input className={`${inputClass} mt-1.5`} value={externalSystem} onChange={(event) => { setExternalSystem(event.target.value); setDirty(true); }} placeholder="Jira" />
            </label>
            <label className="block text-xs font-bold text-subtle">Chave
              <input className={`${inputClass} mt-1.5`} value={externalValue} onChange={(event) => { setExternalValue(event.target.value); setDirty(true); }} placeholder="QA-123" />
            </label>
            <label className="block text-xs font-bold text-subtle">URL opcional
              <input type="url" className={`${inputClass} mt-1.5`} value={externalUrl} onChange={(event) => { setExternalUrl(event.target.value); setDirty(true); }} placeholder="https://…" />
            </label>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-raised">
      <div className="flex min-h-screen flex-col bg-raised min-[1120px]:grid min-[1120px]:grid-cols-[minmax(0,1fr)_300px] min-[1120px]:grid-rows-[auto_1fr_auto]" inert={mobileDetailsOpen ? true : undefined}>
        <header className="col-span-full flex min-h-16 items-center justify-between gap-3 border-b border-hairline bg-raised px-4">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" aria-label="Voltar para casos" onClick={() => void requestClose()} className="rounded-lg p-2 text-subtle transition hover:bg-shell">
              <ArrowLeft size={19} />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
              <span>Casos</span><span aria-hidden="true">›</span><span className="truncate font-mono font-bold text-control">{draft.id}</span>
              <StatusBadge value={draft.status} label={lifecycleLabel[draft.status]} />
            </div>
          </div>
          <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
            <span>{isNew ? "Novo caso" : `Revisão ${initial.revision} · edição cria nova revisão`}</span>
            <span className="h-4 w-px bg-hairline" aria-hidden="true" />
            <Check size={15} className="text-pass" aria-hidden="true" />
            <span>{dirty ? "Alterações ainda não salvas" : "Definição atual carregada"}</span>
          </div>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {saving ? "Salvando caso." : issues.length ? "" : message || (dirty ? "Alterações ainda não salvas." : "Definição persistida carregada.")}
          </span>
        </header>

        <main className="min-w-0 bg-raised" aria-label="Conteúdo do caso">
          <div className="space-y-5 p-4 pb-32 md:pb-28">
            {message && issues.length === 0 && <Notice tone="error" onDismiss={() => setMessage("")}>{message}</Notice>}
            {issues.length > 0 && (
              <div role="alert" aria-live="assertive" aria-atomic="true" className="rounded-xl border border-fail-line bg-fail-tint p-4 text-sm text-fail">
                <p className="font-bold">{message}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4" aria-label="Erros do caso">
                  {issues.slice(0, 8).map((issue) => <li key={`${issue.path}-${issue.message}`}>{issue.path}: {issue.message}</li>)}
                </ul>
              </div>
            )}

            <section aria-labelledby="case-content-title" className="space-y-4">
              <h1 id="case-content-title" className="sr-only">{isNew ? "Novo caso" : `Editar ${initial.title}`}</h1>
              <label className="block text-xs font-bold text-subtle">Título do caso <span className="text-fail">*</span>
                <input
                  autoFocus
                  required
                  data-validation-path="title"
                  aria-invalid={Boolean(issueFor("title"))}
                  aria-describedby={issueFor("title") ? "case-title-error" : undefined}
                  className={`${inputClass} mt-1.5 text-base font-bold ${issueFor("title") ? "border-fail-mark focus:border-fail-mark focus:ring-fail-halo" : ""}`}
                  value={draft.title}
                  onChange={(event) => markDraft({ ...draft, title: event.target.value })}
                  placeholder="Ex.: Login com credenciais válidas"
                />
                {issueFor("title") && <span id="case-title-error" className="mt-1.5 block text-xs font-bold text-fail">{issueFor("title")?.message}</span>}
              </label>
              <label className="block text-xs font-bold text-subtle">Descrição
                <textarea rows={1} className={`${inputClass} mt-1.5 min-h-14 resize-y`} value={draft.description ?? ""} onChange={(event) => markDraft({ ...draft, description: event.target.value })} placeholder="O comportamento que este caso valida" />
              </label>
            </section>

            <section aria-labelledby="steps-title">
              <h2 id="steps-title" className="mb-2 text-xs font-bold text-body">Passos e resultados esperados</h2>

              <div className="hidden grid-cols-[34px_minmax(0,1fr)_minmax(0,1.12fr)_44px] border-y border-hairline bg-surface text-xs font-bold text-muted md:grid">
                <span className="border-r border-hairline px-3 py-2">#</span>
                <span className="border-r border-hairline px-3 py-2">Ação</span>
                <span className="border-r border-hairline px-3 py-2">Resultado esperado</span>
                <span className="px-2 py-2"><span className="sr-only">Organizar</span></span>
              </div>
              <div className="relative divide-y divide-hairline overflow-visible rounded-xl border border-hairline md:rounded-t-none md:border-t-0">
                {draft.steps.map((step, index) => (
                  <article key={step.id} className="grid grid-cols-[30px_minmax(0,1fr)_40px] bg-raised md:grid-cols-[34px_minmax(0,1fr)_minmax(0,1.12fr)_44px] md:items-stretch">
                    <span className="row-span-2 flex items-start justify-center border-r border-hairline px-1 py-3 text-xs font-bold tabular-nums text-faint md:row-span-1">{index + 1}</span>
                    <label className="col-span-1 col-start-2 border-b border-hairline px-2 py-1 text-xs font-bold text-muted md:col-start-auto md:border-b-0 md:border-r md:px-2">
                      <span className="md:sr-only">Ação do passo {index + 1}</span>
                      <textarea
                        rows={1}
                        aria-label={`Ação do passo ${index + 1}`}
                        data-validation-path={`steps[${index}].action`}
                        aria-invalid={Boolean(issueFor(`steps[${index}].action`))}
                        aria-describedby={issueFor(`steps[${index}].action`) ? `step-${index}-action-error` : undefined}
                        className={`${inputClass} min-h-16 resize-y rounded-lg border-transparent bg-transparent px-2 py-2 focus:bg-raised md:min-h-10 ${issueFor(`steps[${index}].action`) ? "border-fail-mark focus:border-fail-mark focus:ring-fail-halo" : ""}`}
                        value={step.action}
                        onChange={(event) => patchStep(index, { action: event.target.value })}
                        placeholder="O que o QA executa"
                      />
                      {issueFor(`steps[${index}].action`) && <span id={`step-${index}-action-error`} className="mt-1.5 block text-xs font-bold text-fail">{issueFor(`steps[${index}].action`)?.message}</span>}
                    </label>
                    <label className="col-span-2 col-start-2 border-r border-hairline px-2 py-1 text-xs font-bold text-muted md:col-span-1 md:col-start-auto">
                      <span className="md:sr-only">Resultado esperado do passo {index + 1}</span>
                      <textarea
                        rows={1}
                        aria-label={`Resultado esperado do passo ${index + 1}`}
                        data-validation-path={`steps[${index}].expectedResult`}
                        aria-invalid={Boolean(issueFor(`steps[${index}].expectedResult`))}
                        aria-describedby={issueFor(`steps[${index}].expectedResult`) ? `step-${index}-expected-error` : undefined}
                        className={`${inputClass} min-h-16 resize-y rounded-lg border-transparent bg-transparent px-2 py-2 focus:bg-raised md:min-h-10 ${issueFor(`steps[${index}].expectedResult`) ? "border-fail-mark focus:border-fail-mark focus:ring-fail-halo" : ""}`}
                        value={step.expectedResult}
                        onChange={(event) => patchStep(index, { expectedResult: event.target.value })}
                        placeholder="A evidência de sucesso"
                      />
                      {issueFor(`steps[${index}].expectedResult`) && <span id={`step-${index}-expected-error`} className="mt-1.5 block text-xs font-bold text-fail">{issueFor(`steps[${index}].expectedResult`)?.message}</span>}
                    </label>
                    <div data-step-menu={index} className="relative col-start-3 row-start-1 flex items-start justify-center px-1 py-1 md:col-start-auto md:row-start-auto md:items-center">
                      <button
                        type="button"
                        aria-label={`Organizar passo ${index + 1}`}
                        aria-haspopup="menu"
                        aria-expanded={stepMenuOpen === index}
                        onClick={() => setStepMenuOpen((current) => current === index ? null : index)}
                        className="rounded-lg p-2 text-muted transition hover:bg-shell hover:text-ink-hover"
                      >
                        <MoreVertical size={16} aria-hidden="true" />
                      </button>
                      {stepMenuOpen === index && (
                        <div role="menu" aria-label={`Organizar passo ${index + 1}`} className="absolute right-1 top-10 z-30 w-44 rounded-xl border border-hairline bg-raised p-1.5 text-xs shadow-xl">
                          <button role="menuitem" type="button" disabled={index === 0} onClick={() => { moveStep(index, -1); setStepMenuOpen(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-bold text-control hover:bg-surface disabled:opacity-35"><ChevronUp size={15} /> Mover para cima</button>
                          <button role="menuitem" type="button" disabled={index === draft.steps.length - 1} onClick={() => { moveStep(index, 1); setStepMenuOpen(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-bold text-control hover:bg-surface disabled:opacity-35"><ChevronDown size={15} /> Mover para baixo</button>
                          <button role="menuitem" type="button" disabled={draft.steps.length === 1} onClick={() => { markDraft({ ...draft, steps: draft.steps.filter((_, stepIndex) => stepIndex !== index) }); setStepMenuOpen(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-bold text-fail hover:bg-fail-tint disabled:opacity-35"><Trash2 size={15} /> Remover passo</button>
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

        <aside className="hidden min-h-0 border-l border-hairline min-[1120px]:flex" aria-label="Propriedades do caso">
          {renderInspector()}
        </aside>

        <footer className="fixed inset-x-0 bottom-0 z-20 flex min-h-18 items-center gap-2 border-t border-hairline bg-raised/95 px-4 py-3 backdrop-blur md:left-52 min-[1120px]:static min-[1120px]:col-span-full min-[1120px]:left-auto min-[1120px]:bg-raised">
          <div className="hidden items-center gap-2 text-xs text-muted md:flex">
            <Check size={16} className="text-pass" aria-hidden="true" />
            <span>{dirty ? "Revise e salve para criar a nova revisão." : "Você está vendo a definição persistida."}</span>
          </div>
          <button ref={detailsButtonRef} type="button" className={`${buttonSecondary} mr-auto min-[1120px]:hidden`} onClick={() => setMobileDetailsOpen(true)}><PanelRightOpen size={16} /> Detalhes</button>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className={`${buttonSecondary} hidden sm:inline-flex`} onClick={() => void requestClose()}>Cancelar</button>
            <Button variant="primary" className="ring-2 ring-run-accent ring-offset-2" loading={saving} loadingLabel="Salvando…" icon={<Save size={16} />} onClick={() => void submit()}>Salvar caso</Button>
          </div>
        </footer>
      </div>

      {mobileDetailsOpen && (
        <div className="fixed inset-0 z-50 min-[1120px]:hidden">
          <button type="button" aria-label="Fechar detalhes" className="absolute inset-0 bg-ink/45" onClick={() => setMobileDetailsOpen(false)} />
          <section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="case-details-title" className="absolute inset-x-0 bottom-0 flex max-h-[58vh] flex-col overflow-hidden rounded-t-3xl bg-raised shadow-2xl">
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-hairline-strong" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <div>
                <p className="font-mono text-xs font-bold text-muted">{draft.id}</p>
                <h2 id="case-details-title" className="font-bold text-body">Detalhes do caso</h2>
              </div>
              <button type="button" aria-label="Fechar detalhes" onClick={() => setMobileDetailsOpen(false)} className="rounded-lg p-2 text-muted hover:bg-shell"><X size={19} /></button>
            </div>
            {renderInspector()}
          </section>
        </div>
      )}
    </div>
  );
}
