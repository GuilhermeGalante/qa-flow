/*
 * Estas funções não exibem UI. Devolvem `OperationResult` para que a tela decida o canal
 * de feedback — antes, o `alert` de erro era seguido da mensagem de sucesso da própria
 * tela, porque o `catch` engolia a falha e a função retornava normalmente.
 */
import { pdf } from "@react-pdf/renderer";
import { ExecutiveSummaryDocument } from "./ExecutiveSummaryDocument";
import { TechnicalReportDocument } from "./TechnicalReportDocument";
import type { ApplicationResult } from "../app/commitCoordinator";
import type { OperationResult } from "../domain/types";
import type { GeneratedFileRequest, TransferResult } from "../platform/contracts/dtos";
import type { TestPlan } from "../types";

export type GeneratedFileSaver = (
  request: GeneratedFileRequest,
  bytes: Uint8Array,
) => Promise<ApplicationResult<TransferResult>>;

// ── Utilitário interno ────────────────────────────────────────────────────────

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "erro desconhecido.";
}

function safeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40);
}

async function savePdf(
  element: React.ReactElement,
  filename: string,
  saveGeneratedFile: GeneratedFileSaver,
): Promise<ApplicationResult<TransferResult>> {
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  return saveGeneratedFile(
    { suggestedName: filename, mimeType: "application/pdf", extension: ".pdf" },
    new Uint8Array(await blob.arrayBuffer()),
  );
}

// ── PDF 1: Resumo Executivo (leve, sem steps detalhados e sem imagens) ────────

export async function generateExecutiveSummary(
  plan: TestPlan,
  saveGeneratedFile: GeneratedFileSaver,
): Promise<OperationResult> {
  try {
    const safe = safeName(plan.name);
    const result = await savePdf(
      <ExecutiveSummaryDocument plan={plan} />,
      `QAFlow_Resumo_Executivo_${safe}.pdf`,
      saveGeneratedFile,
    );
    return result.ok
      ? { ok: true, message: "Resumo executivo gerado e salvo." }
      : { ok: false, message: result.message };
  } catch (err) {
    console.error("[generateExecutiveSummary]", err);
    return { ok: false, message: `Falha ao gerar o resumo executivo: ${describe(err)}` };
  }
}

// ── PDF 2: Relatório Técnico de Evidências (passos + imagens) ─────────────────

export async function generateEvidenceReport(
  plan: TestPlan,
  saveGeneratedFile: GeneratedFileSaver,
): Promise<OperationResult> {
  try {
    const safe = safeName(plan.name);
    const result = await savePdf(
      <TechnicalReportDocument plan={plan} />,
      `QAFlow_Relatorio_Tecnico_${safe}.pdf`,
      saveGeneratedFile,
    );
    return result.ok
      ? { ok: true, message: "Relatório técnico gerado e salvo." }
      : { ok: false, message: result.message };
  } catch (err) {
    console.error("[generateEvidenceReport]", err);
    return { ok: false, message: `Falha ao gerar o relatório técnico: ${describe(err)}` };
  }
}
