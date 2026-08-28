import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  ClipboardPaste,
  Image,
  Lock,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import type { EvidenceMeta, ExploratoryRecord, StepResult, StepStatus, TestRun } from "../../domain/types";
import { deriveCaseStatus, isRunEditable, resultKey, runProgress } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { Modal } from "../../ui/Modal";
import { Select, type SelectOption } from "../../ui/Select";
import { StatusPicker, type StatusOption } from "../../ui/StatusPicker";
import { useToast } from "../../ui/ToastProvider";
import {
  StatusBadge,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  runStatusLabel,
  statusTone,
  stepStatusLabel,
} from "./Shared";

const stepTypeLabel = { given: "Dado", when: "Quando", then: "Então", and: "E" } as const;

/*
 * Atalhos do resultado do passo. Só os quatro desfechos têm tecla — "não executado" é o
 * estado inicial, não uma escolha que se repete.
 */
const stepStatusShortcut: Partial<Record<StepStatus, string>> = { passed: "1", failed: "2", blocked: "3", skipped: "4" };

const stepStatusOptions: StatusOption<StepStatus>[] = (Object.keys(stepStatusLabel) as StepStatus[]).map((value) => ({
  value,
  label: stepStatusLabel[value],
  tone: statusTone[value],
  shortcut: stepStatusShortcut[value],
}));

const classificationOptions: SelectOption<ExploratoryRecord["classification"]>[] = [
  { value: "note", label: "Nota", hint: "Observação sem impacto imediato" },
  { value: "bug", label: "Bug", hint: "Comportamento incorreto confirmado" },
  { value: "risk", label: "Risco", hint: "Pode falhar em outro contexto" },
  { value: "idea", label: "Ideia", hint: "Sugestão de melhoria" },
];

const severityOptions: SelectOption<ExploratoryRecord["severity"]>[] = [
  { value: "info", label: "Informativa" },
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

function EvidencePreview({ meta, editable, onRemove }: { meta: EvidenceMeta; editable: boolean; onRemove: () => void }) {
  const getEvidenceData = useQaStore((state) => state.getEvidenceData);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEvidenceData(meta.id).then((data) => { if (!cancelled) setSource(data); });
    return () => { cancelled = true; };
  }, [getEvidenceData, meta.id]);

  return (
    <figure className="group relative overflow-hidden rounded-xl border border-hairline bg-shell">
      {source ? <img src={source} alt={meta.name} className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center text-faint"><Image size={22} /></div>}
      <figcaption className="truncate px-2 py-1.5 text-[11px] text-subtle" title={`${meta.name} · SHA-256 ${meta.sha256}`}>{meta.name}</figcaption>
      {editable && <button type="button" aria-label={`Remover evidência ${meta.name}`} onClick={onRemove} className="absolute right-2 top-2 rounded-lg bg-raised/90 p-1.5 text-fail opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"><Trash2 size={14} /></button>}
    </figure>
  );
}

type PendingStepResult = Pick<StepResult, "status" | "actualResult"> & { caseId: string; stepId: string };

