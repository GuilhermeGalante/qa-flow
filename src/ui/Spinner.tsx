const sizes = { sm: "h-3.5 w-3.5 border-2", md: "h-4 w-4 border-2", lg: "h-6 w-6 border-[3px]" } as const;

/**
 * Indicador de progresso indeterminado. Decorativo: quem informa o estado ao leitor
 * de tela é o `aria-busy` do controle que o contém.
 */
export function Spinner({ size = "md" }: { size?: keyof typeof sizes }) {
  return <span aria-hidden="true" className={`qa-spin inline-block shrink-0 rounded-full border-current border-r-transparent ${sizes[size]}`} />;
}
