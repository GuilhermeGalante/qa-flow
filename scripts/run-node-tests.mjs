import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const modes = new Set(["all", "unit", "contract", "integration"]);
const mode = process.argv[2] ?? "all";

if (!modes.has(mode)) {
  console.error(`Modo desconhecido: ${mode}. Use all, unit, contract ou integration.`);
  process.exit(2);
}

async function collectTests(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTests(candidate));
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) files.push(candidate);
  }
  return files;
}

function category(file) {
  const normalized = file.replaceAll("\\", "/");
  if (normalized.endsWith(".contract.test.ts") || normalized.endsWith("/tauriAdapters.test.ts")) {
    return "contract";
  }
  if (normalized.endsWith(".integration.test.ts") || normalized.endsWith("/qaApplicationServices.test.ts")) {
    return "integration";
  }
  return "unit";
}

const files = [
  ...await collectTests(path.resolve("src")),
  ...await collectTests(path.resolve("tests")),
].sort((left, right) => left.localeCompare(right));

const selected = mode === "all" ? files : files.filter((file) => category(file) === mode);
if (!selected.length) {
  console.error(`Nenhum teste encontrado para a categoria ${mode}.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...selected], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

