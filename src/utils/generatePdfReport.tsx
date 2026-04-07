import { pdf } from "@react-pdf/renderer";
import { ExecutiveSummaryDocument } from "./ExecutiveSummaryDocument";
import { TechnicalReportDocument } from "./TechnicalReportDocument";
import type { TestPlan } from "../types";

// ── Utilitário interno ────────────────────────────────────────────────────────

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
  const blob = await pdf(element).toBlob();
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

export async function generateExecutiveSummary(plan: TestPlan): Promise<void> {
  try {
    const safe = safeName(plan.name);
    await downloadPdf(
      <ExecutiveSummaryDocument plan={plan} />,
      `QAFlow_Resumo_Executivo_${safe}.pdf`,
    );
  } catch (err) {
    console.error("[generateExecutiveSummary]", err);
    alert("Erro ao gerar o Resumo Executivo. Veja o console para detalhes.");
  }
}

// ── PDF 2: Relatório Técnico de Evidências (passos + imagens) ─────────────────

export async function generateEvidenceReport(plan: TestPlan): Promise<void> {
  try {
    const safe = safeName(plan.name);
    await downloadPdf(
      <TechnicalReportDocument plan={plan} />,
      `QAFlow_Relatorio_Tecnico_${safe}.pdf`,
    );
  } catch (err) {
    console.error("[generateEvidenceReport]", err);
    alert("Erro ao gerar o Relatório Técnico. Veja o console para detalhes.");
  }
}
