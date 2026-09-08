import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { load as parseYaml } from "js-yaml";

const root = new URL("../", import.meta.url);
const temporary = mkdtempSync(join(tmpdir(), "qaflow-distribution-"));
const powershellParseCommand = [
  "$source = [Console]::In.ReadToEnd()",
  "$tokens = $null",
  "$errors = $null",
  "[System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors) | Out-Null",
  "if ($errors.Count -gt 0) {",
  "  [Console]::Error.WriteLine(($errors | ForEach-Object { $_.Message }) -join [Environment]::NewLine)",
  "  exit 1",
  "}",
].join("\n");
const installLocationProbeCommand = [
  "$rawInstallDirectory = [Console]::In.ReadToEnd()",
  "$installDirectory = [Environment]::ExpandEnvironmentVariables($rawInstallDirectory.Trim()).Trim('\"')",
  "if ([string]::IsNullOrWhiteSpace($installDirectory) -or -not [IO.Path]::IsPathFullyQualified($installDirectory)) { exit 1 }",
  "[Console]::Out.Write([IO.Path]::GetFullPath($installDirectory))",
].join("\n");
try {
  for (const signing of ["signed", "unsigned"]) {
    for (const flavor of ["online", "offline"]) {
      const output = join(temporary, `${signing}-${flavor}.json`);
      const result = spawnSync(
        process.execPath,
        [
          "scripts/prepare-desktop-release-config.mjs",
          "--flavor",
          flavor,
          "--signing",
          signing,
          "--output",
          output,
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            QA_FLOW_WINDOWS_CERT_THUMBPRINT: "A".repeat(40),
            QA_FLOW_WINDOWS_TIMESTAMP_URL: "https://timestamp.example.test/",
          },
        },
      );
      assert.equal(result.status, 0, result.stderr);
      const config = JSON.parse(readFileSync(output, "utf8"));
      assert.equal(config.bundle.createUpdaterArtifacts, signing === "signed");
      assert.equal(
        config.bundle.windows.webviewInstallMode.type,
        flavor === "offline" ? "offlineInstaller" : "downloadBootstrapper",
      );
      if (signing === "signed") {
        assert.equal(config.bundle.windows.digestAlgorithm, "sha256");
        assert.equal(config.bundle.windows.certificateThumbprint, "A".repeat(40));
      } else {
        assert.equal(config.bundle.windows.digestAlgorithm, undefined);
        assert.equal(config.bundle.windows.certificateThumbprint, undefined);
        assert.equal(config.bundle.windows.timestampUrl, undefined);
      }
    }
  }

  const workflow = readFileSync(new URL("../.github/workflows/desktop-alpha-release.yml", import.meta.url), "utf8");
  const parsedWorkflow = parseYaml(workflow);
  assert.equal(typeof parsedWorkflow, "object");
  assert.ok(parsedWorkflow.jobs?.["windows-alpha"], "job windows-alpha ausente");
  const powershellSteps = parsedWorkflow.jobs["windows-alpha"].steps.filter(
    (step) => step.shell === "pwsh" && typeof step.run === "string",
  );
  assert.ok(powershellSteps.length > 0, "workflow sem blocos PowerShell para validar");
  for (const step of powershellSteps) {
    const powershellSource = step.run.replace(/\$\{\{[\s\S]*?\}\}/g, "github_expression");
    const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", powershellParseCommand], {
      cwd: root,
      encoding: "utf8",
      input: powershellSource,
    });
    assert.equal(result.status, 0, `PowerShell inválido em ${step.name}: ${result.stderr}`);
  }
  const quotedInstallLocation = '"C:\\Users\\runneradmin\\AppData\\Local\\QA Flow"';
  const installLocationProbe = spawnSync(
    "pwsh",
    ["-NoProfile", "-NonInteractive", "-Command", installLocationProbeCommand],
    {
      cwd: root,
      encoding: "utf8",
      input: quotedInstallLocation,
    },
  );
  assert.equal(installLocationProbe.status, 0, installLocationProbe.stderr);
  assert.equal(installLocationProbe.stdout, quotedInstallLocation.slice(1, -1));
  for (const marker of [
    "WINDOWS_CERTIFICATE_BASE64",
    "WINDOWS_CERTIFICATE_PASSWORD",
    "TAURI_SIGNING_PRIVATE_KEY",
    "QA_FLOW_UPDATER_PUBLIC_KEY",
    "signing=unsigned",
    "Get-AuthenticodeSignature",
    "ExpandEnvironmentVariables",
    "IsPathFullyQualified",
    "Smoke test de instalação",
    "distribution-preservation.marker",
    "latest.json",
    "publish_stable",
    "offlineInstaller",
  ]) {
    assert.match(workflow, new RegExp(marker), `workflow sem ${marker}`);
  }

  const cargo = readFileSync(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
  assert.match(cargo, /tauri-plugin-updater\s*=\s*"2"/);
  const rust = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(rust, /async fn update_check/);
  assert.match(rust, /async fn update_install/);
  const tauriConfig = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  assert.equal(tauriConfig.bundle.windows.allowDowngrades, false);
  console.log("Distribuição desktop: modos assinado e sem assinatura verificados.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
