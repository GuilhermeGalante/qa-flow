import { useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  FileBarChart,
  Menu,
  PlayCircle,
  Settings,
  X,
} from "lucide-react";

export type QaView = "dashboard" | "cases" | "plans" | "runs" | "reports" | "settings";

interface QaLayoutProps {
  view: QaView;
  onNavigate: (view: QaView) => void;
  children: ReactNode;
  workspaceName: string;
}

const items: { id: QaView; label: string; icon: typeof BarChart3 }[] = [
  { id: "dashboard", label: "Visão geral", icon: BarChart3 },
  { id: "cases", label: "Casos", icon: BookOpenCheck },
  { id: "plans", label: "Planos", icon: ClipboardList },
  { id: "runs", label: "Execuções", icon: PlayCircle },
  { id: "reports", label: "Relatórios", icon: FileBarChart },
  { id: "settings", label: "Configurações", icon: Settings },
];

export function QaLayout({ view, onNavigate, children, workspaceName }: QaLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigate = (target: QaView) => {
    onNavigate(target);
    setDrawerOpen(false);
  };

  const nav = (
    <>
      <div className="flex h-18 items-center border-b border-slate-800 px-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-sm font-black text-slate-950">QA</div>
        <div className="ml-3 min-w-0">
          <p className="text-lg font-black tracking-tight text-white">Flow</p>
          <p className="truncate text-xs text-slate-400" title={workspaceName}>{workspaceName}</p>
        </div>
      </div>
      <nav aria-label="Navegação principal" className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${active ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
            >
              <Icon size={18} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-slate-800 p-4 text-xs leading-relaxed text-slate-500">
        QA Flow v2 · local-first
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-950 lg:flex">{nav}</aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[88vw] flex-col bg-slate-950 shadow-2xl">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{items.find((item) => item.id === view)?.label}</p>
              <p className="hidden text-xs text-slate-500 sm:block">Casos reutilizáveis, tentativas auditáveis e histórico preservado.</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Salvo localmente</span>
        </header>
        <main className="mx-auto w-full max-w-[1500px] p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
