/*
 * Estas funções não exibem UI. Devolvem `OperationResult` para que a tela decida o canal
 * de feedback — antes, o `alert` de erro era seguido da mensagem de sucesso da própria
 * tela, porque o `catch` engolia a falha e a função retornava normalmente.
 */
import { pdf } from "@react-pdf/renderer";
import { ExecutiveSummaryDocument } from "./ExecutiveSummaryDocument";
import { TechnicalReportDocument } from "./TechnicalReportDocument";
import type { ApplicationResult } from "../app/commitCoordinator";
import type { PdfReportData } from "../domain/reporting";
import type { OperationResult } from "../domain/types";
import type { GeneratedFileRequest, TransferResult } from "../platform/contracts/dtos";

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

let logoDataUrlPromise: Promise<string> | null = null;

function brandLogoDataUrl(): Promise<string> {
  logoDataUrlPromise ??= fetch("/qa-flow-logo.png").then(async (response) => {
    if (!response.ok) throw new Error("Não foi possível carregar a logo do QA Flow.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${response.headers.get("content-type") ?? "image/png"};base64,${btoa(binary)}`;
  });
  return logoDataUrlPromise;
}

// ── PDF 1: Resumo Executivo (leve, sem steps detalhados e sem imagens) ────────

export async function generateExecutiveSummary(
  report: PdfReportData,
  saveGeneratedFile: GeneratedFileSaver,
): Promise<OperationResult> {
  try {
    const safe = safeName(report.planName);
    const logoSrc = await brandLogoDataUrl();
    const result = await savePdf(
      <ExecutiveSummaryDocument report={report} logoSrc={logoSrc} />,
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
  report: PdfReportData,
  saveGeneratedFile: GeneratedFileSaver,
): Promise<OperationResult> {
  try {
    const safe = safeName(report.planName);
    const logoSrc = await brandLogoDataUrl();
    const result = await savePdf(
      <TechnicalReportDocument report={report} logoSrc={logoSrc} />,
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
