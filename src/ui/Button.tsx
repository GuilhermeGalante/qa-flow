import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";
import { buttonDanger, buttonPrimary, buttonSecondary } from "./styles";

const variants = { primary: buttonPrimary, secondary: buttonSecondary, danger: buttonDanger } as const;

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: keyof typeof variants;
  /** Desabilita o controle, troca o ícone por um spinner e marca `aria-busy`. */
  loading?: boolean;
  /** Rótulo alternativo enquanto `loading`. Sem ele, o rótulo normal permanece. */
  loadingLabel?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Botão com estado de carregamento. Use sempre que o `onClick` for assíncrono: é o que
 * impede o clique duplo em importação, geração de PDF, gravação de repositório e afins.
 * Para botão estático, as strings de `styles.ts` continuam válidas.
 */
export function Button({
  variant = "secondary",
  loading = false,
  loadingLabel,
  icon,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${variants[variant]} ${className}`}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
