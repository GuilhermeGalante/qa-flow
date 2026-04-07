import React, { useState } from "react";
import { X, FilePlus2, AlertCircle } from "lucide-react";
import { useTestStore } from "../../store/useTestStore";

const PRIMARY = "#5A9EB7";

interface Props {
  onClose: () => void;
}

export const AddReportModal: React.FC<Props> = ({ onClose }) => {
  const plans = useTestStore((state) => state.plans);
  const addReport = useTestStore((state) => state.addReport);
  const validPlans = plans.filter((plan) => plan.scenarios.length > 0);

  const [selectedPlanId, setSelectedPlanId] = useState(validPlans[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  const selectedPlan =
    validPlans.find((plan) => plan.id === selectedPlanId) ?? null;

  const handleSave = async () => {
    if (!selectedPlanId || saving) return;

    setSaving(true);
    await addReport({
      id: crypto.randomUUID(),
      testPlanId: selectedPlanId,
      createdAt: new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FilePlus2 size={18} style={{ color: PRIMARY }} />
            <h2 className="font-bold text-slate-800 text-base">Add Report</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Plano de Teste
            </p>
            <p className="text-sm text-slate-400 mt-1">
              Apenas planos com pelo menos um cenário aparecem na lista.
            </p>
          </div>

          {validPlans.length > 0 ? (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Selecione o plano
              </label>
              <select
                value={selectedPlanId}
                onChange={(event) => setSelectedPlanId(event.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 bg-white text-slate-800"
                style={{ "--tw-ring-color": PRIMARY } as React.CSSProperties}
              >
                {validPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>

              {selectedPlan && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p className="font-semibold text-slate-700">
                    {selectedPlan.name}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {selectedPlan.scenarios.length} cenários disponíveis para
                    geração de relatório.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 flex items-start gap-3 text-sm text-amber-800">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Nenhum plano elegível</p>
                <p className="mt-1">
                  Importe ou crie um plano com pelo menos um cenário antes de
                  adicionar um report.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedPlanId || saving}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:opacity-90"
            style={{ backgroundColor: PRIMARY }}
          >
            {saving ? "Salvando..." : "Save Report"}
          </button>
        </div>
      </div>
    </div>
  );
};
