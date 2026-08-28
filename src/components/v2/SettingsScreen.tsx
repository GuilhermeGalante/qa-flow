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
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { useToast } from "../../ui/ToastProvider";
import { Notice, PageHeader, buttonDanger, buttonSecondary, inputClass } from "./Shared";

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
  const demands = useQaStore((state) => state.demands);
  const migrationReport = useQaStore((state) => state.migrationReport);
  const storageError = useQaStore((state) => state.storageError);
  const updateSettings = useQaStore((state) => state.updateSettings);
  const exportWorkspace = useQaStore((state) => state.exportWorkspace);
  const importWorkspace = useQaStore((state) => state.importWorkspace);
  const toast = useToast();
  const confirm = useConfirm();
  const [preview, setPreview] = useState<WorkspaceBundle | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | "push" | "pull" | "connect" | null>(null);
  const [repositoryName, setRepositoryName] = useState(connectedRepositoryName());
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    setBusy("export");
    try {
      downloadBundle(await exportWorkspace());
      toast.show({ tone: "success", message: "Backup completo exportado.", description: "Inclui metadados e evidências." });
    } catch (error) {
      toast.show({ tone: "error", message: "Falha ao exportar o backup.", description: error instanceof Error ? error.message : undefined });
    } finally { setBusy(null); }
  };

  const readBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const validation = validateWorkspaceBundle(parsed);
      if (!validation.ok || !validation.value) {
        toast.show({
          tone: "error",
          message: "Backup inválido.",
          description: validation.issues.slice(0, 3).map((issue) => `${issue.path} ${issue.message}`).join("; "),
        });
        return;
      }
      setPreview(validation.value);
    } catch (error) {
      toast.show({ tone: "error", message: "Não foi possível ler o backup.", description: error instanceof Error ? error.message : undefined });
    } finally { event.target.value = ""; }
  };

  const applyImport = async (mode: "merge" | "replace") => {
    if (!preview) return;
    if (mode === "replace") {
      // O usuário precisa ver o que perde, não só a palavra "substituir".
      const confirmed = await confirm({
        title: "Substituir todo o workspace local?",
        description: "O conteúdo atual deste dispositivo é descartado e trocado pelo backup. Exporte um backup antes se quiser preservá-lo.",
        impactTitle: "Será substituído",
        impact: [
          `${cases.length} caso(s) → ${preview.cases.length}`,
          `${plans.length} plano(s) → ${preview.plans.length}`,
          `${runs.length} execução(ões) → ${preview.runs.length}`,
          `${demands.length} demanda(s) → ${(preview.demands ?? []).length}`,
          `${evidence.length} evidência(s) → ${preview.evidence.length}`,
        ],
        confirmLabel: "Substituir workspace",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    setBusy("import");
    try {
      const result = await importWorkspace(preview, mode);
      toast.fromResult(result);
      if (result.ok) setPreview(null);
    } finally { setBusy(null); }
  };

  const connect = async () => {
    setBusy("connect");
    try {
      const name = await connectRepository();
      setRepositoryName(name);
      updateSettings({ mode: "repository", name, repositoryPath: `${name}/.qaflow` });
      toast.show({ tone: "success", message: `Repositório “${name}” conectado nesta sessão.` });
    } catch (error) {
      toast.show({ tone: "error", message: "Não foi possível conectar a pasta.", description: error instanceof Error ? error.message : undefined });
    } finally { setBusy(null); }
  };

  const pushRepository = async () => {
    setBusy("push");
    try {
      await writeRepositoryWorkspace(await exportWorkspace());
      toast.show({ tone: "success", message: "Workspace gravado em .qaflow.", description: "O manifesto foi atualizado por último." });
    } catch (error) {
      toast.show({ tone: "error", message: "Falha ao gravar o repositório.", description: error instanceof Error ? error.message : undefined });
    } finally { setBusy(null); }
  };

  const pullRepository = async () => {
    setBusy("pull");
    try {
      toast.fromResult(await importWorkspace(await readRepositoryWorkspace(), "merge"));
    } catch (error) {
      toast.show({ tone: "error", message: "Falha ao ler o repositório.", description: error instanceof Error ? error.message : undefined });
    } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Configurações" description="Controle o workspace local, sincronize uma estrutura versionável e mantenha backups portáveis." />
      {storageError && <div className="mb-5"><Notice tone="error" title="Problema de armazenamento">{storageError}</Notice></div>}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-run-tint p-2.5 text-run"><Database size={20} /></span><div><h2 className="font-bold text-body">Workspace</h2><p className="mt-1 text-sm text-muted">Escolha como os artefatos saem do navegador.</p></div></div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {(["browser", "repository"] as WorkspaceMode[]).map((mode) => <button key={mode} type="button" onClick={() => updateSettings({ mode })} className={`rounded-xl border p-4 text-left ${settings.mode === mode ? "border-run-accent bg-run-tint ring-2 ring-run-halo" : "border-hairline"}`}><strong className="block text-sm text-body">{mode === "browser" ? "Navegador" : "Repositório"}</strong><span className="mt-1 block text-xs text-muted">{mode === "browser" ? "IndexedDB, sem servidor." : "Arquivos determinísticos em .qaflow."}</span></button>)}
          </div>
          <label className="mt-4 block text-xs font-bold text-subtle">Nome do workspace<input className={`${inputClass} mt-1`} value={settings.name} onChange={(event) => updateSettings({ name: event.target.value })} /></label>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-hairline p-3 text-sm text-control"><input type="checkbox" checked={settings.compactEvidence} onChange={(event) => updateSettings({ compactEvidence: event.target.checked })} className="mt-1 h-4 w-4 accent-run" /><span><strong className="block text-body">Compactar novas evidências</strong><span className="mt-1 block text-xs text-muted">Reduz imagens para aliviar o IndexedDB e os backups. Desative apenas quando a resolução original for indispensável.</span></span></label>
          <div className="mt-5 rounded-xl bg-surface p-4 text-sm text-subtle"><strong className="text-body">Estado atual</strong><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>{cases.length} caso(s)</span><span>{plans.length} plano(s)</span><span>{runs.length} execução(ões)</span><span>{demands.length} demanda(s)</span><span>{evidence.length} evidência(s)</span></div></div>
        </section>

        <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-explore-tint p-2.5 text-explore"><FolderGit2 size={20} /></span><div><h2 className="font-bold text-body">Adaptador de repositório</h2><p className="mt-1 text-sm text-muted">Casos e planos usam nomes revisionados; runs são imutáveis e o manifesto funciona como commit.</p></div></div>
          {!repositoryApiAvailable() && <div className="mt-4"><Notice tone="warning">A API segura de diretórios não está disponível neste navegador. O backup JSON continua funcional.</Notice></div>}
          <div className="mt-5 rounded-xl border border-hairline p-4"><p className="text-sm font-bold text-body">{repositoryName ? `Conectado: ${repositoryName}` : "Nenhuma pasta conectada nesta sessão"}</p><p className="mt-1 text-xs text-muted">O navegador sempre solicita sua permissão para acessar a pasta.</p></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button loading={busy === "connect"} loadingLabel="Conectando…" disabled={!repositoryApiAvailable() || busy !== null} icon={<FolderGit2 size={16} />} onClick={() => void connect()}>Conectar pasta</Button>
            <Button variant="primary" loading={busy === "push"} loadingLabel="Gravando…" disabled={!repositoryName || busy !== null} icon={<Upload size={16} />} onClick={() => void pushRepository()}>Gravar .qaflow</Button>
            <Button loading={busy === "pull"} loadingLabel="Mesclando…" disabled={!repositoryName || busy !== null} icon={<RefreshCw size={16} />} onClick={() => void pullRepository()}>Mesclar da pasta</Button>
          </div>
        </section>

        <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm xl:col-span-2">
          <h2 className="font-bold text-body">Backup e restauração</h2><p className="mt-1 text-sm text-muted">O backup é autocontido e validado antes de qualquer alteração.</p>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => void readBackup(event)} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" loading={busy === "export"} loadingLabel="Exportando…" disabled={busy !== null} icon={<Download size={16} />} onClick={() => void exportBackup()}>Exportar backup</Button>
            <button type="button" className={buttonSecondary} disabled={busy !== null} onClick={() => fileRef.current?.click()}><Upload size={16} /> Selecionar backup</button>
          </div>
          {preview && (
            <div className="mt-4">
              <Notice tone="warning" title="Prévia validada">
                <p>{preview.cases.length} casos, {preview.plans.length} planos, {preview.runs.length} execuções, {(preview.demands ?? []).length} demandas, {preview.evidence.length} evidências.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" loading={busy === "import"} loadingLabel="Mesclando…" disabled={busy !== null} onClick={() => void applyImport("merge")}>Mesclar por ID</Button>
                  <button type="button" className={buttonDanger} disabled={busy !== null} onClick={() => void applyImport("replace")}>Substituir workspace</button>
                  <button type="button" className={buttonSecondary} disabled={busy !== null} onClick={() => setPreview(null)}>Cancelar</button>
                </div>
              </Notice>
            </div>
          )}
        </section>

        {migrationReport && <section className="rounded-2xl border border-pass-line bg-pass-tint p-5 xl:col-span-2"><h2 className="font-bold text-pass-deep">Migração v1 concluída</h2><p className="mt-1 text-sm text-pass-deep">Em {new Date(migrationReport.migratedAt).toLocaleString("pt-BR")}: {migrationReport.casesCreated} casos, {migrationReport.plansCreated} planos e {migrationReport.runsCreated} execuções.</p>{migrationReport.warnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-pass-deep">{migrationReport.warnings.slice(0, 10).map((warning) => <li key={warning}>{warning}</li>)}</ul>}</section>}
      </div>
    </>
  );
}
