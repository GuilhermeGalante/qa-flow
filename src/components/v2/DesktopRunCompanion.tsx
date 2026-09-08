import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import {
  Bug,
  Camera,
  ChevronDown,
  CirclePause,
  CirclePlay,
  GalleryVerticalEnd,
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { ExploratoryRecord, StepStatus, TestRun } from "../../domain/types";
import { isRunEditable, resultKey } from "../../domain/validation";
import { useQaStore } from "../../store/useQaStore";
import { useToast } from "../../ui/ToastProvider";
import { Select, type SelectOption } from "../../ui/Select";
import {
  captureCurrentDisplay,
  captureSpecificWindow,
  listNativeCaptureTargets,
  startCurrentDisplayRecording,
  startSpecificWindowRecording,
  stopNativeRecording,
  type NativeCaptureTarget,
} from "../../platform/desktop/desktopCompanion";

const MAX_RECORDING_DURATION_MS = 60_000;

interface DesktopRunCompanionProps {
  run: TestRun;
  selectedCaseId: string;
  activeStepId: string;
  onSelectStep: (caseId: string, stepId: string) => void;
  onBlocked: (caseId: string, stepId: string) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onClose: () => void;
}

interface ScenarioTimer {
  elapsedMs: number;
  startedAt: number | null;
}

type WindowTargetMode = "screenshot" | "recording";

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function evidenceName(prefix: "captura" | "gravacao", stepId: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stepId}-${timestamp}.${extension}`;
}

/**
 * Renderizador de texto de passos:
 * Realça palavras-chave Gherkin (Dado, Quando, Então, E, Mas)
 * e estiliza códigos/rotas/tags entre crases ou iniciando com / como badges inline.
 */
function FormattedStepText({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-slate-700">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={lineIdx} className="h-2" />;

        const gherkinMatch = trimmed.match(/^(Dado|Quando|Então|Entao|E|Mas|Given|When|Then|And)\s+(.*)$/i);
        const prefix = gherkinMatch ? gherkinMatch[1] : null;
        const rest = gherkinMatch ? gherkinMatch[2] : trimmed;

        const tokens = rest.split(/(`[^`]+`|\/[\w-]+)/g);

        return (
          <p key={lineIdx} className="break-words">
            {prefix && <strong className="font-bold text-slate-900">{prefix} </strong>}
            {tokens.map((token, tokenIdx) => {
              if (token.startsWith("`") && token.endsWith("`")) {
                const inner = token.slice(1, -1);
                return (
                  <span
                    key={tokenIdx}
                    className="mx-0.5 inline-block rounded border border-slate-200/90 bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-800 shadow-2xs"
                  >
                    {inner}
                  </span>
                );
              }
              if (token.startsWith("/") && token.length > 1) {
                return (
                  <span
                    key={tokenIdx}
                    className="mx-0.5 inline-block rounded border border-slate-200/90 bg-white px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-800 shadow-2xs"
                  >
                    {token}
                  </span>
                );
              }
              return <span key={tokenIdx}>{token}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}

export function DesktopRunCompanion({
  run,
  selectedCaseId,
  activeStepId,
  onSelectStep,
  onBlocked,
  onCollapsedChange,
  onClose,
}: DesktopRunCompanionProps) {
  const addEvidence = useQaStore((state) => state.addEvidence);
  const removeEvidence = useQaStore((state) => state.removeEvidence);
  const updateStepResult = useQaStore((state) => state.updateStepResult);
  const addExploratoryRecord = useQaStore((state) => state.addExploratoryRecord);
  const allEvidence = useQaStore((state) => state.evidence);
  const toast = useToast();

  const [collapsed, setCollapsed] = useState(false);
  const [timers, setTimers] = useState<Record<string, ScenarioTimer>>({});
  const [now, setNow] = useState(() => Date.now());

  // Captura & Gravação
  const [capturing, setCapturing] = useState(false);
  const [captureTargets, setCaptureTargets] = useState<NativeCaptureTarget[]>([]);
  const [selectedCaptureTarget, setSelectedCaptureTarget] = useState("");
  const [windowTargetMode, setWindowTargetMode] = useState<WindowTargetMode | null>(null);
  const [loadingCaptureTargets, setLoadingCaptureTargets] = useState(false);
  const [showCaptureMenu, setShowCaptureMenu] = useState(false);

  const [recording, setRecording] = useState(false);
  const [finalizingRecording, setFinalizingRecording] = useState(false);
  const [recordingSource, setRecordingSource] = useState("");
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  // Defeito rápido & Feedback do passo
  const [showDefectModal, setShowDefectModal] = useState(false);
  const [defectTitle, setDefectTitle] = useState("");
  const [defectSeverity, setDefectSeverity] = useState<ExploratoryRecord["severity"]>("high");
  const [defectNotes, setDefectNotes] = useState("");
  const [savingDefect, setSavingDefect] = useState(false);

  // Detalhe/motivo de Falha ou Bloqueio
  const [showResultReason, setShowResultReason] = useState(false);
  const [resultReasonText, setResultReasonText] = useState("");
  const [savingResult, setSavingResult] = useState(false);

  // Anexar arquivo
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const recordingOwnerRef = useRef<{ ownerId: string; stepId: string } | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const stoppingRecordingRef = useRef(false);

  const editable = isRunEditable(run) && run.status !== "paused";

  // Flattened steps across all cases in snapshot
  const steps = useMemo(() => {
    return run.snapshot.cases.flatMap((testCase) =>
      testCase.steps.map((step, index) => ({
        caseId: testCase.id,
        caseTitle: testCase.title,
        casePath: testCase.path || [],
        caseTags: testCase.tags || [],
        externalReferences: testCase.externalReferences || [],
        stepId: step.id,
        stepNumber: index + 1,
        stepCount: testCase.steps.length,
        action: step.action,
        expectedResult: step.expectedResult,
      }))
    );
  }, [run.snapshot.cases]);

  const activeIndex = Math.max(
    0,
    steps.findIndex((item) => item.caseId === selectedCaseId && item.stepId === activeStepId)
  );
  const current = steps[activeIndex] || steps[0];

  const currentResultKey = current ? resultKey(current.caseId, current.stepId) : "";
  const storedResult = current ? run.results[currentResultKey] : undefined;
  const currentStatus: StepStatus = storedResult?.status ?? "not_run";

  // Evidências vinculadas ao passo atual
  const currentEvidences = useMemo(() => {
    if (!storedResult?.evidenceIds?.length) return [];
    return allEvidence.filter((item) => storedResult.evidenceIds.includes(item.id));
  }, [allEvidence, storedResult?.evidenceIds]);

  // Cronômetro do cenário
  const timer = current ? timers[current.caseId] ?? { elapsedMs: 0, startedAt: null } : { elapsedMs: 0, startedAt: null };
  const elapsedMs = timer.elapsedMs + (timer.startedAt === null ? 0 : now - timer.startedAt);

  // Opções de janelas para captura
  const captureTargetOptions = useMemo<SelectOption[]>(
    () => captureTargets.map((target) => ({ value: target.id, label: target.title })),
    [captureTargets]
  );

  useEffect(() => {
    const running = Object.values(timers).some((item) => item.startedAt !== null);
    if (!running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [timers]);

  useEffect(() => {
    const currentCaseId = current?.caseId;
    if (!currentCaseId) return;
    const timestamp = Date.now();
    setTimers((previous) => {
      let changed = false;
      const next = Object.fromEntries(
        Object.entries(previous).map(([caseId, value]) => {
          if (caseId === currentCaseId || value.startedAt === null) return [caseId, value];
          changed = true;
          return [caseId, { elapsedMs: value.elapsedMs + timestamp - value.startedAt, startedAt: null }];
        })
      );
      return changed ? next : previous;
    });
  }, [current?.caseId]);

  useEffect(() => {
    if (run.status === "in_progress") return;
    const timestamp = Date.now();
    setTimers((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([caseId, value]) => [
          caseId,
          value.startedAt === null ? value : { elapsedMs: value.elapsedMs + timestamp - value.startedAt, startedAt: null },
        ])
      )
    );
  }, [run.status]);

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
      if (recordingIntervalRef.current !== null) window.clearInterval(recordingIntervalRef.current);
      if (recordingOwnerRef.current) void stopNativeRecording().catch(() => undefined);
    };
  }, []);

  // Formatação do identificador do caso (ex: CT-042)
  const caseDisplayCode = useMemo(() => {
    if (!current) return "";
    const raw = current.caseId;
    if (/^CT-\d+/i.test(raw)) return raw.toUpperCase();
    if (/^case-\d+/i.test(raw)) {
      const num = raw.replace(/^case-/i, "");
      return `CT-${num.padStart(3, "0")}`;
    }
    return raw;
  }, [current]);

  // Tag do requisito (ex: REQ-NOTIF-08)
  const requirementTag = useMemo(() => {
    if (!current) return null;
    const reqRef = current.externalReferences?.find(
      (ref) => ref.value && (ref.value.startsWith("REQ-") || ref.system?.toLowerCase().includes("req"))
    );
    if (reqRef) return reqRef.value;
    const anyRef = current.externalReferences?.[0]?.value;
    if (anyRef) return anyRef;
    const tagMatch = current.caseTags.find((t) => /^REQ-|^RF-|^RNF-/i.test(t));
    return tagMatch || null;
  }, [current]);

  if (!current) return null;

  const toggleTimer = () => {
    const timestamp = Date.now();
    setNow(timestamp);
    setTimers((previous) => {
      const value = previous[current.caseId] ?? { elapsedMs: 0, startedAt: null };
      return {
        ...previous,
        [current.caseId]:
          value.startedAt === null
            ? { ...value, startedAt: timestamp }
            : { elapsedMs: value.elapsedMs + timestamp - value.startedAt, startedAt: null },
      };
    });
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    onCollapsedChange(next);
  };

  const selectStep = (offset: number) => {
    const next = steps[activeIndex + offset];
    if (next) {
      onSelectStep(next.caseId, next.stepId);
      setShowResultReason(false);
      setShowCaptureMenu(false);
    }
  };

  // Atualiza o status do passo
  const handleSetStatus = async (newStatus: StepStatus) => {
    if (!editable) return;
    setSavingResult(true);
    const result = await updateStepResult(
      run.id,
      current.caseId,
      current.stepId,
      newStatus,
      storedResult?.actualResult || ""
    );
    setSavingResult(false);
    toast.fromResult(result);

    if (newStatus === "failed" || newStatus === "blocked") {
      setResultReasonText(storedResult?.actualResult || "");
      setShowResultReason(true);
      if (newStatus === "blocked") {
        onBlocked(current.caseId, current.stepId);
      }
    } else {
      setShowResultReason(false);
    }
  };

  const handleSaveResultReason = async () => {
    setSavingResult(true);
    const result = await updateStepResult(
      run.id,
      current.caseId,
      current.stepId,
      currentStatus,
      resultReasonText.trim()
    );
    setSavingResult(false);
    toast.fromResult(result, { successDescription: "Observação registrada no passo." });
    if (result.ok) setShowResultReason(false);
  };

  // Screenshot da tela atual
  const takeScreenshot = async () => {
    setCapturing(true);
    setShowCaptureMenu(false);
    try {
      const capture = await captureCurrentDisplay();
      const blob = new Blob([Uint8Array.from(capture.bytes)], { type: capture.mimeType });
      const result = await addEvidence(
        run.id,
        "step",
        currentResultKey,
        blob,
        evidenceName("captura", current.stepId, "png")
      );
      toast.fromResult(result, { successDescription: "Captura vinculada ao passo atual." });
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : "Não foi possível capturar a tela.",
        description: "Mova o assistente para o monitor desejado e tente novamente.",
      });
    } finally {
      setCapturing(false);
    }
  };

  // Janelas para captura ou gravação
  const openWindowTarget = async (mode: WindowTargetMode) => {
    setShowCaptureMenu(false);
    setWindowTargetMode(mode);
    setLoadingCaptureTargets(true);
    try {
      const targets = await listNativeCaptureTargets();
      setCaptureTargets(targets);
      setSelectedCaptureTarget((currentTarget) => currentTarget || targets[0]?.id || "");
      if (!targets.length) {
        toast.show({ tone: "warning", message: "Nenhuma janela disponível para captura." });
      }
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : "Não foi possível listar as janelas abertas.",
      });
    } finally {
      setLoadingCaptureTargets(false);
    }
  };

  const takeWindowScreenshot = async () => {
    if (!selectedCaptureTarget) return;
    setCapturing(true);
    try {
      const capture = await captureSpecificWindow(selectedCaptureTarget);
      const blob = new Blob([Uint8Array.from(capture.bytes)], { type: capture.mimeType });
      const result = await addEvidence(
        run.id,
        "step",
        currentResultKey,
        blob,
        evidenceName("captura", current.stepId, "png")
      );
      toast.fromResult(result, { successDescription: "Janela capturada e vinculada ao passo atual." });
      if (result.ok) setWindowTargetMode(null);
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : "Não foi possível capturar a janela.",
      });
    } finally {
      setCapturing(false);
    }
  };

  const startRecording = async (targetId?: string) => {
    setShowCaptureMenu(false);
    try {
      if (targetId) await startSpecificWindowRecording(targetId);
      else await startCurrentDisplayRecording();

      recordingOwnerRef.current = {
        ownerId: currentResultKey,
        stepId: current.stepId,
      };
      const targetTitle = targetId
        ? captureTargets.find((target) => target.id === targetId)?.title ?? "Janela selecionada"
        : "Monitor atual";

      setRecordingSource(targetTitle);
      setRecording(true);
      setRecordingElapsed(0);
      setWindowTargetMode(null);

      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingElapsed((prev) => prev + 1);
      }, 1000);

      recordingTimeoutRef.current = window.setTimeout(() => {
        void stopRecording(true);
      }, MAX_RECORDING_DURATION_MS);
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : "Não foi possível iniciar a gravação.",
      });
    }
  };

  const stopRecording = async (reachedLimit = false) => {
    const owner = recordingOwnerRef.current;
    if (stoppingRecordingRef.current || !owner) return;
    stoppingRecordingRef.current = true;
    setFinalizingRecording(true);

    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (recordingIntervalRef.current !== null) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    try {
      const capture = await stopNativeRecording();
      const blob = new Blob([Uint8Array.from(capture.bytes)], { type: capture.mimeType });
      const result = await addEvidence(
        run.id,
        "step",
        owner.ownerId,
        blob,
        evidenceName("gravacao", owner.stepId, "mp4")
      );
      toast.fromResult(result, {
        successDescription: reachedLimit
          ? "Vídeo de 60s vinculado ao passo onde a gravação iniciou."
          : "Vídeo salvo e vinculado ao passo.",
      });
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : "Não foi possível finalizar a gravação.",
      });
    } finally {
      recordingOwnerRef.current = null;
      stoppingRecordingRef.current = false;
      setRecording(false);
      setFinalizingRecording(false);
      setRecordingSource("");
      setRecordingElapsed(0);
    }
  };

  // Upload manual de arquivo
  const handleAttachFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1] || "png";
    const name = file.name || evidenceName("captura", current.stepId, extension);
    const result = await addEvidence(run.id, "step", currentResultKey, file, name);
    toast.fromResult(result, { successDescription: "Arquivo vinculado como evidência." });
    event.target.value = "";
  };

  // Colar imagem via Ctrl+V
  const handlePaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    if (!editable) return;
    const items = event.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          const result = await addEvidence(
            run.id,
            "step",
            currentResultKey,
            file,
            evidenceName("captura", current.stepId, "png")
          );
          toast.fromResult(result, { successDescription: "Imagem colada e vinculada ao passo." });
          return;
        }
      }
    }
  };

  // Criar defeito rápido
  const handleOpenDefect = () => {
    setDefectTitle(`[${caseDisplayCode}] Falha no passo ${current.stepNumber}`);
    setDefectNotes(`Cenário: ${current.caseTitle}\nAção: ${current.action}\nResultado esperado: ${current.expectedResult}\n\nObservação:\n`);
    setDefectSeverity("high");
    setShowDefectModal(true);
  };

  const handleSaveDefect = async () => {
    if (!defectTitle.trim()) {
      toast.show({ tone: "warning", message: "Informe um título para o defeito." });
      return;
    }
    setSavingDefect(true);
    const result = await addExploratoryRecord(run.id, {
      title: defectTitle.trim(),
      notes: defectNotes.trim(),
      classification: "bug",
      severity: defectSeverity,
    });
    setSavingDefect(false);
    toast.fromResult(result, { successDescription: "Defeito registrado na execução." });
    if (result.ok) {
      setShowDefectModal(false);
      setDefectTitle("");
      setDefectNotes("");
    }
  };

  // Remover evidência
  const handleRemoveEvidence = async (evidenceId: string) => {
    const result = await removeEvidence(evidenceId);
    toast.fromResult(result, { successDescription: "Evidência removida." });
  };

  // --------------------------------------------------------------------------
  // MODO COMPACTO / RECOLHIDO
  // --------------------------------------------------------------------------
  if (collapsed) {
    return (
      <aside
        data-tauri-drag-region="deep"
        aria-label="Assistente compacto de execução"
        className="flex h-16 w-full cursor-move select-none items-center justify-between border-b border-slate-200/80 bg-white px-3 shadow-md antialiased"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 font-bold text-slate-900 text-xs">
            <img src="/qa-flow-logo.png" alt="" className="h-5 w-5 rounded-md border border-slate-200 bg-white object-cover" />
            <span>QA Flow</span>
            <span className="text-slate-300 font-light">/</span>
            <span className="font-mono text-slate-600">{caseDisplayCode}</span>
            <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-xs font-mono font-bold text-slate-800 cursor-pointer"
            onClick={toggleTimer}
            role="button"
            title="Clique para pausar/retomar"
          >
            <span className="text-[10px] font-sans font-medium text-slate-400">Tempo</span>
            <span>{formatDuration(elapsedMs)}</span>
            {timer.startedAt === null ? <CirclePlay size={12} className="text-slate-400" /> : <CirclePause size={12} className="text-emerald-600" />}
          </div>

          <span className="text-[11px] font-medium text-slate-500">
            {current.stepNumber}/{current.stepCount}
          </span>

          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700 transition cursor-pointer"
            disabled={!editable}
            onClick={() => void handleSetStatus("passed")}
          >
            Passou
          </button>

          <button
            type="button"
            aria-label="Expandir assistente"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            onClick={toggleCollapsed}
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </aside>
    );
  }

  // --------------------------------------------------------------------------
  // MODO PADRÃO COMPLETO (Design Fiel ao Mockup)
  // --------------------------------------------------------------------------
  const targetScreenText = [current.casePath.join(" / ") || "Navbar / Dashboard", ...current.caseTags].filter(Boolean).join(" · ");

  return (
    <aside
      ref={containerRef}
      onPaste={handlePaste}
      tabIndex={0}
      aria-label="Assistente flutuante de execução"
      className="flex min-h-screen w-full flex-col justify-between overflow-hidden bg-white text-slate-800 antialiased select-none outline-none font-sans"
    >
      {/* INPUT OCULTO DE ARQUIVOS */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleAttachFile(e)}
      />

      {/* HEADER BAR (DRAG REGION) */}
      <header
        data-tauri-drag-region="deep"
        className="flex cursor-move items-center justify-between px-5 pt-3.5 pb-2"
      >
        <div className="flex items-center gap-1.5 text-sm">
          <img src="/qa-flow-logo.png" alt="" className="h-6 w-6 rounded-md border border-slate-200 bg-white object-cover" />
          <span className="font-bold tracking-tight text-slate-900">QA Flow</span>
          <span className="font-light text-slate-300">/</span>
          <span className="font-mono text-xs font-semibold text-slate-500">{caseDisplayCode}</span>
          <span
            className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
            title="Assistente ativo"
          />
        </div>

        {/* CONTROLES DE JANELA */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Modo compacto"
            title="Modo compacto"
            onClick={toggleCollapsed}
            className="cursor-pointer rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Minimize2 size={14} />
          </button>
          <button
            type="button"
            aria-label="Minimizar"
            title="Minimizar"
            onClick={toggleCollapsed}
            className="cursor-pointer rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            aria-label="Fechar assistente"
            title={recording || finalizingRecording ? "Encerre a gravação antes de fechar" : "Fechar"}
            disabled={recording || finalizingRecording}
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600 disabled:opacity-30"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL SCROLLÁVEL */}
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4">
        {/* TÍTULO & TEMPO */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="flex-1 text-base sm:text-[17px] font-bold leading-snug tracking-tight text-slate-900">
              {current.caseTitle}
            </h1>

            {/* BADGE DE TEMPO */}
            <button
              type="button"
              onClick={toggleTimer}
              disabled={!editable}
              title={timer.startedAt === null ? "Clique para iniciar cronômetro" : "Clique para pausar cronômetro"}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50/90 px-2.5 py-1 shadow-2xs transition hover:bg-slate-100/90 disabled:opacity-60 cursor-pointer"
            >
              <span className="text-[11px] font-medium text-slate-400">Tempo</span>
              <span className="font-mono text-xs font-bold tabular-nums text-slate-800">
                {formatDuration(elapsedMs)}
              </span>
              {timer.startedAt === null ? (
                <CirclePlay size={12} className="text-slate-400" />
              ) : (
                <CirclePause size={12} className="text-emerald-600" />
              )}
            </button>
          </div>

          {/* METADADOS / TELA ALVO */}
          <p className="mt-1 text-xs text-slate-400">
            Tela alvo: {targetScreenText}
          </p>
        </div>

        {/* PROGRESSO DO TESTE */}
        <div>
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-400">Progresso do teste</span>
            <span className="text-slate-700">
              Passo {current.stepNumber} de {current.stepCount}
            </span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-300"
              style={{ width: `${(current.stepNumber / current.stepCount) * 100}%` }}
            />
          </div>
        </div>

        {/* CARTÃO 1: AÇÃO */}
        <section
          aria-label="Ação do passo"
          className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 shadow-2xs transition hover:border-slate-300/80"
        >
          <div className="mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {String(current.stepNumber).padStart(2, "0")} · AÇÃO
            </span>
          </div>
          <FormattedStepText text={current.action} />
        </section>

        {/* CARTÃO 2: RESULTADO ESPERADO */}
        <section
          aria-label="Resultado esperado do passo"
          className="rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 shadow-2xs transition hover:border-slate-300/80"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {String(current.stepNumber + 1).padStart(2, "0")} · RESULTADO ESPERADO
            </span>
            {requirementTag && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {requirementTag}
              </span>
            )}
          </div>
          <FormattedStepText text={current.expectedResult} />
        </section>

        {/* LINHA DE EVIDÊNCIAS E AÇÕES DE CAPTURA */}
        <div className="flex items-center justify-between pt-1">
          {/* LADO ESQUERDO: LISTAGEM DE EVIDÊNCIA */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {currentEvidences.length > 0 ? (
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span
                  className="truncate font-mono text-[11px] font-medium text-slate-600 hover:text-slate-900"
                  title={currentEvidences[currentEvidences.length - 1].name}
                >
                  {currentEvidences[currentEvidences.length - 1].name}
                </span>
                {currentEvidences.length > 1 && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                    +{currentEvidences.length - 1}
                  </span>
                )}
                <button
                  type="button"
                  title="Remover evidência"
                  onClick={() => void handleRemoveEvidence(currentEvidences[currentEvidences.length - 1].id)}
                  className="text-slate-300 hover:text-rose-500 transition p-0.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <span className="text-[11px] font-normal text-slate-400">Nenhuma evidência</span>
              </div>
            )}
          </div>

          {/* LADO DIREITO: BOTÕES CAPTURAR E ANEXAR */}
          <div className="relative flex shrink-0 items-center gap-2">
            {/* CAPTURAR */}
            <div className="relative inline-flex items-center">
              <button
                type="button"
                disabled={!editable || capturing || recording || finalizingRecording}
                onClick={() => void takeScreenshot()}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
              >
                <Camera size={14} className="text-slate-500" />
                <span>{capturing ? "Capturando…" : "Capturar"}</span>
              </button>

              {/* MENU DE OPÇÕES AVANÇADAS DE CAPTURA */}
              <button
                type="button"
                aria-label="Opções de captura e gravação"
                onClick={() => setShowCaptureMenu(!showCaptureMenu)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
              >
                <ChevronDown size={12} />
              </button>

              {showCaptureMenu && (
                <div className="absolute right-0 bottom-full mb-1 z-30 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg text-xs">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-100 cursor-pointer"
                    onClick={() => void takeScreenshot()}
                  >
                    <Camera size={14} /> Capturar tela inteira
                  </button>
                  <button
                    type="button"
                    disabled={loadingCaptureTargets}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                    onClick={() => void openWindowTarget("screenshot")}
                  >
                    <GalleryVerticalEnd size={14} /> {loadingCaptureTargets ? "Listando janelas…" : "Capturar janela…"}
                  </button>
                  <hr className="my-1 border-slate-100" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-100 cursor-pointer"
                    onClick={() => void startRecording()}
                  >
                    <Video size={14} /> Gravar vídeo da tela (60s)
                  </button>
                  <button
                    type="button"
                    disabled={loadingCaptureTargets}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                    onClick={() => void openWindowTarget("recording")}
                  >
                    <Video size={14} /> {loadingCaptureTargets ? "Listando janelas…" : "Gravar janela…"}
                  </button>
                </div>
              )}
            </div>

            {/* ANEXAR */}
            <button
              type="button"
              disabled={!editable}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 cursor-pointer"
            >
              <Paperclip size={14} className="text-slate-500" />
              <span>Anexar</span>
            </button>
          </div>
        </div>

        {/* GRAVAÇÃO EM ANDAMENTO (QUANDO ATIVA) */}
        {recording && (
          <div className="flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200/80 px-3 py-2 text-xs text-rose-700">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-ping rounded-full bg-rose-600" />
              <span className="font-semibold">Gravando: {recordingSource}</span>
              <span className="font-mono text-rose-900">({recordingElapsed}s)</span>
            </div>
            <button
              type="button"
              onClick={() => void stopRecording()}
              disabled={finalizingRecording}
              className="rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700 transition cursor-pointer"
            >
              {finalizingRecording ? "Salvando…" : "Parar"}
            </button>
          </div>
        )}

        {/* SELETOR DE JANELA (QUANDO ABERTO) */}
        {windowTargetMode && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <label className="font-semibold text-slate-700" htmlFor="capture-window-select">
              {windowTargetMode === "recording" ? "Selecione a janela para gravação:" : "Selecione a janela para captura:"}
            </label>
            <Select
              id="capture-window-select"
              className="mt-1"
              ariaLabel="Janela alvo"
              value={selectedCaptureTarget}
              onChange={setSelectedCaptureTarget}
              options={captureTargetOptions}
              searchable={captureTargetOptions.length > 8}
              searchPlaceholder="Buscar janela…"
              placeholder="Selecione uma janela"
              emptyLabel="Nenhuma janela encontrada."
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                onClick={() => setWindowTargetMode(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-slate-900 py-1.5 font-medium text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                disabled={!selectedCaptureTarget || capturing || recording || finalizingRecording}
                onClick={() => {
                  if (windowTargetMode === "recording") void startRecording(selectedCaptureTarget);
                  else void takeWindowScreenshot();
                }}
              >
                {windowTargetMode === "recording" ? "Gravar janela" : capturing ? "Capturando…" : "Capturar janela"}
              </button>
            </div>
          </div>
        )}

        {/* MOTIVO DE FALHA OU BLOQUEIO (DRAWER INLINE) */}
        {showResultReason && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-slate-800">
                {currentStatus === "blocked" ? "Motivo do bloqueio:" : "Resultado observado / falha:"}
              </span>
              <button
                type="button"
                onClick={() => setShowResultReason(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
            <textarea
              className="w-full min-h-18 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none focus:border-slate-400"
              placeholder={currentStatus === "blocked" ? "Descreva o impedimento..." : "Descreva a discrepância observada..."}
              value={resultReasonText}
              onChange={(e) => setResultReasonText(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                onClick={() => setShowResultReason(false)}
              >
                Fechar
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-1 font-medium text-white hover:bg-slate-800 cursor-pointer"
                disabled={savingResult}
                onClick={() => void handleSaveResultReason()}
              >
                {savingResult ? "Salvando…" : "Salvar observação"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER: BOTÕES DE STATUS E NAVEGAÇÃO */}
      <footer className="shrink-0 border-t border-slate-100 bg-white px-5 pt-3 pb-4 space-y-3">
        {/* BOTÕES DE STATUS DO PASSO (Passou, Falhou, Bloqueado, Pular) */}
        <div className="grid grid-cols-4 gap-2.5">
          {/* PASSOU */}
          <button
            type="button"
            disabled={!editable || savingResult}
            onClick={() => void handleSetStatus("passed")}
            className={`flex items-center justify-center rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold transition shadow-2xs cursor-pointer ${
              currentStatus === "passed"
                ? "bg-[#059669] text-white hover:bg-[#047857]"
                : "border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40 hover:text-emerald-700"
            }`}
          >
            Passou
          </button>

          {/* FALHOU */}
          <button
            type="button"
            disabled={!editable || savingResult}
            onClick={() => void handleSetStatus("failed")}
            className={`flex items-center justify-center rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold transition shadow-2xs cursor-pointer ${
              currentStatus === "failed"
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "border border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50/40 hover:text-rose-700"
            }`}
          >
            Falhou
          </button>

          {/* BLOQUEADO */}
          <button
            type="button"
            disabled={!editable || savingResult}
            onClick={() => void handleSetStatus("blocked")}
            className={`flex items-center justify-center rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold transition shadow-2xs cursor-pointer ${
              currentStatus === "blocked"
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "border border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/40 hover:text-amber-700"
            }`}
          >
            Bloqueado
          </button>

          {/* PULAR */}
          <button
            type="button"
            disabled={!editable || savingResult}
            onClick={() => void handleSetStatus("skipped")}
            className={`flex items-center justify-center rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold transition shadow-2xs cursor-pointer ${
              currentStatus === "skipped"
                ? "bg-slate-600 text-white hover:bg-slate-700"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            Pular
          </button>
        </div>

        {/* LINHA INFERIOR: ANTERIOR / CRIAR DEFEITO / PRÓXIMO */}
        <div className="flex items-center justify-between text-xs sm:text-sm">
          {/* ANTERIOR */}
          <button
            type="button"
            disabled={activeIndex === 0 || recording}
            onClick={() => selectStep(-1)}
            className="font-medium text-slate-400 transition hover:text-slate-800 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
          >
            Anterior
          </button>

          {/* CRIAR DEFEITO */}
          <button
            type="button"
            disabled={!editable}
            onClick={handleOpenDefect}
            className="font-medium text-slate-500 transition hover:text-rose-600 hover:underline cursor-pointer disabled:opacity-40"
          >
            Criar defeito
          </button>

          {/* PRÓXIMO */}
          <button
            type="button"
            disabled={activeIndex >= steps.length - 1 || recording}
            onClick={() => selectStep(1)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 font-medium text-slate-800 shadow-2xs transition hover:bg-slate-50 hover:border-slate-300 disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
          >
            Próximo
          </button>
        </div>
      </footer>

      {/* MODAL DE CRIAÇÃO RÁPIDA DE DEFEITO */}
      {showDefectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowDefectModal(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <Bug size={16} className="text-rose-600" />
                <span>Registrar Defeito</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDefectModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1" htmlFor="defect-title">
                  Título do defeito
                </label>
                <input
                  id="defect-title"
                  type="text"
                  value={defectTitle}
                  onChange={(e) => setDefectTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-slate-800 outline-none focus:border-rose-400"
                  placeholder="Ex: Contador não zera ao clicar no sino"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Severidade
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["low", "medium", "high", "critical"] as const).map((sev) => {
                    const labels = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" };
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setDefectSeverity(sev)}
                        className={`rounded-lg py-1 text-center font-medium border transition cursor-pointer ${
                          defectSeverity === sev
                            ? "bg-rose-50 border-rose-300 text-rose-700 font-bold"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {labels[sev]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1" htmlFor="defect-notes">
                  Descrição / Detalhes
                </label>
                <textarea
                  id="defect-notes"
                  value={defectNotes}
                  onChange={(e) => setDefectNotes(e.target.value)}
                  className="w-full min-h-24 resize-y rounded-lg border border-slate-200 bg-white p-2 text-slate-800 outline-none focus:border-rose-400 font-sans"
                  placeholder="Descreva o comportamento inesperado..."
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowDefectModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingDefect || !defectTitle.trim()}
                onClick={() => void handleSaveDefect()}
                className="rounded-xl bg-rose-600 px-3.5 py-1.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-40 cursor-pointer"
              >
                {savingDefect ? "Salvando…" : "Criar defeito"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
