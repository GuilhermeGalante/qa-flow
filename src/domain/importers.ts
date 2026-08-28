import { QA_FLOW_SCHEMA_VERSION, type CaseDefinition, type CasePriority, type StepType } from "./types.ts";
import { createId, normalizePath } from "./validation.ts";

export type CsvRecord = Record<string, string | undefined>;

function field(row: CsvRecord, ...names: string[]): string {
  for (const name of names) {
    const exact = row[name];
    if (typeof exact === "string" && exact.trim()) return exact.trim();
    const key = Object.keys(row).find((candidate) => candidate.trim().toLowerCase() === name.toLowerCase());
    const value = key ? row[key] : undefined;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function priority(value: string): CasePriority {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (["critical", "critica", "critico", "p0"].includes(normalized)) return "critical";
  if (["high", "alta", "alto", "p1"].includes(normalized)) return "high";
  if (["low", "baixa", "baixo", "p3"].includes(normalized)) return "low";
  return "medium";
}

function stepType(value: string): StepType {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (["given", "dado"].includes(normalized)) return "given";
  if (["then", "entao"].includes(normalized)) return "then";
  if (["and", "e"].includes(normalized)) return "and";
  return "when";
}

export function parseCsvCases(rows: CsvRecord[], now = new Date().toISOString()): CaseDefinition[] {
  const cases: CaseDefinition[] = [];
  let current: CaseDefinition | null = null;

  for (const row of rows) {
    const title = field(row, "Title", "Título", "Titulo", "Case", "Caso");
    if (title) {
      current = {
        schemaVersion: QA_FLOW_SCHEMA_VERSION,
        id: field(row, "Case ID", "CaseId", "ID") || createId("TC"),
        revision: 1,
        title,
        description: field(row, "Description", "Descrição", "Descricao"),
        path: normalizePath([
          field(row, "Project", "Projeto"),
          field(row, "Suite", "Suíte", "Suite de teste"),
          field(row, "Section", "Seção", "Secao"),
          field(row, "Subsection", "Subseção", "Subsecao"),
        ]),
        priority: priority(field(row, "Priority", "Prioridade", "Custom field 1")),
        status: "active",
        tags: [],
        precondition: field(row, "Precondition", "Pré-condição", "Precondição", "Precondicao"),
        steps: [],
        automationLinks: [],
        externalReferences: field(row, "Reference", "Referência", "Referencia")
          ? [{ system: "CSV", value: field(row, "Reference", "Referência", "Referencia") }]
          : [],
        createdAt: now,
        updatedAt: now,
      };
      cases.push(current);
    }

    const action = field(row, "Action", "Ação", "Acao", "Step", "Passo");
    if (current && action) {
      current.steps.push({
        id: createId("STEP"),
        type: stepType(field(row, "Type", "Tipo", "BDD")),
        action,
        expectedResult: field(row, "Expected result", "Expected Result", "Resultado esperado", "Resultado Esperado"),
      });
    }
  }

  return cases;
}
