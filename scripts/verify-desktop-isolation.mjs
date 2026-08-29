import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const outputDirectory = "dist-desktop";
const forbidden = [
  "idb-keyval",
  "indexedDB",
  "localStorage",
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

if (!merged.includes("qaflow-desktop-sqlite")) {
  findings.push("marcador da composição desktop ausente");
}

if (findings.length) {
  console.error(`Bundle desktop inválido: ${findings.join(", ")}`);
  process.exit(1);
}

console.log(`Bundle desktop isolado: ${artifacts.length} artefato(s) verificados, sem adapters de storage web.`);
