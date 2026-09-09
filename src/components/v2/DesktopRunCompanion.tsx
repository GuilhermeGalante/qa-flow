import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import {
  Bug,
  Camera,
  ChevronDown,
  CirclePause,
  CirclePlay,
  GalleryVerticalEnd,
  Maximize2,
  MessageSquareText,
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
import { tr } from "../../i18n";

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
    <div className="space-y-1.5 text-[13px] leading-relaxed text-control">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={lineIdx} className="h-2" />;

        const gherkinMatch = trimmed.match(/^(Dado|Quando|Então|Entao|E|Mas|Given|When|Then|And)\s+(.*)$/i);
        const prefix = gherkinMatch ? gherkinMatch[1] : null;
        const rest = gherkinMatch ? gherkinMatch[2] : trimmed;

        const tokens = rest.split(/(`[^`]+`|\/[\w-]+)/g);

        return (
          <p key={lineIdx} className="break-words">
            {prefix && <strong className="font-bold text-body">{prefix} </strong>}
            {tokens.map((token, tokenIdx) => {
              if (token.startsWith("`") && token.endsWith("`")) {
                const inner = token.slice(1, -1);
                return (
                  <span
                    key={tokenIdx}
                    className="mx-0.5 inline-block rounded border border-hairline bg-raised px-1.5 py-0.5 font-mono text-[11px] font-medium text-control shadow-2xs"
                  >
                    {inner}
                  </span>
                );
              }
              if (token.startsWith("/") && token.length > 1) {
                return (
                  <span
                    key={tokenIdx}
                    className="mx-0.5 inline-block rounded border border-hairline bg-raised px-1.5 py-0.5 font-mono text-[11px] font-medium text-control shadow-2xs"
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
  const resultCommentRef = useRef<HTMLTextAreaElement>(null);
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
    () => captureTargets.map((target) => ({ value: target.id, label: target.title, localizeLabel: false })),
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

  useEffect(() => {
    if (!showResultReason) return;
    const frame = window.requestAnimationFrame(() => {
      resultCommentRef.current?.scrollIntoView({ block: "nearest" });
      resultCommentRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showResultReason]);

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

  const handleOpenResultComment = () => {
    setResultReasonText(storedResult?.actualResult || "");
    setShowResultReason(true);
    if (collapsed) {
      setCollapsed(false);
      onCollapsedChange(false);
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
    toast.fromResult(result, { successDescription: tr("Observação registrada no passo.") });
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
      toast.fromResult(result, { successDescription: tr("Captura vinculada ao passo atual.") });
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : tr("Não foi possível capturar a tela."),
        description: tr("Mova o assistente para o monitor desejado e tente novamente."),
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
        toast.show({ tone: "warning", message: tr("Nenhuma janela disponível para captura.") });
      }
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : tr("Não foi possível listar as janelas abertas."),
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
      toast.fromResult(result, { successDescription: tr("Janela capturada e vinculada ao passo atual.") });
      if (result.ok) setWindowTargetMode(null);
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : tr("Não foi possível capturar a janela."),
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
        ? captureTargets.find((target) => target.id === targetId)?.title ?? tr("Janela selecionada")
        : tr("Monitor atual");

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
        message: value instanceof Error ? value.message : tr("Não foi possível iniciar a gravação."),
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
          ? tr("Vídeo de 60s vinculado ao passo onde a gravação iniciou.")
          : tr("Vídeo salvo e vinculado ao passo."),
      });
    } catch (value) {
      toast.show({
        tone: "error",
        message: value instanceof Error ? value.message : tr("Não foi possível finalizar a gravação."),
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
    toast.fromResult(result, { successDescription: tr("Arquivo vinculado como evidência.") });
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
          toast.fromResult(result, { successDescription: tr("Imagem colada e vinculada ao passo.") });
          return;
        }
      }
    }
  };

  // Criar defeito rápido
  const handleOpenDefect = () => {
    setDefectTitle(`[${caseDisplayCode}] ${tr(`Falha no passo ${current.stepNumber}`)}`);
    setDefectNotes(`${tr("Cenário")}: ${current.caseTitle}\n${tr("Ação")}: ${current.action}\n${tr("Resultado esperado")}: ${current.expectedResult}\n\n${tr("Observação")}:\n`);
    setDefectSeverity("high");
    setShowDefectModal(true);
  };

  const handleSaveDefect = async () => {
    if (!defectTitle.trim()) {
      toast.show({ tone: "warning", message: tr("Informe um título para o defeito.") });
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
    toast.fromResult(result, { successDescription: tr("Defeito registrado na execução.") });
    if (result.ok) {
      setShowDefectModal(false);
      setDefectTitle("");
      setDefectNotes("");
    }
  };

  // Remover evidência
  const handleRemoveEvidence = async (evidenceId: string) => {
    const result = await removeEvidence(evidenceId);
    toast.fromResult(result, { successDescription: tr("Evidência removida.") });
  };

  // --------------------------------------------------------------------------
  // MODO COMPACTO / RECOLHIDO
  // --------------------------------------------------------------------------
  if (collapsed) {
    return (
      <aside
        data-tauri-drag-region="deep"
        aria-label={tr("Assistente compacto de execução")}
        className="flex h-16 w-full cursor-move select-none items-center justify-between border-b border-hairline bg-raised px-3 shadow-md antialiased"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 font-bold text-body text-xs">
            <img src="/qa-flow-logo.png" alt="" className="h-5 w-5 rounded-md border border-hairline bg-raised object-cover" />
            <span>QA Flow</span>
            <span className="text-muted font-light">/</span>
            <span className="font-mono text-subtle">{caseDisplayCode}</span>
            <span className="ml-1 inline-block h-2 w-2 rounded-full bg-pass-mark shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2 py-0.5 text-xs font-mono font-bold text-control cursor-pointer"
            onClick={toggleTimer}
            role="button"
            title={tr("Clique para pausar/retomar")}
          >
            <span className="text-[10px] font-sans font-medium text-muted">{tr("Tempo")}</span>
            <span>{formatDuration(elapsedMs)}</span>
            {timer.startedAt === null ? <CirclePlay size={12} className="text-muted" /> : <CirclePause size={12} className="text-pass" />}
          </div>

          <span className="text-[11px] font-medium text-muted">
            {current.stepNumber}/{current.stepCount}
          </span>

          <button
            type="button"
            className="rounded-lg bg-solid-pass px-2.5 py-1 text-xs font-semibold text-white shadow-2xs hover:bg-pass transition cursor-pointer"
            disabled={!editable}
            onClick={() => void handleSetStatus("passed")}
          >
            {tr("Passou")}
          </button>

          <button
            type="button"
            aria-label={storedResult?.actualResult ? tr("Editar comentário do passo") : tr("Adicionar comentário ao passo")}
            title={storedResult?.actualResult ? tr("Editar comentário") : tr("Adicionar comentário")}
            className="rounded-lg p-1.5 text-muted transition hover:bg-shell hover:text-control disabled:opacity-40 cursor-pointer"
            disabled={!editable}
            onClick={handleOpenResultComment}
          >
            <MessageSquareText size={15} />
          </button>

          <button
            type="button"
            aria-label={tr("Expandir assistente")}
            className="rounded-lg p-1.5 text-muted hover:bg-shell hover:text-control transition cursor-pointer"
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
      aria-label={tr("Assistente flutuante de execução")}
      className="flex min-h-screen w-full flex-col justify-between overflow-hidden bg-raised text-control antialiased select-none outline-none font-sans"
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
          <img src="/qa-flow-logo.png" alt="" className="h-6 w-6 rounded-md border border-hairline bg-raised object-cover" />
          <span className="font-bold tracking-tight text-body">QA Flow</span>
          <span className="font-light text-muted">/</span>
          <span className="font-mono text-xs font-semibold text-muted">{caseDisplayCode}</span>
          <span
            className="ml-1 inline-block h-2 w-2 rounded-full bg-pass-mark shadow-[0_0_8px_rgba(16,185,129,0.7)]"
            title={tr("Assistente ativo")}
          />
        </div>

        {/* CONTROLES DE JANELA */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={tr("Modo compacto")}
            title={tr("Modo compacto")}
            onClick={toggleCollapsed}
            className="cursor-pointer rounded-md p-1 text-muted transition hover:bg-shell hover:text-control"
          >
            <Minimize2 size={14} />
          </button>
          <button
            type="button"
            aria-label={tr("Minimizar")}
            title={tr("Minimizar")}
            onClick={toggleCollapsed}
            className="cursor-pointer rounded-md p-1 text-muted transition hover:bg-shell hover:text-control"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            aria-label={tr("Fechar assistente")}
            title={recording || finalizingRecording ? tr("Encerre a gravação antes de fechar") : tr("Fechar")}
            disabled={recording || finalizingRecording}
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-muted transition hover:bg-shell hover:text-fail disabled:opacity-30"
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
            <h1 className="flex-1 text-base sm:text-[17px] font-bold leading-snug tracking-tight text-body">
              {current.caseTitle}
            </h1>

            {/* BADGE DE TEMPO */}
            <button
              type="button"
              onClick={toggleTimer}
              disabled={!editable}
              title={timer.startedAt === null ? tr("Clique para iniciar cronômetro") : tr("Clique para pausar cronômetro")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-surface/90 px-2.5 py-1 shadow-2xs transition hover:bg-shell/90 disabled:opacity-60 cursor-pointer"
            >
              <span className="text-[11px] font-medium text-muted">{tr("Tempo")}</span>
              <span className="font-mono text-xs font-bold tabular-nums text-control">
                {formatDuration(elapsedMs)}
              </span>
              {timer.startedAt === null ? (
                <CirclePlay size={12} className="text-muted" />
              ) : (
                <CirclePause size={12} className="text-pass" />
              )}
            </button>
          </div>

          {/* METADADOS / TELA ALVO */}
          <p className="mt-1 text-xs text-muted">
            {tr("Tela alvo:")} {targetScreenText}
          </p>
        </div>

        {/* PROGRESSO DO TESTE */}
        <div>
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted">{tr("Progresso do teste")}</span>
            <span className="text-control">
              {tr("Passo")} {current.stepNumber} {tr("de")} {current.stepCount}
            </span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-shell">
            <div
              className="h-full rounded-full bg-ink transition-all duration-300"
              style={{ width: `${(current.stepNumber / current.stepCount) * 100}%` }}
            />
          </div>
        </div>

        {/* CARTÃO 1: AÇÃO */}
        <section
          aria-label={tr("Ação do passo")}
          className="rounded-2xl border border-hairline bg-surface p-4 shadow-2xs transition hover:border-hairline-strong"
        >
          <div className="mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {String(current.stepNumber).padStart(2, "0")} {tr("· AÇÃO")}
            </span>
          </div>
          <FormattedStepText text={current.action} />
        </section>

        {/* CARTÃO 2: RESULTADO ESPERADO */}
        <section
          aria-label={tr("Resultado esperado do passo")}
          className="rounded-2xl border border-hairline bg-surface p-4 shadow-2xs transition hover:border-hairline-strong"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {String(current.stepNumber + 1).padStart(2, "0")} {tr("· RESULTADO ESPERADO")}
            </span>
            {requirementTag && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted">
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
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-faint" />
                <span
                  className="truncate font-mono text-[11px] font-medium text-subtle hover:text-body"
                  title={currentEvidences[currentEvidences.length - 1].name}
                >
                  {currentEvidences[currentEvidences.length - 1].name}
                </span>
                {currentEvidences.length > 1 && (
                  <span className="shrink-0 rounded-full bg-shell px-1.5 py-0.2 text-[10px] font-bold text-subtle">
                    +{currentEvidences.length - 1}
                  </span>
                )}
                <button
                  type="button"
                  title={tr("Remover evidência")}
                  onClick={() => void handleRemoveEvidence(currentEvidences[currentEvidences.length - 1].id)}
                  className="text-muted hover:text-fail transition p-0.5 cursor-pointer"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-hairline-strong" />
                <span className="text-[11px] font-normal text-muted">{tr("Nenhuma evidência")}</span>
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
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-subtle transition hover:bg-shell hover:text-body disabled:opacity-40 cursor-pointer"
              >
                <Camera size={14} className="text-muted" />
                <span>{capturing ? tr("Capturando…") : tr("Capturar")}</span>
              </button>

              {/* MENU DE OPÇÕES AVANÇADAS DE CAPTURA */}
              <button
                type="button"
                aria-label={tr("Opções de captura e gravação")}
                onClick={() => setShowCaptureMenu(!showCaptureMenu)}
                className="rounded-md p-1 text-muted hover:bg-shell hover:text-control transition cursor-pointer"
              >
                <ChevronDown size={12} />
              </button>

              {showCaptureMenu && (
                <div className="absolute right-0 bottom-full mb-1 z-30 w-48 rounded-xl border border-hairline bg-raised p-1 shadow-lg text-xs">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-control hover:bg-shell cursor-pointer"
                    onClick={() => void takeScreenshot()}
                  >
                    <Camera size={14} /> {tr("Capturar tela inteira")}
                  </button>
                  <button
                    type="button"
                    disabled={loadingCaptureTargets}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-control hover:bg-shell cursor-pointer disabled:opacity-50"
                    onClick={() => void openWindowTarget("screenshot")}
                  >
                    <GalleryVerticalEnd size={14} /> {loadingCaptureTargets ? tr("Listando janelas…") : tr("Capturar janela…")}
                  </button>
                  <hr className="my-1 border-hairline" />
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-control hover:bg-shell cursor-pointer"
                    onClick={() => void startRecording()}
                  >
                    <Video size={14} /> {tr("Gravar vídeo da tela (60s)")}
                  </button>
                  <button
                    type="button"
                    disabled={loadingCaptureTargets}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-control hover:bg-shell cursor-pointer disabled:opacity-50"
                    onClick={() => void openWindowTarget("recording")}
                  >
                    <Video size={14} /> {loadingCaptureTargets ? tr("Listando janelas…") : tr("Gravar janela…")}
                  </button>
                </div>
              )}
            </div>

            {/* ANEXAR */}
            <button
              type="button"
              disabled={!editable}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-subtle transition hover:bg-shell hover:text-body disabled:opacity-40 cursor-pointer"
            >
              <Paperclip size={14} className="text-muted" />
              <span>{tr("Anexar")}</span>
            </button>
          </div>
        </div>

        {/* GRAVAÇÃO EM ANDAMENTO (QUANDO ATIVA) */}
        {recording && (
          <div className="flex items-center justify-between rounded-xl bg-fail-tint border border-fail-line px-3 py-2 text-xs text-fail-deep">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-ping rounded-full bg-solid-fail" />
              <span className="font-semibold">{tr("Gravando:")} {recordingSource}</span>
              <span className="font-mono text-fail-deep">({recordingElapsed}s)</span>
            </div>
            <button
              type="button"
              onClick={() => void stopRecording()}
              disabled={finalizingRecording}
              className="rounded-lg bg-solid-fail px-2.5 py-1 font-semibold text-on-solid hover:bg-fail-mark transition cursor-pointer"
            >
              {finalizingRecording ? tr("Salvando…") : tr("Parar")}
            </button>
          </div>
        )}

        {/* SELETOR DE JANELA (QUANDO ABERTO) */}
        {windowTargetMode && (
          <div className="rounded-xl border border-hairline bg-surface p-3 text-xs">
            <label className="font-semibold text-control" htmlFor="capture-window-select">
              {windowTargetMode === "recording" ? tr("Selecione a janela para gravação:") : tr("Selecione a janela para captura:")}
            </label>
            <Select
              id="capture-window-select"
              className="mt-1"
              ariaLabel={tr("Janela alvo")}
              value={selectedCaptureTarget}
              onChange={setSelectedCaptureTarget}
              options={captureTargetOptions}
              searchable={captureTargetOptions.length > 8}
              searchPlaceholder={tr("Buscar janela…")}
              placeholder={tr("Selecione uma janela")}
              emptyLabel={tr("Nenhuma janela encontrada.")}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-hairline bg-raised py-1.5 font-medium text-control hover:bg-shell cursor-pointer"
                onClick={() => setWindowTargetMode(null)}
              >
                {tr("Cancelar")}
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-ink py-1.5 font-medium text-white hover:bg-ink-hover disabled:opacity-40 cursor-pointer"
                disabled={!selectedCaptureTarget || capturing || recording || finalizingRecording}
                onClick={() => {
                  if (windowTargetMode === "recording") void startRecording(selectedCaptureTarget);
                  else void takeWindowScreenshot();
                }}
              >
                {windowTargetMode === "recording" ? tr("Gravar janela") : capturing ? tr("Capturando…") : tr("Capturar janela")}
              </button>
            </div>
          </div>
        )}

        {/* COMENTÁRIO / MOTIVO DO RESULTADO (DRAWER INLINE) */}
        {showResultReason && (
          <div id="step-comment-editor" className="rounded-xl border border-hairline bg-surface p-3 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="step-comment" className="font-semibold text-control">
                {currentStatus === "blocked"
                  ? tr("Motivo do bloqueio")
                  : currentStatus === "failed"
                    ? tr("Resultado observado / falha")
                    : tr("Comentário do passo")}
              </label>
              <button
                type="button"
                aria-label={tr("Fechar comentário")}
                onClick={() => setShowResultReason(false)}
                className="text-muted hover:text-subtle cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
            <textarea
              ref={resultCommentRef}
              id="step-comment"
              className="w-full min-h-18 rounded-lg border border-hairline bg-raised p-2 text-xs text-control outline-none focus:border-faint"
              placeholder={currentStatus === "blocked"
                ? tr("Descreva o impedimento...")
                : currentStatus === "failed"
                  ? tr("Descreva a discrepância observada...")
                  : tr("Adicione contexto ou observações sobre esta validação...")}
              value={resultReasonText}
              onChange={(e) => setResultReasonText(e.target.value)}
              disabled={!editable}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-hairline bg-raised px-3 py-1 font-medium text-subtle hover:bg-shell cursor-pointer"
                onClick={() => setShowResultReason(false)}
              >
                {tr("Fechar")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-ink px-3 py-1 font-medium text-white hover:bg-ink-hover cursor-pointer"
                disabled={!editable || savingResult}
                onClick={() => void handleSaveResultReason()}
              >
                {savingResult
                  ? tr("Salvando…")
                  : currentStatus === "failed" || currentStatus === "blocked"
                    ? tr("Salvar observação")
                    : tr("Salvar comentário")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER: BOTÕES DE STATUS E NAVEGAÇÃO */}
      <footer className="shrink-0 border-t border-hairline bg-raised px-5 pt-3 pb-4 space-y-3">
        {/* BOTÕES DE STATUS DO PASSO (Passou, Falhou, Bloqueado, Pular) */}
        <div className="grid grid-cols-4 gap-2.5">
          {/* PASSOU */}
          <button
            type="button"
            disabled={!editable || savingResult}
            onClick={() => void handleSetStatus("passed")}
            className={`flex items-center justify-center rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold transition shadow-2xs cursor-pointer ${
              currentStatus === "passed"
                ? "bg-pass-mark text-ink hover:bg-pass"
                : "border border-hairline bg-raised text-control hover:border-pass-line hover:bg-pass-tint/40 hover:text-pass-deep"
            }`}
          >
            {tr("Passou")}
          </button>

          {/* FALHOU */}
          <button
            type="button"
            disabled={!editable || savingResult}
            onClick={() => void handleSetStatus("failed")}
            className={`flex items-center justify-center rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold transition shadow-2xs cursor-pointer ${
              currentStatus === "failed"
                ? "bg-solid-fail text-on-solid hover:bg-fail-mark"
                : "border border-hairline bg-raised text-control hover:border-fail-line hover:bg-fail-tint/70 hover:text-fail-deep"
            }`}
          >
            {tr("Falhou")}
          </button>

          {/* BLOQUEADO */}
          <button
            type="button"
            disabled={!editable || savingResult}
            onClick={() => void handleSetStatus("blocked")}
            className={`flex items-center justify-center rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold transition shadow-2xs cursor-pointer ${
              currentStatus === "blocked"
                ? "bg-solid-warn text-on-solid hover:bg-warn"
                : "border border-hairline bg-raised text-control hover:border-warn-line hover:bg-warn-tint/40 hover:text-warn-deep"
            }`}
          >
            {tr("Bloqueado")}
          </button>

          {/* PULAR */}
          <button
            type="button"
            disabled={!editable || savingResult}
            onClick={() => void handleSetStatus("skipped")}
            className={`flex items-center justify-center rounded-xl py-2 px-3 text-xs sm:text-sm font-semibold transition shadow-2xs cursor-pointer ${
              currentStatus === "skipped"
                ? "bg-solid-explore text-on-solid hover:bg-explore"
                : "border border-hairline bg-raised text-subtle hover:border-hairline-strong hover:bg-surface"
            }`}
          >
            {tr("Pular")}
          </button>
        </div>

        {/* LINHA INFERIOR: ANTERIOR / COMENTÁRIO E DEFEITO / PRÓXIMO */}
        <div className="flex items-center justify-between text-xs sm:text-sm">
          {/* ANTERIOR */}
          <button
            type="button"
            disabled={activeIndex === 0 || recording}
            onClick={() => selectStep(-1)}
            className="font-medium text-muted transition hover:text-control disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
          >
            {tr("Anterior")}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!editable}
              aria-expanded={showResultReason}
              aria-controls="step-comment-editor"
              onClick={handleOpenResultComment}
              className="inline-flex items-center gap-1 font-medium text-muted transition hover:text-body hover:underline cursor-pointer disabled:opacity-40"
            >
              <MessageSquareText size={13} aria-hidden="true" />
              {storedResult?.actualResult ? tr("Editar comentário") : tr("Comentário")}
            </button>

            <button
              type="button"
              disabled={!editable}
              onClick={handleOpenDefect}
              className="font-medium text-muted transition hover:text-fail hover:underline cursor-pointer disabled:opacity-40"
            >
              {tr("Criar defeito")}
            </button>
          </div>

          {/* PRÓXIMO */}
          <button
            type="button"
            disabled={activeIndex >= steps.length - 1 || recording}
            onClick={() => selectStep(1)}
            className="rounded-xl border border-hairline bg-raised px-4 py-1.5 font-medium text-control shadow-2xs transition hover:bg-surface hover:border-hairline-strong disabled:pointer-events-none disabled:opacity-30 cursor-pointer"
          >
            {tr("Próximo")}
          </button>
        </div>
      </footer>

      {/* MODAL DE CRIAÇÃO RÁPIDA DE DEFEITO */}
      {showDefectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowDefectModal(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-hairline bg-raised p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-sm font-bold text-body">
                <Bug size={16} className="text-fail" />
                <span>{tr("Registrar Defeito")}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDefectModal(false)}
                className="rounded-lg p-1 text-muted hover:bg-shell hover:text-control cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-control mb-1" htmlFor="defect-title">
                  {tr("Título do defeito")}
                </label>
                <input
                  id="defect-title"
                  type="text"
                  value={defectTitle}
                  onChange={(e) => setDefectTitle(e.target.value)}
                  className="w-full rounded-lg border border-hairline bg-raised p-2 text-control outline-none focus:border-fail-mark"
                  placeholder={tr("Ex: Contador não zera ao clicar no sino")}
                />
              </div>

              <div>
                <label className="block font-semibold text-control mb-1">
                  {tr("Severidade")}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["low", "medium", "high", "critical"] as const).map((sev) => {
                    const labels = { low: tr("Baixa"), medium: tr("Média"), high: tr("Alta"), critical: tr("Crítica") };
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setDefectSeverity(sev)}
                        className={`rounded-lg py-1 text-center font-medium border transition cursor-pointer ${
                          defectSeverity === sev
                            ? "bg-fail-tint border-fail-line text-fail-deep font-bold"
                            : "bg-raised border-hairline text-subtle hover:bg-surface"
                        }`}
                      >
                        {labels[sev]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-control mb-1" htmlFor="defect-notes">
                  {tr("Descrição / Detalhes")}
                </label>
                <textarea
                  id="defect-notes"
                  value={defectNotes}
                  onChange={(e) => setDefectNotes(e.target.value)}
                  className="w-full min-h-24 resize-y rounded-lg border border-hairline bg-raised p-2 text-control outline-none focus:border-fail-mark font-sans"
                  placeholder={tr("Descreva o comportamento inesperado...")}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowDefectModal(false)}
                className="rounded-xl border border-hairline bg-raised px-3 py-1.5 font-medium text-control hover:bg-shell cursor-pointer"
              >
                {tr("Cancelar")}
              </button>
              <button
                type="button"
                disabled={savingDefect || !defectTitle.trim()}
                onClick={() => void handleSaveDefect()}
                className="rounded-xl bg-solid-fail px-3.5 py-1.5 font-semibold text-on-solid hover:bg-fail-mark disabled:opacity-40 cursor-pointer"
              >
                {savingDefect ? tr("Salvando…") : tr("Criar defeito")}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
