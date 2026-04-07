// Status de execução de cada passo/cenário
// untested = estado inicial (nunca executado)
// paused   = execução interrompida temporariamente
export type RunStatus =
  | "untested"
  | "pending"
  | "passed"
  | "failed"
  | "blocked"
  | "paused";

// Prefixo BDD do passo
export type StepType = "Dado" | "Quando" | "Então" | "E";

// Um passo individual com prefixo BDD + ação + resultado esperado
export interface TestStep {
  id: string;
  type: StepType;
  action: string;
  expectedResult: string;
  status: RunStatus;
  comment?: string;
  evidence?: string; // Base64 da imagem de evidência (capturada ao reprovar)
}

// Um cenário agrupa uma ou mais linhas com seus steps
export interface TestScenario {
  id: string;
  title: string;
  subsection: string;
  suite: string;
  initialStatus: string;
  priority: string;
  reference: string;
  caseId: string;
  precondition: string;
  status: RunStatus;
  steps: TestStep[];
}

// Metadados do plano
export interface PlanMeta {
  project: string;
  section: string;
  createdBy: string;
  createdAt: string;
}

// Plano de testes completo
export interface TestPlan {
  id: string;
  name: string;
  description: string;
  meta: PlanMeta;
  scenarios: TestScenario[];
  createdAt: string;
}

// Registro de relatório gerado a partir de um plano de testes.
export interface Report {
  id: string;
  testPlanId: string;
  createdAt: string;
}
