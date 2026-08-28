/*
 * Estas funções não exibem UI. Devolvem `OperationResult` para que a tela decida o canal
 * de feedback — antes, o `alert` de erro era seguido da mensagem de sucesso da própria
 * tela, porque o `catch` engolia a falha e a função retornava normalmente.
 */
import { pdf } from "@react-pdf/renderer";
import { ExecutiveSummaryDocument } from "./ExecutiveSummaryDocument";
import { TechnicalReportDocument } from "./TechnicalReportDocument";
import type { OperationResult } from "../domain/types";
import type { TestPlan } from "../types";

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

async function downloadPdf(
  element: React.ReactElement,
  filename: string,
): Promise<void> {
  const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
  const url = URL.createObjectURL(blob);

  // Cria o link fora do DOM principal para evitar navegação no browser
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // rel="noopener" garante que o browser não abra o blob inline
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoga após 60 s — tempo suficiente para o download iniciar,
  // mas sem manter o objectURL (que causaria "Loading document...")
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── PDF 1: Resumo Executivo (leve, sem steps detalhados e sem imagens) ────────

export async function generateExecutiveSummary(plan: TestPlan): Promise<OperationResult> {
  try {
    const safe = safeName(plan.name);
    await downloadPdf(
      <ExecutiveSummaryDocument plan={plan} />,
      `QAFlow_Resumo_Executivo_${safe}.pdf`,
    );
    return { ok: true, message: "Resumo executivo gerado." };
  } catch (err) {
    console.error("[generateExecutiveSummary]", err);
    return { ok: false, message: `Falha ao gerar o resumo executivo: ${describe(err)}` };
  }
}

// ── PDF 2: Relatório Técnico de Evidências (passos + imagens) ─────────────────

export async function generateEvidenceReport(plan: TestPlan): Promise<OperationResult> {
  try {
    const safe = safeName(plan.name);
    await downloadPdf(
      <TechnicalReportDocument plan={plan} />,
      `QAFlow_Relatorio_Tecnico_${safe}.pdf`,
    );
    return { ok: true, message: "Relatório técnico gerado." };
  } catch (err) {
    console.error("[generateEvidenceReport]", err);
    return { ok: false, message: `Falha ao gerar o relatório técnico: ${describe(err)}` };
  }
}
