import { QA_FLOW_SCHEMA_VERSION, type CaseDefinition } from "../../domain/types";
import { createId } from "../../domain/validation";

export function createBlankCase(): CaseDefinition {
  const now = new Date().toISOString();
  return {
    schemaVersion: QA_FLOW_SCHEMA_VERSION,
    id: createId("TC"),
    revision: 1,
    title: "",
    description: "",
    path: [],
    priority: "medium",
    status: "active",
    tags: [],
    precondition: "",
    steps: [{ id: createId("STEP"), type: "given", action: "", expectedResult: "" }],
    automationLinks: [],
    externalReferences: [],
    createdAt: now,
    updatedAt: now,
  };
}
