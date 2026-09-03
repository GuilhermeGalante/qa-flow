import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const flavor = argument("--flavor");
const output = argument("--output");
if (flavor !== "online" && flavor !== "offline") {
  throw new Error("Use --flavor online ou --flavor offline.");
}
if (!output) throw new Error("Use --output <arquivo.json>.");

const certificateThumbprint = process.env.QA_FLOW_WINDOWS_CERT_THUMBPRINT?.replaceAll(" ", "").toUpperCase();
if (!certificateThumbprint || !/^[A-F0-9]{40}$/.test(certificateThumbprint)) {
  throw new Error("QA_FLOW_WINDOWS_CERT_THUMBPRINT deve conter o thumbprint SHA-1 de 40 caracteres do certificado importado.");
}
const timestampUrl = process.env.QA_FLOW_WINDOWS_TIMESTAMP_URL;
let parsedTimestamp;
try {
  parsedTimestamp = new URL(timestampUrl ?? "");
} catch {
  throw new Error("QA_FLOW_WINDOWS_TIMESTAMP_URL deve ser uma URL HTTPS válida.");
}
if (parsedTimestamp.protocol !== "https:") {
  throw new Error("QA_FLOW_WINDOWS_TIMESTAMP_URL deve usar HTTPS.");
}

const config = {
  bundle: {
    createUpdaterArtifacts: true,
    windows: {
      certificateThumbprint,
      digestAlgorithm: "sha256",
      timestampUrl: parsedTimestamp.toString(),
      webviewInstallMode: {
        type: flavor === "offline" ? "offlineInstaller" : "downloadBootstrapper",
        silent: true,
      },
    },
  },
};

const destination = resolve(output);
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(destination);
