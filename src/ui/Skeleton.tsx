/** Bloco de carregamento com a forma do conteúdo que vai aparecer. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`qa-skeleton block rounded-lg bg-hairline ${className}`} />;
}
