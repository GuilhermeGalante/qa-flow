import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

const outputDirectory = "dist-desktop";
const forbidden = [
  "idb-keyval",
  "indexedDB",
  "sessionStorage",
  "showDirectoryPicker",
  "qaflow-v2-store",
  "qaflow-v2:evidence:",
  "qa-flow-sidebar-collapsed",
  "repositoryWorkspace",
];

function files(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const artifacts = files(outputDirectory).filter((path) => [".css", ".html", ".js"].includes(extname(path)));
const merged = artifacts.map((path) => readFileSync(path, "utf8")).join("\n");
const findings = forbidden.filter((value) => merged.includes(value));
const shellArtifacts = artifacts.filter((path) => !basename(path).startsWith("generatePdfReport-"));
const mergedShell = shellArtifacts.map((path) => readFileSync(path, "utf8")).join("\n");

// O renderer PDF inclui um shim de `util.deprecate` que apenas consulta flags de
// diagnóstico no localStorage. O shell e os adapters desktop continuam proibidos
// de usar Web Storage; a exceção fica contida no chunk lazy do gerador.
if (mergedShell.includes("localStorage")) findings.push("localStorage");

if (!merged.includes("qaflow-desktop-sqlite")) {
  findings.push("marcador da composição desktop ausente");
}

if (findings.length) {
  console.error(`Bundle desktop inválido: ${findings.join(", ")}`);
  process.exit(1);
}

console.log(`Bundle desktop isolado: ${artifacts.length} artefato(s) verificados, sem adapters de storage web.`);
