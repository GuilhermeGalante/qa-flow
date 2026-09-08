import { useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpenCheck,
  ChevronDown,
  ClipboardList,
  Columns3,
  FileBarChart,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Settings,
  X,
} from "lucide-react";
import { useDialogBehavior } from "../../ui/useDialogBehavior";
import { useQaStore } from "../../store/useQaStore";
import { APP_VERSION } from "../../version";

export type QaView = "dashboard" | "demands" | "cases" | "plans" | "runs" | "reports" | "settings";

interface QaLayoutProps {
  view: QaView;
  onNavigate: (view: QaView) => void;
  children: ReactNode;
  workspaceName: string;
  immersive?: boolean;
  persistenceLabel?: string;
  sidebarCollapsed?: boolean;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
}

const items: { id: QaView; label: string; icon: typeof BarChart3 }[] = [
  { id: "dashboard", label: "Visão geral", icon: BarChart3 },
  { id: "demands", label: "Demandas", icon: Columns3 },
  { id: "cases", label: "Casos de Teste", icon: BookOpenCheck },
  { id: "plans", label: "Planos de Teste", icon: ClipboardList },
  { id: "runs", label: "Execuções", icon: PlayCircle },
  { id: "reports", label: "Relatórios", icon: FileBarChart },
  { id: "settings", label: "Configurações", icon: Settings },
];

const primaryItems = items.slice(0, 4);
const executionItems = items.slice(4, 6);

