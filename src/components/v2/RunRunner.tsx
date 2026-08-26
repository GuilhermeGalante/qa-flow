import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { ArrowLeft, Camera, CheckCircle2, CirclePause, CirclePlay, Image, Lock, Plus, Square, Trash2 } from "lucide-react";
import type { EvidenceMeta, ExploratoryRecord, StepStatus, TestRun } from "../../domain/types";
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

function StepCard({ run, caseId, stepId }: { run: TestRun; caseId: string; stepId: string }) {
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
  const [status, setStatus] = useState<StepStatus>(stored?.status ?? "not_run");
  const [actualResult, setActualResult] = useState(stored?.actualResult ?? "");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = isRunEditable(run) && run.status !== "paused";

  if (!step) return null;

  const save = async () => {
    const result = await updateStepResult(run.id, caseId, stepId, status, actualResult);
    setMessage(result.message);
  };

  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const result = await addEvidence(run.id, "step", key, file);
    setMessage(result.message);
    event.target.value = "";
  };

  const pasteEvidence = async (event: ClipboardEvent<HTMLElement>) => {
    if (!editable) return;
    const imageItem = [...event.clipboardData.items].find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    const result = await addEvidence(run.id, "step", key, file, `evidencia-colada-${stepId}.png`);
    setMessage(result.message);
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onPaste={(event) => void pasteEvidence(event)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-slate-950 px-2 py-1 text-[11px] font-black text-white">{stepIndex + 1}</span>
            <span className="text-xs font-black uppercase tracking-wide text-cyan-700">{stepTypeLabel[step.type]}</span>
          </div>
          <p className="mt-3 font-bold leading-relaxed text-slate-950">{step.action}</p>
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Resultado esperado</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{step.expectedResult}</p>
          </div>
        </div>
        <StatusBadge value={stored?.status ?? "not_run"} label={stepStatusLabel[stored?.status ?? "not_run"]} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
        <label className="text-xs font-bold text-slate-600">Status do passo
          <select className={`${inputClass} mt-1`} disabled={!editable} value={status} onChange={(event) => setStatus(event.target.value as StepStatus)}>
            {(Object.keys(stepStatusLabel) as StepStatus[]).map((value) => <option key={value} value={value}>{stepStatusLabel[value]}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">Resultado obtido {(status === "failed" || status === "blocked") && <span className="text-rose-600">*</span>}
          <textarea className={`${inputClass} mt-1 min-h-11 resize-y`} disabled={!editable} value={actualResult} onChange={(event) => setActualResult(event.target.value)} placeholder="Observações, diferenças ou motivo do bloqueio" />
        </label>
        <button type="button" className={buttonPrimary} disabled={!editable} onClick={() => void save()}>Salvar</button>
      </div>
      {message && <p role="status" className={`mt-2 text-xs font-semibold ${message.includes("Informe") || message.includes("não pode") ? "text-rose-700" : "text-emerald-700"}`}>{message}</p>}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">Evidências ({evidence.length})</p>
            <p className="text-[11px] text-slate-400">Imagens compactadas, armazenadas fora do JSON principal e vinculadas por hash.</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void attach(event)} />
          <button type="button" className={buttonSecondary} disabled={!editable} onClick={() => fileRef.current?.click()}><Camera size={15} /> Anexar</button>
        </div>
        {evidence.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{evidence.map((meta) => <EvidencePreview key={meta.id} meta={meta} editable={editable} onRemove={() => { if (window.confirm(`Remover a evidência “${meta.name}”?`)) void removeEvidence(meta.id); }} />)}</div>}
      </div>
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
  const [selectedCaseId, setSelectedCaseId] = useState(run.snapshot.cases[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [pendingFinalStatus, setPendingFinalStatus] = useState<"completed" | "aborted" | null>(null);
  const selectedCase = run.snapshot.cases.find((item) => item.id === selectedCaseId) ?? run.snapshot.cases[0];
  const progress = runProgress(run);
  const counts = useMemo(() => run.snapshot.cases.reduce<Record<StepStatus, number>>((accumulator, testCase) => {
    const status = deriveCaseStatus(run, testCase);
    accumulator[status] += 1;
    return accumulator;
  }, { not_run: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 }), [run]);

  const transition = async (status: "in_progress" | "paused" | "completed" | "aborted") => {
    const result = await setRunStatus(run.id, status);
    setMessage(result.message);
    if (result.ok) setPendingFinalStatus(null);
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
        <div className="mt-4 flex flex-wrap gap-2">{(Object.keys(counts) as StepStatus[]).map((status) => <span key={status} className="text-xs text-slate-500"><strong className="text-slate-900">{counts[status]}</strong> {stepStatusLabel[status]}</span>)}</div>
      </header>

      {message && <div className="mt-4"><Notice tone={message.includes("Ainda") || message.includes("não") ? "warning" : "success"}>{message}</Notice></div>}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><Lock size={17} className="mt-0.5 shrink-0" /><span>Esta tentativa usa um snapshot. Alterações futuras na biblioteca ou no plano não mudam seus resultados.</span></div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[300px_1fr]">
        <aside className="xl:sticky xl:top-22 xl:self-start">
          <label className="mb-3 block text-xs font-black uppercase tracking-wide text-slate-500 xl:hidden">Caso atual<select className={`${inputClass} mt-1`} value={selectedCase?.id} onChange={(event) => setSelectedCaseId(event.target.value)}>{run.snapshot.cases.map((testCase, index) => <option key={testCase.id} value={testCase.id}>{index + 1}. {testCase.title}</option>)}</select></label>
          <div className="hidden max-h-[calc(100vh-8rem)] space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:block">
            {run.snapshot.cases.map((testCase, index) => {
              const status = deriveCaseStatus(run, testCase);
              return <button key={testCase.id} type="button" onClick={() => setSelectedCaseId(testCase.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedCase?.id === testCase.id ? "border-cyan-300 bg-cyan-50" : "border-transparent hover:bg-slate-50"}`}><div className="flex items-center gap-2"><span className="text-xs font-black text-slate-400">{index + 1}</span><StatusBadge value={status} label={stepStatusLabel[status]} /></div><p className="mt-2 text-sm font-bold text-slate-900">{testCase.title}</p><p className="mt-1 text-[11px] text-slate-500">{testCase.id} · {testCase.steps.length} passo(s)</p></button>;
            })}
          </div>
        </aside>

        <div>
          {selectedCase && (
            <section>
              <div className="mb-4">
                <div className="flex flex-wrap items-center gap-2"><StatusBadge value={deriveCaseStatus(run, selectedCase)} label={stepStatusLabel[deriveCaseStatus(run, selectedCase)]} /><span className="font-mono text-xs text-cyan-800">{selectedCase.id}</span><span className="text-xs text-slate-400">snapshot rev. {selectedCase.revision}</span></div>
                <h2 className="mt-2 text-xl font-black text-slate-950">{selectedCase.title}</h2>
                {selectedCase.precondition && <p className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600"><strong>Pré-condição:</strong> {selectedCase.precondition}</p>}
              </div>
              <div className="space-y-4">{selectedCase.steps.map((step) => <StepCard key={`${run.updatedAt}-${step.id}`} run={run} caseId={selectedCase.id} stepId={step.id} />)}</div>
            </section>
          )}
          <ExploratorySection run={run} />
        </div>
      </div>

      {pendingFinalStatus && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="finish-run-title">
          <div className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7">
            <h2 id="finish-run-title" className="text-xl font-black text-slate-950">{pendingFinalStatus === "completed" ? "Concluir tentativa?" : "Abortar tentativa?"}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{pendingFinalStatus === "completed" ? "Todos os resultados serão preservados e esta tentativa ficará bloqueada para edição." : "A tentativa será encerrada como abortada. O snapshot e os resultados já registrados continuarão no histórico."}</p>
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
