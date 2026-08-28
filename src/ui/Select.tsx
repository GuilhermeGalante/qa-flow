import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { inputClass } from "./styles";

export interface SelectOption<T extends string = string> {
  value: T;
  /** Identidade da opção. Fica em peso forte, sozinha na primeira linha. */
  label: string;
  /** Metadado da opção — revisão, contagem, status. É o que o `<select>` nativo achatava. */
  hint?: string;
  badge?: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  id?: string;
  disabled?: boolean;
  /** Adiciona campo de busca no topo da lista. Use quando a lista cresce sem limite. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  className?: string;
}

const TYPEAHEAD_RESET_MS = 600;
const POPOVER_SPACE = 264;

/**
 * Listbox própria, em substituição ao `<select>` nativo.
 *
 * Ganhos sobre o nativo: aparência igual em todos os navegadores, chevron próprio,
 * segunda linha de metadado por opção (`hint`) e busca opcional. Mantém o contrato de
 * acessibilidade do combobox — `aria-activedescendant`, setas, Home/End, type-ahead e
 * Escape —, e o foco nunca sai do gatilho (ou do campo de busca).
 */
export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Selecione",
  ariaLabel,
  ariaLabelledBy,
  id,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Buscar…",
  emptyLabel = "Nenhuma opção encontrada.",
  className = "",
}: SelectProps<T>) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const listId = `${baseId}-listbox`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [search, setSearch] = useState("");
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ query: "", at: 0 });

  const visible = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return options.filter((option) =>
      `${option.label} ${option.hint ?? ""} ${option.badge ?? ""}`.toLocaleLowerCase("pt-BR").includes(needle));
  }, [options, search, searchable]);

  const selected = options.find((option) => option.value === value);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setSearch("");
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openList = useCallback(() => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    // Abre para cima quando não há altura útil abaixo do gatilho.
    setPlacement(rect && window.innerHeight - rect.bottom < POPOVER_SPACE && rect.top > POPOVER_SPACE ? "top" : "bottom");
    const current = options.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(current >= 0 ? current : options.findIndex((option) => !option.disabled));
    setOpen(true);
  }, [disabled, options, value]);

  const commit = useCallback((option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  }, [onChange, close]);

  const step = useCallback((offset: number) => {
    setActiveIndex((current) => {
      if (!visible.length) return -1;
      let next = current;
      for (let attempt = 0; attempt < visible.length; attempt += 1) {
        next = (next + offset + visible.length) % visible.length;
        if (!visible[next]?.disabled) return next;
      }
      return current;
    });
  }, [visible]);

  const edge = useCallback((from: "start" | "end") => {
    const indexes = visible.map((option, index) => (option.disabled ? -1 : index)).filter((index) => index >= 0);
    if (!indexes.length) return;
    setActiveIndex(from === "start" ? indexes[0] : indexes[indexes.length - 1]);
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      close(false);
    };
    // Rolar o conteúdo atrás desloca o popover; fechar é mais honesto que reposicionar.
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, searchable]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown": event.preventDefault(); step(1); return;
      case "ArrowUp": event.preventDefault(); step(-1); return;
      case "Home": event.preventDefault(); edge("start"); return;
      case "End": event.preventDefault(); edge("end"); return;
      case "Escape": event.preventDefault(); close(); return;
      case "Tab": close(false); return;
      case "Enter": {
        // Sem isto, o Enter no campo de busca submeteria o formulário ao redor.
        event.preventDefault();
        const option = visible[activeIndex];
        if (option) commit(option);
        return;
      }
      case " ": {
        if (searchable) return;
        event.preventDefault();
        const option = visible[activeIndex];
        if (option) commit(option);
        return;
      }
      default: break;
    }

    if (searchable || event.key.length !== 1) return;
    const now = Date.now();
    typeahead.current.query = now - typeahead.current.at > TYPEAHEAD_RESET_MS
      ? event.key.toLocaleLowerCase("pt-BR")
      : typeahead.current.query + event.key.toLocaleLowerCase("pt-BR");
    typeahead.current.at = now;
    const found = visible.findIndex((option) =>
      !option.disabled && option.label.toLocaleLowerCase("pt-BR").startsWith(typeahead.current.query));
    if (found >= 0) setActiveIndex(found);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        id={baseId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        className={`${inputClass} flex items-center gap-2 pr-9 text-left disabled:cursor-not-allowed disabled:bg-shell disabled:text-muted ${open ? "border-run-mark ring-4 ring-run-halo" : ""}`}
      >
        {selected?.badge && (
          <span className="shrink-0 rounded-full bg-shell px-2 py-0.5 text-[11px] font-bold text-subtle">{selected.badge}</span>
        )}
        <span className={`truncate ${selected ? "" : "text-muted"}`}>{selected?.label ?? placeholder}</span>
        {selected?.hint && <span className="min-w-0 truncate text-xs text-muted">{selected.hint}</span>}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className={`absolute z-40 w-full min-w-56 overflow-hidden rounded-xl border border-hairline-strong bg-raised shadow-xl ${placement === "top" ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {searchable && (
            <div className="relative border-b border-hairline p-2">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                type="text"
                aria-label={searchPlaceholder}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); }}
                placeholder={searchPlaceholder}
                className={`${inputClass} py-2 pl-8 text-sm`}
              />
            </div>
          )}
          <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto p-1">
            {visible.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted">{emptyLabel}</li>}
            {visible.map((option, index) => {
              const active = index === activeIndex;
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  data-active={active}
                  onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
                  onClick={() => commit(option)}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 ${option.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"} ${active ? "bg-run-tint" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {option.badge && <span className="shrink-0 rounded-full bg-shell px-2 py-0.5 text-[11px] font-bold text-subtle">{option.badge}</span>}
                      <span className={`truncate text-sm ${isSelected ? "font-bold text-body" : "text-control"}`}>{option.label}</span>
                    </span>
                    {option.hint && <span className="mt-0.5 block truncate text-xs text-muted">{option.hint}</span>}
                  </span>
                  {isSelected && <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-run" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
