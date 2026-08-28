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
import {
  Notice,
  StatusBadge,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  runStatusLabel,
  stepStatusLabel,
} from "./Shared";

const stepTypeLabel = { given: "Dado", when: "Quando", then: "Então", and: "E" } as const;

function EvidencePreview({ meta, editable, onRemove }: { meta: EvidenceMeta; editable: boolean; onRemove: () => void }) {
  const getEvidenceData = useQaStore((state) => state.getEvidenceData);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEvidenceData(meta.id).then((data) => { if (!cancelled) setSource(data); });
    return () => { cancelled = true; };
  }, [getEvidenceData, meta.id]);

  return (
    <figure className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      {source ? <img src={source} alt={meta.name} className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center text-slate-400"><Image size={22} /></div>}
      <figcaption className="truncate px-2 py-1.5 text-[11px] text-slate-600" title={`${meta.name} · SHA-256 ${meta.sha256}`}>{meta.name}</figcaption>
      {editable && <button type="button" aria-label={`Remover evidência ${meta.name}`} onClick={onRemove} className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-rose-600 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100"><Trash2 size={14} /></button>}
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
  const [status, setStatus] = useState<StepStatus>(pendingResult?.status ?? stored?.status ?? "not_run");
  const [actualResult, setActualResult] = useState(pendingResult?.actualResult ?? stored?.actualResult ?? "");
  const [message, setMessage] = useState("");
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteTargetRef = useRef<HTMLDivElement>(null);
  const editable = isRunEditable(run) && run.status !== "paused";

  if (!step) return null;

  const save = async () => {
    const result = await updateStepResult(run.id, caseId, stepId, status, actualResult);
    setMessage(result.message);
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
    setMessage(result.ok && source === "clipboard" ? "Imagem colada e vinculada a este passo." : result.message);
    setEvidenceBusy(false);
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
      setMessage("Seu navegador não permite ler imagens pelo botão. Selecione a área de evidências e pressione Ctrl+V.");
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
      setMessage("A área de transferência não contém uma imagem. Copie uma captura e tente novamente.");
      pasteTargetRef.current?.focus();
    } catch {
      setMessage("Não foi possível acessar a área de transferência. Selecione a área de evidências e pressione Ctrl+V.");
      pasteTargetRef.current?.focus();
    }
  };

  const feedbackIsError = /não|nenhuma|erro|falha/i.test(message);
  const contentId = `run-step-${caseId}-${stepId}`;

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white transition ${expanded ? "border-cyan-300 shadow-sm ring-1 ring-cyan-100" : "border-slate-200 hover:border-slate-300"}`}
      onPaste={(event) => void pasteEvidence(event)}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onSelect}
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${expanded ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{stepIndex + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black uppercase tracking-wide text-cyan-700">{stepTypeLabel[step.type]}</span>
          <span className="mt-0.5 block truncate text-sm font-bold text-slate-950 sm:text-base">{step.action}</span>
        </span>
        <StatusBadge value={status} label={stepStatusLabel[status]} />
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {expanded && (
        <div id={contentId} className="border-t border-slate-200">
          <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div className="p-4 sm:p-5">
              <p className="text-xs font-bold text-slate-500">Ação</p>
              <p className="mt-1 max-w-3xl text-base font-bold leading-relaxed text-slate-950">{step.action}</p>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <p className="text-xs font-bold text-slate-500">Resultado esperado</p>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-700">{step.expectedResult}</p>
              </div>
            </div>

            <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5 lg:border-l lg:border-t-0">
              <h3 className="font-black text-slate-950">Registrar resultado</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr] lg:grid-cols-1">
                <label className="text-xs font-bold text-slate-600">Status do passo
                  <select className={`${inputClass} mt-1`} disabled={!editable} value={status} onChange={(event) => changeStatus(event.target.value as StepStatus)}>
                    {(Object.keys(stepStatusLabel) as StepStatus[]).map((value) => <option key={value} value={value}>{stepStatusLabel[value]}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">Resultado obtido {(status === "failed" || status === "blocked") && <span className="text-rose-600">*</span>}
                  <textarea className={`${inputClass} mt-1 min-h-24 resize-y`} disabled={!editable} value={actualResult} onChange={(event) => changeActualResult(event.target.value)} placeholder="Descreva o observado, uma diferença ou o motivo do bloqueio" />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-end">
                <button type="button" className={buttonPrimary} disabled={!editable} onClick={() => void save()}><CheckCircle2 size={16} /> Salvar resultado</button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 p-4 sm:p-5">
            <div
              ref={pasteTargetRef}
              tabIndex={editable ? 0 : -1}
              role="group"
              aria-label="Adicionar evidência por colagem ou arquivo"
              className="flex flex-col gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 outline-none transition focus:border-cyan-500 focus:bg-cyan-50/50 focus:ring-4 focus:ring-cyan-100 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-cyan-700 ring-1 ring-slate-200"><ClipboardPaste size={18} /></span>
                <div>
                  <p className="text-sm font-bold text-slate-900">Cole uma captura como evidência</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">Use Ctrl+V nesta área ou leia diretamente a imagem copiada.</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" className={buttonPrimary} disabled={!editable || evidenceBusy} onClick={() => void readClipboardEvidence()}><ClipboardPaste size={15} /> {evidenceBusy ? "Processando..." : "Colar imagem"}</button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void attach(event)} />
                <button type="button" className={buttonSecondary} disabled={!editable || evidenceBusy} onClick={() => fileRef.current?.click()}><Camera size={15} /> Escolher arquivo</button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-600">Evidências anexadas <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{evidence.length}</span></p>
              <p className="text-[11px] text-slate-500">As imagens permanecem neste dispositivo e são vinculadas por hash.</p>
            </div>
            {message && <p role="status" aria-live="polite" className={`mt-2 text-xs font-semibold ${feedbackIsError ? "text-rose-700" : "text-emerald-700"}`}>{message}</p>}
            {evidence.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{evidence.map((meta) => <EvidencePreview key={meta.id} meta={meta} editable={editable} onRemove={() => { if (window.confirm(`Remover a evidência “${meta.name}”?`)) void removeEvidence(meta.id); }} />)}</div>}
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
  const [form, setForm] = useState<Omit<ExploratoryRecord, "id" | "createdAt" | "evidenceIds">>({
    title: "",
    notes: "",
    classification: "note",
    severity: "info",
  });
  const [message, setMessage] = useState("");
  const editable = isRunEditable(run) && run.status !== "paused";

  const submit = async () => {
    const result = await addRecord(run.id, form);
    setMessage(result.message);
    if (result.ok) setForm({ title: "", notes: "", classification: "note", severity: "info" });
  };

  return (
    <section className="mt-7 rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
      <div>
        <h2 className="text-lg font-black text-violet-950">Exploratório</h2>
        <p className="text-sm text-violet-800">Registre achados que surgiram fora dos passos previstos, sem misturá-los ao resultado formal.</p>
      </div>
      {editable && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold text-violet-900">Título<input className={`${inputClass} mt-1`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-violet-900">Classificação<select className={`${inputClass} mt-1`} value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value as typeof form.classification })}><option value="note">Nota</option><option value="bug">Bug</option><option value="risk">Risco</option><option value="idea">Ideia</option></select></label>
            <label className="text-xs font-bold text-violet-900">Severidade<select className={`${inputClass} mt-1`} value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value as typeof form.severity })}><option value="info">Informativa</option><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label>
          </div>
          <label className="text-xs font-bold text-violet-900 md:col-span-2">Observação<textarea className={`${inputClass} mt-1 min-h-24 resize-y`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="md:col-span-2"><button type="button" className={buttonPrimary} onClick={() => void submit()}><Plus size={15} /> Adicionar registro</button>{message && <span role="status" className="ml-3 text-xs font-bold text-violet-800">{message}</span>}</div>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {run.exploratoryRecords.length === 0 && <p className="rounded-xl border border-dashed border-violet-200 p-5 text-center text-sm text-violet-700">Nenhum registro exploratório.</p>}
        {run.exploratoryRecords.map((record) => {
          const recordEvidence = evidence.filter((item) => record.evidenceIds.includes(item.id));
          return (
            <article key={record.id} className="rounded-xl border border-violet-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-black text-violet-800">{record.classification}</span><span className="text-xs font-bold text-slate-500">{record.severity}</span></div>
              <h3 className="mt-2 font-black text-slate-950">{record.title}</h3><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{record.notes}</p>
              {editable && <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-black text-violet-700"><Camera size={15} /> Anexar imagem<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addEvidence(run.id, "exploratory", record.id, file); event.target.value = ""; }} /></label>}
              {recordEvidence.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{recordEvidence.map((meta) => <EvidencePreview key={meta.id} meta={meta} editable={editable} onRemove={() => { if (window.confirm(`Remover a evidência “${meta.name}”?`)) void removeEvidence(meta.id); }} />)}</div>}
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
  const [selectedCaseId, setSelectedCaseId] = useState(run.snapshot.cases[0]?.id ?? "");
  const [activeStepId, setActiveStepId] = useState(run.snapshot.cases[0]?.steps[0]?.id ?? "");
  const [expandedStepId, setExpandedStepId] = useState<string | null>(run.snapshot.cases[0]?.steps[0]?.id ?? null);
  const [message, setMessage] = useState("");
  const [pendingFinalStatus, setPendingFinalStatus] = useState<"completed" | "aborted" | null>(null);
  const [pendingStepResults, setPendingStepResults] = useState<Record<string, PendingStepResult>>({});
  const selectedCase = run.snapshot.cases.find((item) => item.id === selectedCaseId) ?? run.snapshot.cases[0];
  const activeStepIndex = Math.max(0, selectedCase?.steps.findIndex((step) => step.id === activeStepId) ?? 0);
  const progress = runProgress(run);
  const counts = useMemo(() => run.snapshot.cases.reduce<Record<StepStatus, number>>((accumulator, testCase) => {
    const status = deriveCaseStatus(run, testCase);
    accumulator[status] += 1;
    return accumulator;
  }, { not_run: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 }), [run]);

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

  const transition = async (status: "in_progress" | "paused" | "completed" | "aborted") => {
    if (status === "completed") {
      for (const [, result] of Object.entries(pendingStepResults)) {
        const saved = await updateStepResult(run.id, result.caseId, result.stepId, result.status, result.actualResult);
        if (!saved.ok) {
          setMessage(saved.message);
          return;
        }
      }
    }
    const result = await setRunStatus(run.id, status);
    setMessage(result.message);
    if (result.ok) {
      setPendingFinalStatus(null);
      setPendingStepResults({});
    }
  };

  return (
    <>
      <button type="button" className={`${buttonSecondary} mb-4`} onClick={onBack}><ArrowLeft size={16} /> Histórico</button>
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><StatusBadge value={run.status} label={runStatusLabel[run.status]} /><span className="text-xs font-bold text-slate-500">Tentativa {run.attempt}</span><span className="text-xs text-slate-400">plano rev. {run.planRevision}</span></div>
            <h1 className="mt-2 text-2xl font-black text-slate-950">{run.snapshot.plan.name}</h1>
            <p className="mt-1 text-sm text-slate-500">{run.context.environment || "Ambiente não informado"} · {run.context.tester || "Responsável não informado"} · iniciada em {new Date(run.startedAt).toLocaleString("pt-BR")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {run.status === "in_progress" && <button type="button" className={buttonSecondary} onClick={() => void transition("paused")}><CirclePause size={16} /> Pausar</button>}
            {run.status === "paused" && <button type="button" className={buttonPrimary} onClick={() => void transition("in_progress")}><CirclePlay size={16} /> Retomar</button>}
            {(run.status === "in_progress" || run.status === "paused") && <button type="button" className={buttonDanger} onClick={() => setPendingFinalStatus("aborted")}><Square size={15} /> Abortar</button>}
            {run.status === "in_progress" && <button type="button" className={buttonPrimary} onClick={() => setPendingFinalStatus("completed")}><CheckCircle2 size={16} /> Concluir</button>}
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs font-bold text-slate-500"><span>{progress.executed} de {progress.total} passos registrados</span><span>{progress.percent}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${progress.percent}%` }} /></div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {(Object.keys(counts) as StepStatus[]).filter((status) => counts[status] > 0).map((status) => <span key={status} className="text-xs text-slate-500"><strong className="text-slate-900">{counts[status]}</strong> {counts[status] === 1 ? "caso" : "casos"} {stepStatusLabel[status].toLowerCase()}</span>)}
          <span className="flex items-center gap-1.5 text-xs text-slate-500"><Lock size={14} aria-hidden="true" /> Snapshot protegido: alterações futuras não mudam esta tentativa.</span>
        </div>
      </header>

      {message && <div className="mt-4"><Notice tone={message.includes("Ainda") || message.includes("não") ? "warning" : "success"}>{message}</Notice></div>}

      <div className="mt-6 grid gap-5 xl:grid-cols-[300px_1fr]">
        <aside className="xl:sticky xl:top-22 xl:self-start">
          <label className="mb-3 block text-xs font-bold text-slate-600 xl:hidden">Caso atual<select className={`${inputClass} mt-1`} value={selectedCase?.id} onChange={(event) => selectCase(event.target.value)}>{run.snapshot.cases.map((testCase, index) => <option key={testCase.id} value={testCase.id}>{index + 1}. {testCase.title}</option>)}</select></label>
          <div className="hidden max-h-[calc(100vh-8rem)] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:block">
            {run.snapshot.cases.map((testCase, index) => {
              const status = deriveCaseStatus(run, testCase);
              return <button key={testCase.id} type="button" onClick={() => selectCase(testCase.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedCase?.id === testCase.id ? "border-cyan-300 bg-cyan-50" : "border-transparent hover:bg-slate-50"}`}><div className="flex items-center gap-2"><span className="text-xs font-black text-slate-400">{index + 1}</span><StatusBadge value={status} label={stepStatusLabel[status]} /></div><p className="mt-2 text-sm font-bold text-slate-900">{testCase.title}</p><p className="mt-1 text-[11px] text-slate-500">{testCase.id} · {testCase.steps.length} passo(s)</p></button>;
            })}
          </div>
        </aside>

        <div>
          {selectedCase && (
            <section>
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge value={deriveCaseStatus(run, selectedCase)} label={stepStatusLabel[deriveCaseStatus(run, selectedCase)]} /><span className="font-mono text-xs text-cyan-800">{selectedCase.id}</span><span className="text-xs text-slate-500">snapshot rev. {selectedCase.revision}</span></div>
                    <h2 className="mt-2 text-xl font-black text-slate-950">{selectedCase.title}</h2>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 sm:justify-start">
                    <button type="button" aria-label="Passo anterior" className="rounded-lg p-2 text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35" disabled={activeStepIndex === 0} onClick={() => moveActiveStep(-1)}><ChevronLeft size={18} /></button>
                    <span className="min-w-24 text-center text-xs font-bold text-slate-700">Passo {activeStepIndex + 1} de {selectedCase.steps.length}</span>
                    <button type="button" aria-label="Próximo passo" className="rounded-lg p-2 text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35" disabled={activeStepIndex >= selectedCase.steps.length - 1} onClick={() => moveActiveStep(1)}><ChevronRight size={18} /></button>
                  </div>
                </div>
                {selectedCase.precondition && <p className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600"><strong>Pré-condição:</strong> {selectedCase.precondition}</p>}
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

      {pendingFinalStatus && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="finish-run-title">
          <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7">
            <h2 id="finish-run-title" className="text-xl font-black text-slate-950">{pendingFinalStatus === "completed" ? "Concluir tentativa?" : "Abortar tentativa?"}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{pendingFinalStatus === "completed" ? "Todos os resultados serão preservados e esta tentativa ficará bloqueada para edição. Alterações de passos ainda não salvas serão aplicadas agora." : "A tentativa será encerrada como abortada. O snapshot e os resultados já registrados continuarão no histórico."}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={buttonSecondary} onClick={() => setPendingFinalStatus(null)}>Cancelar</button>
              <button type="button" className={pendingFinalStatus === "completed" ? buttonPrimary : buttonDanger} onClick={() => void transition(pendingFinalStatus)}>{pendingFinalStatus === "completed" ? "Concluir e bloquear" : "Confirmar aborto"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
