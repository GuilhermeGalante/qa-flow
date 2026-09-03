import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { load as parseYaml } from "js-yaml";

const root = new URL("../", import.meta.url);
const temporary = mkdtempSync(join(tmpdir(), "qaflow-distribution-"));
try {
  for (const flavor of ["online", "offline"]) {
    const output = join(temporary, `${flavor}.json`);
    const result = spawnSync(
      process.execPath,
      ["scripts/prepare-desktop-release-config.mjs", "--flavor", flavor, "--output", output],
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
    assert.equal(config.bundle.createUpdaterArtifacts, true);
    assert.equal(config.bundle.windows.digestAlgorithm, "sha256");
    assert.equal(config.bundle.windows.certificateThumbprint, "A".repeat(40));
    assert.equal(
      config.bundle.windows.webviewInstallMode.type,
      flavor === "offline" ? "offlineInstaller" : "downloadBootstrapper",
    );
  }

  const workflow = readFileSync(new URL("../.github/workflows/desktop-alpha-release.yml", import.meta.url), "utf8");
  const parsedWorkflow = parseYaml(workflow);
  assert.equal(typeof parsedWorkflow, "object");
  assert.ok(parsedWorkflow.jobs?.["windows-alpha"], "job windows-alpha ausente");
  for (const marker of [
    "WINDOWS_CERTIFICATE_BASE64",
    "WINDOWS_CERTIFICATE_PASSWORD",
    "TAURI_SIGNING_PRIVATE_KEY",
    "QA_FLOW_UPDATER_PUBLIC_KEY",
    "Get-AuthenticodeSignature",
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
  console.log("Distribuição desktop: configurações online/offline, assinatura e updater verificados.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