function StepCard({
  run,
  caseId,
  stepId,
  expanded,
  onSelect,
  pendingResult,
  onPendingChange,
  onSaved,
}: {
  run: TestRun;
  caseId: string;
  stepId: string;
  expanded: boolean;
  onSelect: () => void;
  pendingResult?: PendingStepResult;
  onPendingChange: (key: string, result: PendingStepResult) => void;
  onSaved: (key: string) => void;
}) {
  const testCase = run.snapshot.cases.find((item) => item.id === caseId);
  const stepIndex = testCase?.steps.findIndex((item) => item.id === stepId) ?? -1;
  const step = testCase?.steps[stepIndex];
  const key = resultKey(caseId, stepId);
  const stored = run.results[key];
  const allEvidence = useQaStore((state) => state.evidence);
  const evidence = useMemo(
    () => allEvidence.filter((item) => stored?.evidenceIds.includes(item.id)),
    [allEvidence, stored?.evidenceIds],
  );
  const updateStepResult = useQaStore((state) => state.updateStepResult);
  const addEvidence = useQaStore((state) => state.addEvidence);
  const removeEvidence = useQaStore((state) => state.removeEvidence);
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<StepStatus>(pendingResult?.status ?? stored?.status ?? "not_run");
  const [actualResult, setActualResult] = useState(pendingResult?.actualResult ?? stored?.actualResult ?? "");
  const [saving, setSaving] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteTargetRef = useRef<HTMLDivElement>(null);
  const editable = isRunEditable(run) && run.status !== "paused";

  if (!step) return null;

  const save = async () => {
    setSaving(true);
    const result = await updateStepResult(run.id, caseId, stepId, status, actualResult);
    setSaving(false);
    toast.fromResult(result);
    if (result.ok) onSaved(key);
  };

  const changeStatus = (nextStatus: StepStatus) => {
    setStatus(nextStatus);
    onPendingChange(key, { caseId, stepId, status: nextStatus, actualResult });
  };

  const changeActualResult = (nextActualResult: string) => {
    setActualResult(nextActualResult);
    onPendingChange(key, { caseId, stepId, status, actualResult: nextActualResult });
  };

  const storeEvidence = async (file: Blob, source: "file" | "clipboard") => {
    setEvidenceBusy(true);
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = source === "clipboard" ? `captura-${stepId}-${timestamp}.${extension}` : undefined;
    const result = await addEvidence(run.id, "step", key, file, name);
    setEvidenceBusy(false);
    toast.fromResult(result, {
      successDescription: source === "clipboard" ? "Imagem colada e vinculada a este passo." : undefined,
    });
  };

  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await storeEvidence(file, "file");
    event.target.value = "";
  };

  const pasteEvidence = async (event: ClipboardEvent<HTMLElement>) => {
    if (!editable) return;
    const imageItem = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    await storeEvidence(file, "clipboard");
  };

  const readClipboardEvidence = async () => {
    if (!editable || evidenceBusy) return;
    if (!navigator.clipboard?.read) {
      toast.show({ tone: "warning", message: "Seu navegador não permite ler imagens pelo botão.", description: "Selecione a área de evidências e pressione Ctrl+V." });
      pasteTargetRef.current?.focus();
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        await storeEvidence(await item.getType(imageType), "clipboard");
        return;
      }
      toast.show({ tone: "warning", message: "A área de transferência não contém uma imagem.", description: "Copie uma captura e tente novamente." });
      pasteTargetRef.current?.focus();
    } catch {
      toast.show({ tone: "error", message: "Não foi possível acessar a área de transferência.", description: "Selecione a área de evidências e pressione Ctrl+V." });
      pasteTargetRef.current?.focus();
    }
  };

  const removeWithConfirm = async (meta: EvidenceMeta) => {
    const confirmed = await confirm({
      title: "Remover esta evidência?",
      description: "A imagem sai do snapshot desta tentativa e não pode ser recuperada.",
      itemLabel: meta.name,
      confirmLabel: "Remover evidência",
      tone: "danger",
    });
    if (!confirmed) return;
    toast.fromResult(await removeEvidence(meta.id));
  };

  const contentId = `run-step-${caseId}-${stepId}`;

  return (
    <article
      ref={cardRef}
      className={`overflow-hidden rounded-2xl border bg-raised transition ${expanded ? "border-run-line shadow-sm ring-1 ring-run-halo" : "border-hairline hover:border-hairline-strong"}`}
      onPaste={(event) => void pasteEvidence(event)}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onSelect}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${expanded ? "bg-ink text-raised" : "bg-shell text-subtle"}`}>{stepIndex + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-run">{stepTypeLabel[step.type]}</span>
          <span className="mt-0.5 block truncate text-sm font-bold text-body sm:text-base">{step.action}</span>
        </span>
        <StatusBadge value={status} label={stepStatusLabel[status]} />
        <ChevronDown size={18} className={`shrink-0 text-faint transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {expanded && (
        <div id={contentId} className="border-t border-hairline">
          <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div className="p-4 sm:p-5">
              <p className="text-xs font-bold text-muted">Ação</p>
              <p className="mt-1 max-w-3xl text-base font-bold leading-relaxed text-body">{step.action}</p>

              <div className="mt-5 border-t border-hairline pt-4">
                <p className="text-xs font-bold text-muted">Resultado esperado</p>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-control">{step.expectedResult}</p>
              </div>
            </div>

            <div className="border-t border-hairline bg-surface/70 p-4 sm:p-5 lg:border-l lg:border-t-0">
              <h3 className="font-bold text-body">Registrar resultado</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs font-bold text-subtle" id={`${contentId}-status-label`}>Status do passo</p>
                  <StatusPicker
                    className="mt-1.5"
                    ariaLabel={`Status do passo ${stepIndex + 1}`}
                    value={status}
                    onChange={changeStatus}
                    options={stepStatusOptions}
                    disabled={!editable}
                    shortcutScopeRef={cardRef}
                  />
                </div>
                <label className="block text-xs font-bold text-subtle">Resultado obtido {(status === "failed" || status === "blocked") && <span className="text-fail">*</span>}
                  <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} disabled={!editable} value={actualResult} onChange={(event) => changeActualResult(event.target.value)} placeholder="Descreva o observado, uma diferença ou o motivo do bloqueio" />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-end">
                <Button variant="primary" loading={saving} loadingLabel="Salvando…" disabled={!editable} icon={<CheckCircle2 size={16} />} onClick={() => void save()}>Salvar resultado</Button>
              </div>
            </div>
          </div>

          <div className="border-t border-hairline p-4 sm:p-5">
            <div
              ref={pasteTargetRef}
              tabIndex={editable ? 0 : -1}
              role="group"
              aria-label="Adicionar evidência por colagem ou arquivo"
              className="flex flex-col gap-4 rounded-xl border border-dashed border-hairline-strong bg-surface px-4 py-4 outline-none transition focus:border-run-mark focus:bg-run-tint/50 focus:ring-4 focus:ring-run-halo sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-run ring-1 ring-hairline"><ClipboardPaste size={18} /></span>
                <div>
                  <p className="text-sm font-bold text-body">Cole uma captura como evidência</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-subtle">Use Ctrl+V nesta área ou leia diretamente a imagem copiada.</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="primary" loading={evidenceBusy} loadingLabel="Processando…" disabled={!editable} icon={<ClipboardPaste size={15} />} onClick={() => void readClipboardEvidence()}>Colar imagem</Button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void attach(event)} />
                <button type="button" className={buttonSecondary} disabled={!editable || evidenceBusy} onClick={() => fileRef.current?.click()}><Camera size={15} /> Escolher arquivo</button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-subtle">Evidências anexadas <span className="ml-1 rounded-full bg-shell px-2 py-0.5 text-control">{evidence.length}</span></p>
              <p className="text-[11px] text-muted">As imagens permanecem neste dispositivo e são vinculadas por hash.</p>
            </div>
            {evidence.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{evidence.map((meta) => <EvidencePreview key={meta.id} meta={meta} editable={editable} onRemove={() => void removeWithConfirm(meta)} />)}</div>}
          </div>
        </div>
      )}
    </article>
  );
}

