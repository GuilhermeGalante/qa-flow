import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const strict = process.argv.includes("--strict");
const checks = [];

function command(command, args = []) {
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\r?\n/)[0] ?? "",
  };
}

function add(name, ok, detail, required = true) {
  checks.push({ name, ok, detail, required });
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
add("Node.js 24", nodeMajor === 24, `v${process.versions.node}`);

const npmVersion = process.env.npm_config_user_agent?.match(/npm\/(\d+\.\d+\.\d+)/)?.[1];
const npm = npmVersion ? { ok: true, output: npmVersion } : command("npm", ["--version"]);
add("npm 11", npm.ok && npm.output.startsWith("11."), npm.output || "não encontrado");

try {
  const tauriPackage = JSON.parse(readFileSync("node_modules/@tauri-apps/cli/package.json", "utf8"));
  add("Tauri CLI 2", String(tauriPackage.version).startsWith("2."), `v${tauriPackage.version}`);
} catch {
  add("Tauri CLI 2", false, "execute npm ci");
}

const rustc = command("rustc", ["--version"]);
add("Rust 1.98", rustc.ok && rustc.output.includes("1.98."), rustc.output || "não encontrado");

const cargo = command("cargo", ["--version"]);
add("Cargo", cargo.ok, cargo.output || "não encontrado");

add(
  "Alvo Windows x64",
  process.platform === "win32" && process.arch === "x64",
  `${process.platform}/${process.arch}`,
);

const programFilesX86 = process.env["ProgramFiles(x86)"];
const vswhere = programFilesX86 ? join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe") : "";
let msvcDetail = "não encontrado";
let msvcOk = false;
if (vswhere && existsSync(vswhere)) {
  const result = command(vswhere, [
    "-latest",
    "-products",
    "*",
    "-requires",
    "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "-property",
    "installationPath",
  ]);
  msvcOk = result.ok && Boolean(result.output);
  msvcDetail = result.output || msvcDetail;
} else {
  const cl = command("cl", []);
  msvcOk = cl.ok;
  msvcDetail = cl.output || msvcDetail;
}
add("MSVC Build Tools", msvcOk, msvcDetail);

const webviewRoots = [
  process.env.ProgramFiles && join(process.env.ProgramFiles, "Microsoft", "EdgeWebView", "Application"),
  programFilesX86 && join(programFilesX86, "Microsoft", "EdgeWebView", "Application"),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Microsoft", "EdgeWebView", "Application"),
].filter(Boolean);
const webviewRoot = webviewRoots.find((candidate) => existsSync(candidate));
let webviewVersion = "não encontrado";
if (webviewRoot) {
  const version = readdirSync(webviewRoot).find((entry) => /^\d+\.\d+\.\d+\.\d+$/.test(entry));
  webviewVersion = version ?? webviewRoot;
}
add("Microsoft Edge WebView2", Boolean(webviewRoot), webviewVersion);

console.log("QA Flow Desktop doctor (somente leitura)\n");
for (const check of checks) {
  console.log(`${check.ok ? "[ok]" : check.required ? "[erro]" : "[aviso]"} ${check.name}: ${check.detail}`);
}

const failures = checks.filter((check) => check.required && !check.ok);
if (failures.length) {
  console.log("\nInstale/corrija os itens marcados antes de executar o gate desktop completo.");
  if (strict) process.exitCode = 1;
} else {
  console.log("\nToolchain pronta para o gate desktop.");
}
