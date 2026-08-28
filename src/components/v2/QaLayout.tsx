import { useEffect, useRef, useState, type ReactNode } from "react";
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
import { APP_VERSION } from "../../version";

export type QaView = "dashboard" | "demands" | "cases" | "plans" | "runs" | "reports" | "settings";

interface QaLayoutProps {
  view: QaView;
  onNavigate: (view: QaView) => void;
  children: ReactNode;
  workspaceName: string;
  immersive?: boolean;
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

export function QaLayout({ view, onNavigate, children, workspaceName, immersive = false }: QaLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem("qa-flow-sidebar-collapsed") === "true"; }
    catch { return false; }
  });
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const navigate = (target: QaView) => {
    onNavigate(target);
    setDrawerOpen(false);
  };

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem("qa-flow-sidebar-collapsed", String(next)); }
      catch { /* A navegação continua funcional mesmo sem persistência. */ }
      return next;
    });
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const menuButton = menuButtonRef.current;
    const focusable = () => [...(drawer?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
      .filter((element) => !element.hasAttribute("disabled"));
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setDrawerOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
    };
  }, [drawerOpen]);

  const renderNav = (compact = false) => (
    <>
      <div className={`flex h-18 items-center border-b border-slate-800 ${compact ? "justify-center px-2" : "px-5"}`}>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-sm font-black text-slate-950">QA</div>
        <div className={`${compact ? "hidden" : "ml-3 min-w-0"}`}>
          <p className="text-lg font-black tracking-tight text-white">Flow</p>
          <p className="truncate text-xs text-slate-400" title={workspaceName}>{workspaceName}</p>
        </div>
        {compact ? null : (
          <button
            type="button"
            aria-label="Recolher menu lateral"
            title="Recolher menu lateral"
            onClick={toggleSidebar}
            className="ml-auto hidden min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white lg:flex"
          >
            <PanelLeftClose size={19} aria-hidden="true" />
          </button>
        )}
      </div>
      <nav aria-label="Navegação principal" className={`flex-1 space-y-1 ${compact ? "p-2" : "p-3"}`}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={compact ? item.label : undefined}
              title={compact ? item.label : undefined}
              onClick={() => navigate(item.id)}
              className={`flex min-h-11 w-full items-center rounded-xl text-left text-sm font-semibold transition ${compact ? "justify-center px-2" : "gap-3 px-3"} ${active ? "bg-cyan-300 text-slate-950 shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
            >
              <Icon size={18} aria-hidden="true" />
              {compact ? <span className="sr-only">{item.label}</span> : item.label}
            </button>
          );
        })}
      </nav>
      <div className={`border-t border-slate-800 text-xs leading-relaxed text-slate-500 ${compact ? "p-2" : "p-4"}`}>
        {compact ? (
          <button
            type="button"
            aria-label="Expandir menu lateral"
            title="Expandir menu lateral"
            onClick={toggleSidebar}
            className="flex min-h-11 w-full items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <PanelLeftOpen size={19} aria-hidden="true" />
          </button>
        ) : `QA Flow ${APP_VERSION} · local-first`}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className={`fixed inset-y-0 left-0 z-30 flex-col bg-slate-950 transition-[width] duration-200 ${immersive ? "hidden w-52 md:flex" : `hidden lg:flex ${sidebarCollapsed ? "w-20" : "w-64"}`}`}>
        {renderNav(immersive ? false : sidebarCollapsed)}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setDrawerOpen(false)}
          />
          <aside ref={drawerRef} role="dialog" aria-modal="true" aria-label="Menu principal" className="relative flex h-full w-72 max-w-[88vw] flex-col bg-slate-950 shadow-2xl">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X size={20} />
            </button>
            {renderNav(false)}
          </aside>
        </div>
      )}

      <div className={`${immersive ? "md:pl-52" : sidebarCollapsed ? "lg:pl-20" : "lg:pl-64"} transition-[padding] duration-200`} inert={drawerOpen ? true : undefined}>
        <header className={`sticky top-0 z-20 h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-7 ${immersive ? "hidden" : view === "demands" ? "flex lg:hidden" : "flex"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Abrir menu"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{view === "demands" ? workspaceName : items.find((item) => item.id === view)?.label}</p>
              <p className="hidden text-xs text-slate-500 sm:block">{view === "demands" ? "Workspace local" : "Casos reutilizáveis, tentativas auditáveis e histórico preservado."}</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Salvo localmente</span>
        </header>
        <main className={`mx-auto w-full ${view === "demands" ? "max-w-none p-4 md:p-6 xl:p-8" : "max-w-[1500px]"} ${immersive ? "p-0" : view === "demands" ? "" : "p-4 md:p-7"}`}>{children}</main>
      </div>
    </div>
  );
}
