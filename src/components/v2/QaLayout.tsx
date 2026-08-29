import { useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpenCheck,
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
  { id: "cases", label: "Casos", icon: BookOpenCheck },
  { id: "plans", label: "Planos", icon: ClipboardList },
  { id: "runs", label: "Execuções", icon: PlayCircle },
  { id: "reports", label: "Relatórios", icon: FileBarChart },
  { id: "settings", label: "Configurações", icon: Settings },
];

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

  const renderNav = (compact = false) => (
    <>
      <div className={`flex h-18 items-center border-b border-ink-hover ${compact ? "justify-center px-2" : "px-5"}`}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-run-mark text-sm font-bold text-body">QA</div>
        <div className={`${compact ? "hidden" : "ml-3 min-w-0"}`}>
          <p className="text-lg font-bold tracking-tight text-white">Flow</p>
          <p className="truncate text-xs text-faint" title={workspaceName}>{workspaceName}</p>
        </div>
        {compact ? null : (
          <button
            type="button"
            aria-label="Recolher menu lateral"
            title="Recolher menu lateral"
            onClick={toggleSidebar}
            className="ml-auto hidden min-h-11 min-w-11 items-center justify-center rounded-xl text-faint transition hover:bg-ink-hover hover:text-white lg:flex"
          >
            <PanelLeftClose size={19} aria-hidden="true" />
          </button>
        )}
      </div>
      <nav aria-label="Navegação principal" className={`flex-1 space-y-1 ${compact ? "p-2" : "p-3"}`}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          const stateClasses = active
            ? "bg-cyan-300 text-body shadow-sm"
            : "text-slate-300 hover:bg-ink-hover hover:text-white";
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
              {compact ? <span className="sr-only">{item.label}</span> : item.label}
            </button>
          );
        })}
      </nav>
      <div className={`border-t border-ink-hover text-xs leading-relaxed text-faint ${compact ? "p-2" : "p-4"}`}>
        {compact ? (
          <button
            type="button"
            aria-label="Expandir menu lateral"
            title="Expandir menu lateral"
            onClick={toggleSidebar}
            className="flex min-h-11 w-full items-center justify-center rounded-xl text-faint transition hover:bg-ink-hover hover:text-white"
          >
            <PanelLeftOpen size={19} aria-hidden="true" />
          </button>
        ) : `QA Flow ${APP_VERSION} · local-first`}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-shell text-body">
      <aside className={`fixed inset-y-0 left-0 z-30 flex-col bg-ink transition-[width] duration-200 ${immersive ? "hidden w-52 md:flex" : `hidden lg:flex ${sidebarCollapsed ? "w-20" : "w-64"}`}`}>
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
          <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Menu principal" className="relative flex h-full w-72 max-w-[88vw] flex-col bg-ink shadow-2xl">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-faint hover:bg-ink-hover hover:text-white"
            >
              <X size={20} />
            </button>
            {renderNav(false)}
          </aside>
        </div>
      )}

      <div className={`${immersive ? "md:pl-52" : sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"} transition-[padding] duration-200`} inert={drawerOpen ? true : undefined}>
        <header className={`sticky top-0 z-20 h-16 items-center justify-between border-b border-hairline bg-raised/95 px-4 backdrop-blur md:px-7 ${immersive ? "hidden" : view === "demands" ? "flex lg:hidden" : "flex"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-hairline p-2 text-control lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-body">{view === "demands" ? workspaceName : items.find((item) => item.id === view)?.label}</p>
              <p className="hidden text-xs text-muted sm:block">{view === "demands" ? "Workspace local" : "Casos reutilizáveis, tentativas auditáveis e histórico preservado."}</p>
            </div>
          </div>
          <span className="rounded-full bg-pass-tint px-3 py-1 text-xs font-bold text-pass">{persistenceLabel}</span>
        </header>
        <main className={`mx-auto w-full ${view === "demands" ? "max-w-none p-4 md:p-6 xl:p-8" : "max-w-[1500px]"} ${immersive ? "p-0" : view === "demands" ? "" : "p-4 md:p-7"}`}>{children}</main>
      </div>
    </div>
  );
}
