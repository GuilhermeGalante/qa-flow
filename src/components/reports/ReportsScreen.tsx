import React, { useState } from "react";
import { BarChart2, FilePlus2, FileText, Files, Trash2 } from "lucide-react";
import { useTestStore } from "../../store/useTestStore";
import {
  generateEvidenceReport,
  generateExecutiveSummary,
} from "../../utils/generatePdfReport";
import { AddReportModal } from "./AddReportModal";
import type { TestPlan } from "../../types";

const PRIMARY = "#5A9EB7";

export const ReportsScreen: React.FC = () => {
  const reports = useTestStore((state) => state.reports);
  const plans = useTestStore((state) => state.plans);
  const deleteReport = useTestStore((state) => state.deleteReport);
  const [showModal, setShowModal] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const getApprovalProgress = (plan: TestPlan | null) => {
    if (!plan) {
      return { approvedPercent: 0, passedSteps: 0, totalSteps: 0 };
    }

    const steps = plan.scenarios.flatMap((scenario) => scenario.steps);
    const totalSteps = steps.length;
    const passedSteps = steps.filter((step) => step.status === "passed").length;
    const approvedPercent =
      totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0;

    return { approvedPercent, passedSteps, totalSteps };
  };

  const rows = [...reports]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .map((report) => ({
      report,
      plan: plans.find((plan) => plan.id === report.testPlanId) ?? null,
    }));

  const validPlansCount = plans.filter(
    (plan) => plan.scenarios.length > 0,
  ).length;

  const handleDownload = async (
    reportId: string,
    planId: string,
    variant: "executive" | "evidence",
  ) => {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return;

    const loadingKey = `${reportId}-${variant}`;
    setDownloading(loadingKey);

    if (variant === "executive") {
      await generateExecutiveSummary(plan);
    } else {
      await generateEvidenceReport(plan);
    }

    setDownloading(null);
  };

  const handleDelete = async (reportId: string) => {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir este relatório?",
    );

    if (!confirmed) {
      return;
    }

    await deleteReport(reportId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {reports.length}{" "}
            {reports.length === 1 ? "relatório criado" : "relatórios criados"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          disabled={validPlansCount === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl shadow transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{ backgroundColor: PRIMARY }}
        >
          <FilePlus2 size={16} />
          Add Report
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <BarChart2 size={48} strokeWidth={1.2} />
          <p className="text-xl font-semibold text-slate-500">
            Nenhum report criado
          </p>
          <p className="text-sm text-slate-400 text-center max-w-md">
            Adicione um report para vincular um plano de testes e liberar os
            downloads de Resumo Executivo e Relatório Detalhado.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div
            className="grid text-[11px] font-bold uppercase tracking-widest text-slate-400 bg-gray-50 px-5 py-3 border-b border-gray-200"
            style={{ gridTemplateColumns: "120px 1.5fr 220px 170px 320px" }}
          >
            <span>ID</span>
            <span>Plano de Teste</span>
            <span>Progresso</span>
            <span>Criado em</span>
            <span className="text-center">Ações</span>
          </div>

          {rows.map(({ report, plan }) => {
            const executiveKey = `${report.id}-executive`;
            const evidenceKey = `${report.id}-evidence`;
            const { approvedPercent, passedSteps, totalSteps } =
              getApprovalProgress(plan);

            return (
              <div
                key={report.id}
                className="grid items-center px-5 py-4 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60 transition-colors"
                style={{ gridTemplateColumns: "120px 1.5fr 220px 170px 320px" }}
              >
                <span className="text-xs font-mono text-slate-400">
                  {report.id.slice(0, 8).toUpperCase()}
                </span>

                <div className="min-w-0 pr-4">
                  <p className="font-semibold text-slate-800 text-sm truncate">
                    {plan?.name ?? "Plano removido"}
                  </p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {plan
                      ? `${plan.scenarios.length} cenários`
                      : "O plano vinculado não está mais disponível na store."}
                  </p>
                </div>

                <div className="pr-4">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-xs text-slate-500">
                      {approvedPercent}% Approved
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {passedSteps}/{totalSteps} passos
                    </span>
                  </div>
                  <div className="bg-gray-200 h-2 w-full rounded-full overflow-hidden">
                    <div
                      className="bg-green-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${approvedPercent}%` }}
                    />
                  </div>
                </div>

                <span className="text-sm text-slate-500">
                  {new Date(report.createdAt).toLocaleString("pt-BR")}
                </span>

                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownload(report.id, report.testPlanId, "executive")
                    }
                    disabled={
                      !plan ||
                      downloading === evidenceKey ||
                      downloading === executiveKey
                    }
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <FileText size={15} style={{ color: PRIMARY }} />
                    {downloading === executiveKey ? "Gerando..." : "Executivo"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownload(report.id, report.testPlanId, "evidence")
                    }
                    disabled={
                      !plan ||
                      downloading === executiveKey ||
                      downloading === evidenceKey
                    }
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    <Files size={15} style={{ color: PRIMARY }} />
                    {downloading === evidenceKey ? "Gerando..." : "Detalhado"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(report.id)}
                    title="Excluir relatório"
                    className="inline-flex items-center justify-center p-2 rounded-lg border border-red-100 text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && <AddReportModal onClose={() => setShowModal(false)} />}
    </div>
  );
};
