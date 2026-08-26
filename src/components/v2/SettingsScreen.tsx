import { useRef, useState, type ChangeEvent } from "react";
import { Database, Download, FolderGit2, RefreshCw, Upload } from "lucide-react";
import type { WorkspaceBundle, WorkspaceMode } from "../../domain/types";
import { validateWorkspaceBundle } from "../../domain/validation";
import {
  connectRepository,
  connectedRepositoryName,
  readRepositoryWorkspace,
  repositoryApiAvailable,
  writeRepositoryWorkspace,
} from "../../storage/repositoryWorkspace";
import { useQaStore } from "../../store/useQaStore";
import { Notice, PageHeader, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "./Shared";

function downloadBundle(bundle: WorkspaceBundle): void {
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `qaflow-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SettingsScreen() {
  const settings = useQaStore((state) => state.settings);
  const cases = useQaStore((state) => state.cases);
  const plans = useQaStore((state) => state.plans);
  const runs = useQaStore((state) => state.runs);
  const evidence = useQaStore((state) => state.evidence);
  const migrationReport = useQaStore((state) => state.migrationReport);
  const storageError = useQaStore((state) => state.storageError);
  const updateSettings = useQaStore((state) => state.updateSettings);
  const exportWorkspace = useQaStore((state) => state.exportWorkspace);
  const importWorkspace = useQaStore((state) => state.importWorkspace);
  const [preview, setPreview] = useState<WorkspaceBundle | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [repositoryName, setRepositoryName] = useState(connectedRepositoryName());
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    setBusy(true);
    try {
      downloadBundle(await exportWorkspace());
      setMessage("Backup completo exportado, incluindo metadados e evidências.");
    } finally { setBusy(false); }
  };

  const readBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validation = validateWorkspaceBundle(parsed);
      if (!validation.ok || !validation.value) {
        setMessage(`Backup inválido: ${validation.issues.slice(0, 3).map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
        return;
      }
      setPreview(validation.value);
      setMessage("Backup validado. Escolha mesclar ou substituir.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ler o backup.");
    } finally { event.target.value = ""; }
  };

  const applyImport = async (mode: "merge" | "replace") => {
    if (!preview) return;
    if (mode === "replace" && !window.confirm("Substituir todo o workspace local? Exporte um backup antes se quiser preservar o estado atual.")) return;
    setBusy(true);
    try {
      const result = await importWorkspace(preview, mode);
      setMessage(result.message);
      if (result.ok) setPreview(null);
    } finally { setBusy(false); }
  };

  const connect = async () => {
    try {
      const name = await connectRepository();
      setRepositoryName(name);
      updateSettings({ mode: "repository", name, repositoryPath: `${name}/.qaflow` });
      setMessage(`Repositório “${name}” conectado nesta sessão.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível conectar a pasta."); }
  };

  const pushRepository = async () => {
    setBusy(true);
    try {
      await writeRepositoryWorkspace(await exportWorkspace());
      setMessage("Workspace gravado em .qaflow. O manifesto foi atualizado por último.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao gravar o repositório."); }
    finally { setBusy(false); }
  };

  const pullRepository = async () => {
    setBusy(true);
    try {
      const bundle = await readRepositoryWorkspace();
      const result = await importWorkspace(bundle, "merge");
      setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao ler o repositório."); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Configurações" description="Controle o workspace local, sincronize uma estrutura versionável e mantenha backups portáveis." />
      {storageError && <div className="mb-5"><Notice tone="error">{storageError}</Notice></div>}
      {message && <div className="mb-5"><Notice tone={message.toLowerCase().includes("falha") || message.toLowerCase().includes("inválido") ? "error" : "info"}>{message}</Notice></div>}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-cyan-50 p-2.5 text-cyan-700"><Database size={20} /></span><div><h2 className="font-black text-slate-950">Workspace</h2><p className="mt-1 text-sm text-slate-500">Escolha como os artefatos saem do navegador.</p></div></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {(["browser", "repository"] as WorkspaceMode[]).map((mode) => <button key={mode} type="button" onClick={() => updateSettings({ mode })} className={`rounded-xl border p-4 text-left ${settings.mode === mode ? "border-cyan-400 bg-cyan-50 ring-2 ring-cyan-100" : "border-slate-200"}`}><strong className="block text-sm text-slate-950">{mode === "browser" ? "Navegador" : "Repositório"}</strong><span className="mt-1 block text-xs text-slate-500">{mode === "browser" ? "IndexedDB, sem servidor." : "Arquivos determinísticos em .qaflow."}</span></button>)}
          </div>
          <label className="mt-4 block text-xs font-bold text-slate-600">Nome do workspace<input className={`${inputClass} mt-1`} value={settings.name} onChange={(event) => updateSettings({ name: event.target.value })} /></label>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700"><input type="checkbox" checked={settings.compactEvidence} onChange={(event) => updateSettings({ compactEvidence: event.target.checked })} className="mt-1 h-4 w-4 accent-cyan-600" /><span><strong className="block text-slate-950">Compactar novas evidências</strong><span className="mt-1 block text-xs text-slate-500">Reduz imagens para aliviar o IndexedDB e os backups. Desative apenas quando a resolução original for indispensável.</span></span></label>
          <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><strong className="text-slate-950">Estado atual</strong><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>{cases.length} caso(s)</span><span>{plans.length} plano(s)</span><span>{runs.length} execução(ões)</span><span>{evidence.length} evidência(s)</span></div></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><FolderGit2 size={20} /></span><div><h2 className="font-black text-slate-950">Adaptador de repositório</h2><p className="mt-1 text-sm text-slate-500">Casos e planos usam nomes revisionados; runs são imutáveis e o manifesto funciona como commit.</p></div></div>
          {!repositoryApiAvailable() && <div className="mt-4"><Notice tone="warning">A API segura de diretórios não está disponível neste navegador. O backup JSON continua funcional.</Notice></div>}
          <div className="mt-5 rounded-xl border border-slate-200 p-4"><p className="text-sm font-bold text-slate-900">{repositoryName ? `Conectado: ${repositoryName}` : "Nenhuma pasta conectada nesta sessão"}</p><p className="mt-1 text-xs text-slate-500">O navegador sempre solicita sua permissão para acessar a pasta.</p></div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={buttonSecondary} disabled={!repositoryApiAvailable() || busy} onClick={() => void connect()}><FolderGit2 size={16} /> Conectar pasta</button><button type="button" className={buttonPrimary} disabled={!repositoryName || busy} onClick={() => void pushRepository()}><Upload size={16} /> Gravar .qaflow</button><button type="button" className={buttonSecondary} disabled={!repositoryName || busy} onClick={() => void pullRepository()}><RefreshCw size={16} /> Mesclar da pasta</button></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="font-black text-slate-950">Backup e restauração</h2><p className="mt-1 text-sm text-slate-500">O backup é autocontido e validado antes de qualquer alteração.</p>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => void readBackup(event)} />
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={buttonPrimary} disabled={busy} onClick={() => void exportBackup()}><Download size={16} /> Exportar backup</button><button type="button" className={buttonSecondary} disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} /> Selecionar backup</button></div>
          {preview && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-black text-amber-950">Prévia validada</p><p className="mt-1 text-sm text-amber-900">{preview.cases.length} casos, {preview.plans.length} planos, {preview.runs.length} execuções, {preview.evidence.length} evidências.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonPrimary} onClick={() => void applyImport("merge")}>Mesclar por ID</button><button type="button" className={buttonDanger} onClick={() => void applyImport("replace")}>Substituir workspace</button><button type="button" className={buttonSecondary} onClick={() => setPreview(null)}>Cancelar</button></div></div>}
        </section>

        {migrationReport && <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 xl:col-span-2"><h2 className="font-black text-emerald-950">Migração v1 concluída</h2><p className="mt-1 text-sm text-emerald-900">Em {new Date(migrationReport.migratedAt).toLocaleString("pt-BR")}: {migrationReport.casesCreated} casos, {migrationReport.plansCreated} planos e {migrationReport.runsCreated} execuções.</p>{migrationReport.warnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-emerald-900">{migrationReport.warnings.slice(0, 10).map((warning) => <li key={warning}>{warning}</li>)}</ul>}</section>}
      </div>
    </>
  );
}
