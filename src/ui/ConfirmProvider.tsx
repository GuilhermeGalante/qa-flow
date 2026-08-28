/* eslint-disable react-refresh/only-export-components -- provider e hook do mesmo primitivo */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { buttonDanger, buttonPrimary, buttonSecondary } from "./styles";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Nome do item afetado. Fica em destaque, em vez de concatenado na frase. */
  itemLabel?: string;
  /** O que mais é atingido. Renderiza como lista com contagem. */
  impact?: string[];
  impactTitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((options) => new Promise<boolean>((resolve) => {
    setPending((current) => {
      // Um pedido novo sobre um aberto: o anterior é respondido com "não".
      current?.resolve(false);
      return { options, resolve };
    });
  }), []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const options = pending?.options;
  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal
          open
          onClose={() => settle(false)}
          title={options.title}
          description={options.description}
          size="sm"
          tone={danger ? "danger" : "default"}
          showClose={false}
          closeOnBackdrop={false}
          // Ação destrutiva não deve ser confirmável com um Enter reflexo.
          initialFocusRef={danger ? cancelRef : undefined}
          footer={(
            <>
              <button ref={cancelRef} type="button" className={buttonSecondary} onClick={() => settle(false)}>
                {options.cancelLabel ?? "Cancelar"}
              </button>
              <button type="button" className={danger ? buttonDanger : buttonPrimary} onClick={() => settle(true)}>
                {options.confirmLabel ?? "Confirmar"}
              </button>
            </>
          )}
        >
          {options.itemLabel && (
            <p className="rounded-xl border border-hairline bg-shell px-4 py-3 text-sm font-bold text-body">
              {options.itemLabel}
            </p>
          )}
          {options.impact && options.impact.length > 0 && (
            <div className={options.itemLabel ? "mt-4" : undefined}>
              <p className="text-xs font-bold text-muted">
                {options.impactTitle ?? `Impacto em ${options.impact.length} ${options.impact.length === 1 ? "item" : "itens"}`}
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-warn-line bg-warn-tint px-4 py-3 text-sm text-warn-deep">
                {options.impact.map((item) => <li key={item} className="truncate" title={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {!options.itemLabel && !options.impact?.length && !options.description && (
            <p className="text-sm text-muted">Esta ação precisa da sua confirmação.</p>
          )}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm precisa estar dentro de <ConfirmProvider>.");
  return confirm;
}
