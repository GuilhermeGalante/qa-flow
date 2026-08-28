import type { EvidenceMeta, WorkspaceBundle, WorkspaceSettings } from "../domain/types";

interface WorkspaceManifest {
  schemaVersion: 2;
  exportedAt: string;
  settings: WorkspaceSettings;
  cases: { id: string; revision: number; file: string }[];
  plans: { id: string; revision: number; file: string }[];
  runs: { id: string; file: string }[];
  reports: { id: string; file: string }[];
  demandColumns?: { id: string; file: string }[];
  demands?: { id: string; file: string }[];
  evidence: { meta: EvidenceMeta; file: string }[];
}

let repositoryHandle: FileSystemDirectoryHandle | null = null;

function safeFileName(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function subdirectory(root: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(name, { create: true });
}

async function writeFile(directory: FileSystemDirectoryHandle, name: string, content: string | Uint8Array): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  await writer.write(content as unknown as FileSystemWriteChunkType);
  await writer.close();
}

async function writeJson(directory: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
  await writeFile(directory, name, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T> {
  const handle = await directory.getFileHandle(name);
  return JSON.parse(await (await handle.getFile()).text()) as T;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(",", 2)[1] ?? "";
  const decoded = atob(encoded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function bytesDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function repositoryApiAvailable(): boolean {
  return typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export async function connectRepository(): Promise<string> {
  const picker = (window as Window & { showDirectoryPicker?: (options?: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error("Seu navegador não oferece acesso seguro a diretórios. Use um navegador Chromium ou o backup JSON.");
  repositoryHandle = await picker({ mode: "readwrite" });
  return repositoryHandle.name;
}

export function connectedRepositoryName(): string | null {
  return repositoryHandle?.name ?? null;
}

function requireRepository(): FileSystemDirectoryHandle {
  if (!repositoryHandle) throw new Error("Conecte a pasta do repositório antes de sincronizar.");
  return repositoryHandle;
}

export async function writeRepositoryWorkspace(bundle: WorkspaceBundle): Promise<void> {
  const root = await subdirectory(requireRepository(), ".qaflow");
  const casesDirectory = await subdirectory(root, "cases");
  const plansDirectory = await subdirectory(root, "plans");
  const runsDirectory = await subdirectory(root, "runs");
  const reportsDirectory = await subdirectory(root, "reports");
  const demandsDirectory = await subdirectory(root, "demands");
  const evidenceDirectory = await subdirectory(root, "evidence");
  const manifest: WorkspaceManifest = {
    schemaVersion: 2,
    exportedAt: bundle.exportedAt,
    settings: bundle.settings,
    cases: [],
    plans: [],
    runs: [],
    reports: [],
    demandColumns: [],
    demands: [],
    evidence: [],
  };

  for (const testCase of [...bundle.cases].sort((left, right) => left.id.localeCompare(right.id))) {
    const file = `${safeFileName(testCase.id)}.r${testCase.revision}.json`;
    await writeJson(casesDirectory, file, testCase);
    manifest.cases.push({ id: testCase.id, revision: testCase.revision, file });
  }
  for (const plan of [...bundle.plans].sort((left, right) => left.id.localeCompare(right.id))) {
    const file = `${safeFileName(plan.id)}.r${plan.revision}.json`;
    await writeJson(plansDirectory, file, plan);
    manifest.plans.push({ id: plan.id, revision: plan.revision, file });
  }
  for (const run of [...bundle.runs].sort((left, right) => left.id.localeCompare(right.id))) {
    const file = `${safeFileName(run.id)}.json`;
    await writeJson(runsDirectory, file, run);
    manifest.runs.push({ id: run.id, file });
  }
  for (const report of [...bundle.reports].sort((left, right) => left.id.localeCompare(right.id))) {
    const file = `${safeFileName(report.id)}.json`;
    await writeJson(reportsDirectory, file, report);
    manifest.reports.push({ id: report.id, file });
  }
  for (const column of [...(bundle.demandColumns ?? [])].sort((left, right) => left.order - right.order)) {
    const file = `column-${safeFileName(column.id)}.json`;
    await writeJson(demandsDirectory, file, column);
    manifest.demandColumns?.push({ id: column.id, file });
  }
  for (const demand of [...(bundle.demands ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    const file = `${safeFileName(demand.id)}.json`;
    await writeJson(demandsDirectory, file, demand);
    manifest.demands?.push({ id: demand.id, file });
  }
  for (const item of [...bundle.evidence].sort((left, right) => left.meta.id.localeCompare(right.meta.id))) {
    const file = `${safeFileName(item.meta.id)}.${extensionForMime(item.meta.mimeType)}`;
    await writeFile(evidenceDirectory, file, dataUrlBytes(item.dataUrl));
    manifest.evidence.push({ meta: item.meta, file });
  }

  // O manifesto é gravado por último: ele funciona como o commit determinístico do workspace.
  await writeJson(root, "workspace.json", manifest);
}

export async function readRepositoryWorkspace(): Promise<WorkspaceBundle> {
  const root = await subdirectory(requireRepository(), ".qaflow");
  const casesDirectory = await subdirectory(root, "cases");
  const plansDirectory = await subdirectory(root, "plans");
  const runsDirectory = await subdirectory(root, "runs");
  const reportsDirectory = await subdirectory(root, "reports");
  const demandsDirectory = await subdirectory(root, "demands");
  const evidenceDirectory = await subdirectory(root, "evidence");
  const manifest = await readJson<WorkspaceManifest>(root, "workspace.json");
  if (manifest.schemaVersion !== 2) throw new Error("Versão do workspace de repositório não suportada.");

  const cases = [];
  for (const item of manifest.cases) cases.push(await readJson<WorkspaceBundle["cases"][number]>(casesDirectory, item.file));
  const plans = [];
  for (const item of manifest.plans) plans.push(await readJson<WorkspaceBundle["plans"][number]>(plansDirectory, item.file));
  const runs = [];
  for (const item of manifest.runs) runs.push(await readJson<WorkspaceBundle["runs"][number]>(runsDirectory, item.file));
  const reports = [];
  for (const item of manifest.reports) reports.push(await readJson<WorkspaceBundle["reports"][number]>(reportsDirectory, item.file));
  const demandColumns: NonNullable<WorkspaceBundle["demandColumns"]> = [];
  for (const item of manifest.demandColumns ?? []) demandColumns.push(await readJson<NonNullable<WorkspaceBundle["demandColumns"]>[number]>(demandsDirectory, item.file));
  const demands: NonNullable<WorkspaceBundle["demands"]> = [];
  for (const item of manifest.demands ?? []) demands.push(await readJson<NonNullable<WorkspaceBundle["demands"]>[number]>(demandsDirectory, item.file));
  const evidence: WorkspaceBundle["evidence"] = [];
  for (const item of manifest.evidence) {
    const file = await (await evidenceDirectory.getFileHandle(item.file)).getFile();
    evidence.push({ meta: item.meta, dataUrl: bytesDataUrl(new Uint8Array(await file.arrayBuffer()), item.meta.mimeType) });
  }
  return { schemaVersion: 2, exportedAt: manifest.exportedAt, settings: manifest.settings, cases, plans, runs, reports, demandColumns, demands, evidence };
}