function ExploratorySection({ run }: { run: TestRun }) {
  const addRecord = useQaStore((state) => state.addExploratoryRecord);
  const addEvidence = useQaStore((state) => state.addEvidence);
  const removeEvidence = useQaStore((state) => state.removeEvidence);
  const evidence = useQaStore((state) => state.evidence);
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<Omit<ExploratoryRecord, "id" | "createdAt" | "evidenceIds">>({
    title: "",
    notes: "",
    classification: "note",
    severity: "info",
  });
  const [saving, setSaving] = useState(false);
  const editable = isRunEditable(run) && run.status !== "paused";

  const submit = async () => {
    setSaving(true);
    const result = await addRecord(run.id, form);
    setSaving(false);
    toast.fromResult(result);
    if (result.ok) setForm({ title: "", notes: "", classification: "note", severity: "info" });
  };

  const removeWithConfirm = async (meta: EvidenceMeta) => {
    const confirmed = await confirm({
      title: "Remover esta evidência?",
      description: "A imagem sai do registro exploratório e não pode ser recuperada.",
      itemLabel: meta.name,
      confirmLabel: "Remover evidência",
      tone: "danger",
    });
    if (!confirmed) return;
    toast.fromResult(await removeEvidence(meta.id));
  };

  return (
    <section className="mt-7 rounded-2xl border border-explore-line bg-explore-tint/60 p-5">
      <div>
        <h2 className="text-lg font-bold text-explore-deep">Exploratório</h2>
        <p className="text-sm text-explore-deep">Registre achados que surgiram fora dos passos previstos, sem misturá-los ao resultado formal.</p>
      </div>
      {editable && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold text-explore-deep">Título<input className={`${inputClass} mt-1`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-xs font-bold text-explore-deep">
              <label htmlFor="exploratory-classification">Classificação</label>
              <Select id="exploratory-classification" className="mt-1" ariaLabel="Classificação do achado" value={form.classification} onChange={(classification) => setForm({ ...form, classification })} options={classificationOptions} />
            </div>
            <div className="text-xs font-bold text-explore-deep">
              <label htmlFor="exploratory-severity">Severidade</label>
              <Select id="exploratory-severity" className="mt-1" ariaLabel="Severidade do achado" value={form.severity} onChange={(severity) => setForm({ ...form, severity })} options={severityOptions} />
            </div>
          </div>
          <label className="text-xs font-bold text-explore-deep md:col-span-2">Observação<textarea className={`${inputClass} mt-1 min-h-24 resize-y`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="md:col-span-2"><Button variant="primary" loading={saving} loadingLabel="Registrando…" icon={<Plus size={15} />} onClick={() => void submit()}>Adicionar registro</Button></div>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {run.exploratoryRecords.length === 0 && <p className="rounded-xl border border-dashed border-explore-line p-5 text-center text-sm text-explore">Nenhum registro exploratório.</p>}
        {run.exploratoryRecords.map((record) => {
          const recordEvidence = evidence.filter((item) => record.evidenceIds.includes(item.id));
          return (
            <article key={record.id} className="rounded-xl border border-explore-line bg-raised p-4">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-explore-tint px-2 py-1 text-xs font-bold text-explore">{record.classification}</span><span className="text-xs font-bold text-muted">{record.severity}</span></div>
              <h3 className="mt-2 font-bold text-body">{record.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-subtle">{record.notes}</p>
              {editable && <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-explore"><Camera size={15} /> Anexar imagem<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                // Antes o resultado era descartado: uma falha ao anexar não dizia nada.
                if (file) void addEvidence(run.id, "exploratory", record.id, file).then((result) => toast.fromResult(result));
                event.target.value = "";
              }} /></label>}
              {recordEvidence.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{recordEvidence.map((meta) => <EvidencePreview key={meta.id} meta={meta} editable={editable} onRemove={() => void removeWithConfirm(meta)} />)}</div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function RunRunner({ run, onBack }: { run: TestRun; onBack: () => void }) {
  const setRunStatus = useQaStore((state) => state.setRunStatus);
  const updateStepResult = useQaStore((state) => state.updateStepResult);
  const toast = useToast();
  const [selectedCaseId, setSelectedCaseId] = useState(run.snapshot.cases[0]?.id ?? "");
  const [activeStepId, setActiveStepId] = useState(run.snapshot.cases[0]?.steps[0]?.id ?? "");
  const [expandedStepId, setExpandedStepId] = useState<string | null>(run.snapshot.cases[0]?.steps[0]?.id ?? null);
  const [pendingFinalStatus, setPendingFinalStatus] = useState<"completed" | "aborted" | null>(null);
  const [pendingStepResults, setPendingStepResults] = useState<Record<string, PendingStepResult>>({});
  const [flushed, setFlushed] = useState(0);
  const [ending, setEnding] = useState(false);
  const selectedCase = run.snapshot.cases.find((item) => item.id === selectedCaseId) ?? run.snapshot.cases[0];
  const activeStepIndex = Math.max(0, selectedCase?.steps.findIndex((step) => step.id === activeStepId) ?? 0);
  const progress = runProgress(run);
  const counts = useMemo(() => run.snapshot.cases.reduce<Record<StepStatus, number>>((accumulator, testCase) => {
    const status = deriveCaseStatus(run, testCase);
    accumulator[status] += 1;
    return accumulator;
  }, { not_run: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 }), [run]);

  const caseOptions = useMemo<SelectOption[]>(() => run.snapshot.cases.map((testCase, index) => {
    const status = deriveCaseStatus(run, testCase);
    return {
      value: testCase.id,
      label: testCase.title,
      hint: `Caso ${index + 1} de ${run.snapshot.cases.length} · ${stepStatusLabel[status]}`,
    };
  }), [run]);

  const selectCase = (caseId: string) => {
    const nextCase = run.snapshot.cases.find((item) => item.id === caseId);
    const firstPendingStep = nextCase?.steps.find((step) => (run.results[resultKey(caseId, step.id)]?.status ?? "not_run") === "not_run");
    setSelectedCaseId(caseId);
    const nextStepId = firstPendingStep?.id ?? nextCase?.steps[0]?.id ?? "";
    setActiveStepId(nextStepId);
    setExpandedStepId(nextStepId || null);
  };

  const moveActiveStep = (offset: number) => {
    if (!selectedCase) return;
    const nextIndex = Math.min(Math.max(activeStepIndex + offset, 0), selectedCase.steps.length - 1);
    const nextStepId = selectedCase.steps[nextIndex]?.id ?? "";
    setActiveStepId(nextStepId);
    setExpandedStepId(nextStepId || null);
  };

  const pendingCount = Object.keys(pendingStepResults).length;

  const transition = async (status: "in_progress" | "paused" | "completed" | "aborted") => {
    // Concluir e abortar são as transições que passam pelo diálogo e podem demorar.
    if (status === "completed" || status === "aborted") setEnding(true);
    if (status === "completed") {
      // Concluir aplica os resultados ainda não salvos, um a um: o contador mostra
      // quantos já foram, em vez de deixar a tela parada até o fim do laço.
      const entries = Object.values(pendingStepResults);
      setFlushed(0);
      for (const [index, result] of entries.entries()) {
        const saved = await updateStepResult(run.id, result.caseId, result.stepId, result.status, result.actualResult);
        if (!saved.ok) {
          setEnding(false);
          toast.fromResult(saved);
          return;
        }
        setFlushed(index + 1);
      }
    }
    const result = await setRunStatus(run.id, status);
    setEnding(false);
    toast.fromResult(result);
    if (result.ok) {
      setPendingFinalStatus(null);
      setPendingStepResults({});
    }
  };

  return (
    <>
      <button type="button" className={`${buttonSecondary} mb-4`} onClick={onBack}><ArrowLeft size={16} /> Histórico</button>
      <header className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><StatusBadge value={run.status} label={runStatusLabel[run.status]} /><span className="text-xs font-bold text-muted">Tentativa {run.attempt}</span><span className="text-xs text-faint">plano rev. {run.planRevision}</span></div>
            <h1 className="mt-2 text-2xl font-black text-body">{run.snapshot.plan.name}</h1>
            <p className="mt-1 text-sm text-muted">{run.context.environment || "Ambiente não informado"} · {run.context.tester || "Responsável não informado"} · iniciada em {new Date(run.startedAt).toLocaleString("pt-BR")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {run.status === "in_progress" && <button type="button" className={buttonSecondary} onClick={() => void transition("paused")}><CirclePause size={16} /> Pausar</button>}
            {run.status === "paused" && <button type="button" className={buttonPrimary} onClick={() => void transition("in_progress")}><CirclePlay size={16} /> Retomar</button>}
            {(run.status === "in_progress" || run.status === "paused") && <button type="button" className={buttonDanger} onClick={() => setPendingFinalStatus("aborted")}><Square size={15} /> Abortar</button>}
            {run.status === "in_progress" && <button type="button" className={buttonPrimary} onClick={() => setPendingFinalStatus("completed")}><CheckCircle2 size={16} /> Concluir</button>}
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs font-bold text-muted"><span>{progress.executed} de {progress.total} passos registrados</span><span className="tabular-nums">{progress.percent}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-shell"><div className="h-full rounded-full bg-run-mark transition-all" style={{ width: `${progress.percent}%` }} /></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {(Object.keys(counts) as StepStatus[]).filter((status) => counts[status] > 0).map((status) => <span key={status} className="text-xs text-muted"><strong className="text-body">{counts[status]}</strong> {counts[status] === 1 ? "caso" : "casos"} {stepStatusLabel[status].toLowerCase()}</span>)}
          <span className="flex items-center gap-1.5 text-xs text-muted"><Lock size={14} aria-hidden="true" /> Snapshot protegido: alterações futuras não mudam esta tentativa.</span>
        </div>
      </header>

      <div className="mt-6 grid gap-5 xl:grid-cols-[300px_1fr]">
        <aside className="xl:sticky xl:top-22 xl:self-start">
          <div className="mb-3 xl:hidden">
            <label htmlFor="runner-case" className="block text-xs font-bold text-subtle">Caso atual</label>
            <Select id="runner-case" className="mt-1" ariaLabel="Caso atual" value={selectedCase?.id ?? ""} onChange={selectCase} options={caseOptions} searchable={caseOptions.length > 8} searchPlaceholder="Buscar caso…" />
          </div>
          <div className="hidden max-h-[calc(100vh-8rem)] space-y-2 overflow-y-auto rounded-2xl border border-hairline bg-raised p-3 shadow-sm xl:block">
            {run.snapshot.cases.map((testCase, index) => {
              const status = deriveCaseStatus(run, testCase);
              return <button key={testCase.id} type="button" onClick={() => selectCase(testCase.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedCase?.id === testCase.id ? "border-run-line bg-run-tint" : "border-transparent hover:bg-surface"}`}><div className="flex items-center gap-2"><span className="text-xs font-bold text-faint">{index + 1}</span><StatusBadge value={status} label={stepStatusLabel[status]} /></div><p className="mt-2 text-sm font-bold text-body">{testCase.title}</p><p className="mt-1 text-[11px] text-muted">{testCase.id} · {testCase.steps.length} passo(s)</p></button>;
            })}
          </div>
        </aside>

        <div>
          {selectedCase && (
            <section>
              <div className="mb-4 rounded-2xl border border-hairline bg-raised p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge value={deriveCaseStatus(run, selectedCase)} label={stepStatusLabel[deriveCaseStatus(run, selectedCase)]} /><span className="font-mono text-xs text-run">{selectedCase.id}</span><span className="text-xs text-muted">snapshot rev. {selectedCase.revision}</span></div>
                    <h2 className="mt-2 text-xl font-bold text-body">{selectedCase.title}</h2>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-hairline bg-surface p-1.5 sm:justify-start">
                    <button type="button" aria-label="Passo anterior" className="rounded-lg p-2 text-subtle transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-35" disabled={activeStepIndex === 0} onClick={() => moveActiveStep(-1)}><ChevronLeft size={18} /></button>
                    <span className="min-w-24 text-center text-xs font-bold text-control">Passo {activeStepIndex + 1} de {selectedCase.steps.length}</span>
                    <button type="button" aria-label="Próximo passo" className="rounded-lg p-2 text-subtle transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-35" disabled={activeStepIndex >= selectedCase.steps.length - 1} onClick={() => moveActiveStep(1)}><ChevronRight size={18} /></button>
                  </div>
                </div>
                {selectedCase.precondition && <p className="mt-2 rounded-xl border border-hairline bg-raised p-3 text-sm text-subtle"><strong>Pré-condição:</strong> {selectedCase.precondition}</p>}
              </div>
              <div className="space-y-3">{selectedCase.steps.map((step) => {
                const key = resultKey(selectedCase.id, step.id);
                return <StepCard
                  key={step.id}
                  run={run}
                  caseId={selectedCase.id}
                  stepId={step.id}
                  expanded={expandedStepId === step.id}
                  onSelect={() => {
                    setActiveStepId(step.id);
                    setExpandedStepId((current) => current === step.id ? null : step.id);
                  }}
                  pendingResult={pendingStepResults[key]}
                  onPendingChange={(resultKeyValue, result) => setPendingStepResults((current) => ({ ...current, [resultKeyValue]: result }))}
                  onSaved={(resultKeyValue) => setPendingStepResults((current) => {
                    const next = { ...current };
                    delete next[resultKeyValue];
                    return next;
                  })}
                />;
              })}</div>
            </section>
          )}
          <ExploratorySection run={run} />
        </div>
      </div>

      <Modal
        open={pendingFinalStatus !== null}
        onClose={() => { if (!ending) setPendingFinalStatus(null); }}
        title={pendingFinalStatus === "aborted" ? "Abortar tentativa?" : "Concluir tentativa?"}
        description={pendingFinalStatus === "aborted"
          ? "A tentativa será encerrada como abortada. O snapshot e os resultados já registrados continuarão no histórico."
          : "Todos os resultados serão preservados e esta tentativa ficará bloqueada para edição."}
        size="sm"
        tone={pendingFinalStatus === "aborted" ? "danger" : "default"}
        showClose={false}
        closeOnBackdrop={false}
        footer={(
          <>
            <button type="button" className={buttonSecondary} disabled={ending} onClick={() => setPendingFinalStatus(null)}>Cancelar</button>
            <Button
              variant={pendingFinalStatus === "aborted" ? "danger" : "primary"}
              loading={ending}
              loadingLabel={pendingFinalStatus === "completed" && pendingCount ? `Salvando ${flushed} de ${pendingCount}…` : "Encerrando…"}
              onClick={() => { if (pendingFinalStatus) void transition(pendingFinalStatus); }}
            >
              {pendingFinalStatus === "aborted" ? "Confirmar aborto" : "Concluir e bloquear"}
            </Button>
          </>
        )}
      >
        {pendingFinalStatus === "completed" && pendingCount > 0
          ? <p className="text-sm text-subtle">{pendingCount} resultado(s) de passo ainda não salvo(s) serão aplicados agora, antes do bloqueio.</p>
          : <p className="text-sm text-subtle">Nenhuma alteração pendente. A tentativa será encerrada como está.</p>}
      </Modal>
    </>
  );
}
