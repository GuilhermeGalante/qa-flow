/* eslint-disable react-refresh/only-export-components -- provider e hook do mesmo primitivo */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { focusRing } from "./styles";

export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastInput {
  tone?: ToastTone;
  message: string;
  description?: string;
  /** Milissegundos, ou `null` para manter até o usuário dispensar. Sem valor, usa o padrão do tom. */
  duration?: number | null;
}

interface Toast extends Required<Pick<ToastInput, "tone" | "message">> {
  id: string;
  description?: string;
  duration: number | null;
}

/** Erro não some sozinho: quem falhou precisa poder ler a mensagem inteira. */
const defaultDuration: Record<ToastTone, number | null> = {
  success: 5000,
  info: 5000,
  warning: 7000,
  error: null,
};

const toneStyles: Record<ToastTone, { shell: string; icon: string }> = {
  success: { shell: "border-pass-line bg-pass-tint text-pass-deep", icon: "text-pass" },
  error: { shell: "border-fail-line bg-fail-tint text-fail-deep", icon: "text-fail" },
  warning: { shell: "border-warn-line bg-warn-tint text-warn-deep", icon: "text-warn" },
  info: { shell: "border-run-line bg-run-tint text-run-deep", icon: "text-run" },
};

const toneIcon = { success: CheckCircle2, error: CircleAlert, warning: TriangleAlert, info: Info };

const VISIBLE_LIMIT = 3;

export interface ToastApi {
  show: (input: ToastInput) => void;
  /**
   * Deriva o tom de `result.ok`. É a única ponte entre store e feedback — nenhum
   * componente pode inspecionar o texto da mensagem para decidir a cor.
   */
  fromResult: (
    result: { ok: boolean; message: string },
    options?: { successDescription?: string; errorDescription?: string },
  ) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let sequence = 0;

function ToastCard({ toast, dismiss }: { toast: Toast; dismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  const Icon = toneIcon[toast.tone];
  const styles = toneStyles[toast.tone];
  const { id, duration } = toast;

  useEffect(() => {
    if (duration === null || paused) return;
    const timer = window.setTimeout(() => dismiss(id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, paused, dismiss, id]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`qa-toast-enter pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${styles.shell}`}
    >
      <Icon size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${styles.icon}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{toast.message}</p>
        {toast.description && <p className="mt-1 text-xs leading-relaxed opacity-90">{toast.description}</p>}
      </div>
      <button
        type="button"
        aria-label="Dispensar aviso"
        onClick={() => dismiss(toast.id)}
        className={`-mr-1 shrink-0 rounded-lg p-1 opacity-70 transition hover:opacity-100 ${focusRing}`}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const tone = input.tone ?? "info";
    sequence += 1;
    setToasts((current) => [
      ...current,
      {
        id: `toast-${sequence}`,
        tone,
        message: input.message,
        description: input.description,
        duration: input.duration === undefined ? defaultDuration[tone] : input.duration,
      },
    ]);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    dismiss,
    fromResult: (result, options) => show({
      tone: result.ok ? "success" : "error",
      message: result.message,
      description: result.ok ? options?.successDescription : options?.errorDescription,
    }),
  }), [show, dismiss]);

  // A fila mantém no máximo três visíveis; o excedente entra quando abre espaço, e o
  // temporizador de cada um começa ao aparecer, não ao ser enfileirado.
  const visible = toasts.slice(0, VISIBLE_LIMIT);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:items-end sm:px-0">
        {visible.map((toast) => <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  return api;
}
