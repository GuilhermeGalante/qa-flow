import React from "react";
import {
  LayoutDashboard,
  FileSpreadsheet,
  LayoutTemplate,
  PlaySquare,
  FlaskConical,
  BarChart2,
} from "lucide-react";
import type { TestPlan } from "../../types";

export type View = "dashboard" | "csv" | "builder" | "runner" | "reports";

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  currentPlan: TestPlan | null;
  children: React.ReactNode;
}

const PRIMARY = "#5A9EB7";

interface NavItem {
  id: View;
  label: string;
  Icon: React.FC<{ size?: number; className?: string }>;
  badge?: number;
  disabled?: boolean;
  section?: string;
}

export const AppLayout: React.FC<Props> = ({
  view,
  onNavigate,
  currentPlan,
  children,
}) => {
  const navItems: NavItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      Icon: LayoutDashboard,
      section: "Geral",
    },
    {
      id: "runner",
      label: "Test Execution",
      Icon: PlaySquare,
      disabled: !currentPlan,
      badge: currentPlan?.scenarios.length,
      section: "Geral",
    },
    {
      id: "csv",
      label: "Import CSV",
      Icon: FileSpreadsheet,
      section: "Planos",
    },
    {
      id: "builder",
      label: "Create Manual",
      Icon: LayoutTemplate,
      section: "Planos",
    },
    {
      id: "reports",
      label: "Reports",
      Icon: BarChart2,
      section: "Planos",
    },
  ];

  // Group items by section preserving order, deduplicating
  const sections: { title: string; items: NavItem[] }[] = [];
  for (const item of navItems) {
    const sec = item.section ?? "";
    const existing = sections.find((s) => s.title === sec);
    if (existing) {
      existing.items.push(item);
    } else {
      sections.push({ title: sec, items: [item] });
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col h-full border-r border-slate-800"
        style={{ backgroundColor: "#161b27" }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-5 py-5 border-b"
          style={{ borderColor: "#232a3a" }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${PRIMARY}22` }}
          >
            <FlaskConical size={16} style={{ color: PRIMARY }} />
          </div>
          <span className="font-bold text-lg tracking-tight">
            <span className="text-white">QA</span>
            <span style={{ color: PRIMARY }}>Flow</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p
                className="text-[10px] font-bold uppercase tracking-widest px-3 mb-1.5"
                style={{ color: "#3d4a60" }}
              >
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item, idx) => {
                  const isActive = view === item.id && !item.disabled;
                  return (
                    <button
                      key={`${item.id}-${idx}`}
                      type="button"
                      disabled={item.disabled}
                      onClick={() => !item.disabled && onNavigate(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
                      style={
                        isActive
                          ? {
                              backgroundColor: `${PRIMARY}18`,
                              color: "#a8d8ea",
                              borderLeft: `2px solid ${PRIMARY}`,
                              paddingLeft: "10px",
                            }
                          : item.disabled
                            ? { color: "#2e3a50", cursor: "not-allowed" }
                            : { color: "#6b7fa0" }
                      }
                      onMouseEnter={(e) => {
                        if (!isActive && !item.disabled)
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.backgroundColor = "#1e2535";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive && !item.disabled)
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.backgroundColor = "transparent";
                      }}
                    >
                      <span style={isActive ? { color: PRIMARY } : {}}>
                        <item.Icon size={16} />
                      </span>
                      <span className="flex-1">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t text-[11px]"
          style={{ borderColor: "#232a3a", color: "#2e3a50" }}
        >
          QAFlow · v1.0
        </div>
      </aside>

      {/* ── Content area ─────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="p-8 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
};