export function QaLayout({
  view,
  onNavigate,
  children,
  workspaceName,
  immersive = false,
  persistenceLabel = "Salvo localmente",
  sidebarCollapsed = false,
  onSidebarCollapsedChange,
}: QaLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const demandCount = useQaStore((state) => state.demands.length);
  const caseCount = useQaStore((state) => state.cases.length);
  const planCount = useQaStore((state) => state.plans.length);
  const runCount = useQaStore((state) => state.runs.filter((run) => run.status === "in_progress" || run.status === "paused").length);
  const navCounts: Partial<Record<QaView, number>> = {
    demands: demandCount,
    cases: caseCount,
    plans: planCount,
    runs: runCount,
  };

  const navigate = (target: QaView) => {
    onNavigate(target);
    setDrawerOpen(false);
  };

  const toggleSidebar = () => {
    onSidebarCollapsedChange?.(!sidebarCollapsed);
  };

  useDialogBehavior({
    open: drawerOpen,
    onClose: () => setDrawerOpen(false),
    containerRef: drawerRef,
  });

  const renderNavItems = (navItems: typeof items, compact: boolean) => navItems.map((item) => {
    const Icon = item.icon;
    const active = view === item.id;
    const stateClasses = active
      ? "bg-emerald-500 text-white shadow-[0_8px_20px_rgb(34_197_94/0.22)]"
      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950";
    return (
      <button
        key={item.id}
        type="button"
        aria-current={active ? "page" : undefined}
        aria-label={compact ? item.label : undefined}
        title={compact ? item.label : undefined}
        onClick={() => navigate(item.id)}
        className={`flex min-h-11 w-full items-center rounded-xl text-left text-sm font-semibold transition ${compact ? "justify-center px-2" : "gap-3 px-3"} ${stateClasses}`}
      >
        <Icon size={18} aria-hidden="true" />
        {compact ? <span className="sr-only">{item.label}</span> : (
          <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.id === "runs" && runCount > 0 ? (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"}`}>
                {runCount} {runCount === 1 ? "ativa" : "ativas"}
              </span>
            ) : navCounts[item.id] !== undefined ? (
              <span className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums ${active ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"}`}>
                {navCounts[item.id]}
              </span>
            ) : null}
          </>
        )}
      </button>
    );
  });

  const renderNav = (compact = false) => (
    <>
      <div className={`flex min-h-20 items-center border-b border-neutral-100 ${compact ? "justify-center px-2" : "px-5"}`}>
        <img
          src="/qa-flow-logo.png"
          alt={compact ? "QA Flow" : ""}
          className="h-10 w-10 shrink-0 rounded-xl border border-neutral-200/80 bg-white object-cover shadow-sm"
        />
        <div className={`${compact ? "hidden" : "ml-3 min-w-0"}`}>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold tracking-tight text-neutral-950">QA Flow</p>
            <ChevronDown size={14} className="text-neutral-400" aria-hidden="true" />
          </div>
          <p className="truncate text-xs font-medium text-neutral-400" title={workspaceName}>{workspaceName}</p>
        </div>
        {compact ? null : (
          <button
            type="button"
            aria-label="Recolher menu lateral"
            title="Recolher menu lateral"
            onClick={toggleSidebar}
            className="ml-auto hidden min-h-11 min-w-11 items-center justify-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800 lg:flex"
          >
            <PanelLeftClose size={19} aria-hidden="true" />
          </button>
        )}
      </div>
      <nav aria-label="Navegação principal" className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${compact ? "space-y-1 p-2" : "space-y-7 p-4"}`}>
        <div>
          {!compact && <p className="mb-2 px-3 text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">GESTÃO DE QUALIDADE</p>}
          <div className="space-y-1">{renderNavItems(primaryItems, compact)}</div>
        </div>
        <div>
          {!compact && <p className="mb-2 px-3 text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">AUTOMAÇÃO & EXECUÇÕES</p>}
          <div className="space-y-1">{renderNavItems(executionItems, compact)}</div>
        </div>
      </nav>
      <div className={`border-t border-neutral-100 text-xs leading-relaxed text-neutral-400 ${compact ? "p-2" : "p-4"}`}>
        {compact ? (
          <button
            type="button"
            aria-label="Expandir menu lateral"
            title="Expandir menu lateral"
            onClick={toggleSidebar}
            className="flex min-h-11 w-full items-center justify-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800"
          >
            <PanelLeftOpen size={19} aria-hidden="true" />
          </button>
        ) : (
          <>
            {renderNavItems(items.slice(6), false)}
            <p className="px-3 pt-3">QA Flow {APP_VERSION} · local-first</p>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="h-dvh w-full overflow-hidden bg-[#f7f7f5] text-body">
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#f7f7f5]">
        <aside className={`z-30 hidden h-full shrink-0 flex-col border-r border-neutral-200/80 bg-white transition-[width] duration-200 lg:flex ${immersive ? "w-52" : sidebarCollapsed ? "w-20" : "w-64"}`}>
          {renderNav(immersive ? false : sidebarCollapsed)}
        </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-ink/60"
            onClick={() => setDrawerOpen(false)}
          />
          <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Menu principal" className="relative flex h-full w-72 max-w-[88vw] flex-col bg-white shadow-2xl">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X size={20} />
            </button>
            {renderNav(false)}
          </aside>
        </div>
      )}

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" inert={drawerOpen ? true : undefined}>
        <header className={`sticky top-0 z-20 h-16 items-center justify-between border-b border-neutral-200/80 bg-white/95 px-4 backdrop-blur md:px-7 ${immersive ? "hidden" : "flex lg:hidden"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-hairline p-2 text-control lg:hidden"
            >
              <Menu size={20} />
            </button>
            <img
              src="/qa-flow-logo.png"
              alt="QA Flow"
              className="h-8 w-8 shrink-0 rounded-lg border border-neutral-200/80 bg-white object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-body">{items.find((item) => item.id === view)?.label}</p>
              <p className="hidden text-xs text-muted sm:block">{workspaceName}</p>
            </div>
          </div>
          <span className="rounded-full bg-pass-tint px-3 py-1 text-xs font-bold text-pass">{persistenceLabel}</span>
        </header>
        <main className={`w-full ${immersive ? "p-0" : view === "demands" ? "p-4 md:p-6 xl:p-7 2xl:p-9" : "p-4 md:p-7 2xl:p-9"}`}>{children}</main>
        </div>
      </div>
    </div>
  );
}
