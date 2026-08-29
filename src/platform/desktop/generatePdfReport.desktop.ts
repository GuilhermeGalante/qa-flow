import type { OperationResult } from "../../domain/types";
import type { TestPlan } from "../../types";

function nativeFilesPending(): OperationResult {
  return {
    ok: false,
    message: "A gravação de PDF no desktop será habilitada com os diálogos nativos da fase de arquivos.",
  };
}

export async function generateExecutiveSummary(plan: TestPlan): Promise<OperationResult> {
  void plan;
  return nativeFilesPending();
}

export async function generateEvidenceReport(plan: TestPlan): Promise<OperationResult> {
  void plan;
  return nativeFilesPending();
}
