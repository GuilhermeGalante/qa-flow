import { readFileSync } from "node:fs";

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function capture(path, pattern, label) {
  const match = readFileSync(path, "utf8").match(pattern);
  if (!match) throw new Error(`Não foi possível ler ${label} em ${path}.`);
  return match[1];
}

const packageJson = json("package.json");
const packageLock = json("package-lock.json");
const tauriConfig = json("src-tauri/tauri.conf.json");
const versions = new Map([
  ["package.json", packageJson.version],
  ["package-lock.json", packageLock.version],
  ["package-lock.json packages raiz", packageLock.packages?.[""]?.version],
  ["src/version.ts", capture("src/version.ts", /APP_VERSION\s*=\s*"([^"]+)"/, "APP_VERSION")],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  ["src-tauri/Cargo.toml", capture("src-tauri/Cargo.toml", /\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m, "package.version")],
  ["src-tauri/Cargo.lock", capture("src-tauri/Cargo.lock", /\[\[package\]\]\s*\r?\nname\s*=\s*"qaflow"\s*\r?\nversion\s*=\s*"([^"]+)"/, "versão do pacote qaflow")],
]);

const expected = packageJson.version;
const divergent = [...versions].filter(([, version]) => version !== expected);
if (divergent.length) {
  console.error("Versões de release divergentes:");
  for (const [target, version] of versions) console.error(`- ${target}: ${version ?? "ausente"}`);
  process.exit(1);
}

const tagIndex = process.argv.indexOf("--tag");
const suppliedTag = tagIndex >= 0 ? process.argv[tagIndex + 1] : undefined;
const expectedTag = `v${expected}`;
if (suppliedTag && suppliedTag !== expectedTag) {
  console.error(`Tag ${suppliedTag} não corresponde à versão ${expected}; esperado ${expectedTag}.`);
  process.exit(1);
}

console.log(`Versão sincronizada em ${versions.size} alvos: ${expected}${suppliedTag ? ` (${suppliedTag})` : ""}.`);

