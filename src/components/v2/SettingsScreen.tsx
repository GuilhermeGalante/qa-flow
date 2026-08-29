import { useEffect, useState } from "react";
import { Database, Download, FolderGit2, RefreshCw, Upload } from "lucide-react";
import type { ImportPreview, RepositoryPreview } from "../../platform/contracts/dtos";
import { useQaStore } from "../../store/useQaStore";
import { Button } from "../../ui/Button";
import { useConfirm } from "../../ui/ConfirmProvider";
import { useToast } from "../../ui/ToastProvider";
import { Notice, PageHeader, buttonDanger, buttonSecondary, inputClass } from "./Shared";

export function SettingsScreen() {
  const settings = useQaStore((state) => state.settings);
  const cases = useQaStore((state) => state.cases);
  const plans = useQaStore((state) => state.plans);
  const runs = useQaStore((state) => state.runs);
  const evidence = useQaStore((state) => state.evidence);
  const demands = useQaStore((state) => state.demands);
  const migrationReport = useQaStore((state) => state.migrationReport);
  const storageError = useQaStore((state) => state.storageError);
  const runtimeInfo = useQaStore((state) => state.runtimeInfo);
  const updateSettings = useQaStore((state) => state.updateSettings);
  const exportBackup = useQaStore((state) => state.exportBackup);
  const inspectBackup = useQaStore((state) => state.inspectBackup);
  const applyImport = useQaStore((state) => state.applyImport);
  const pushRepository = useQaStore((state) => state.pushRepository);
  const inspectRepository = useQaStore((state) => state.inspectRepository);
  const pullRepository = useQaStore((state) => state.pullRepository);
  const toast = useToast();
  const confirm = useConfirm();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [repositoryPreview, setRepositoryPreview] = useState<RepositoryPreview | null>(null);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(settings.name);
  const [busy, setBusy] = useState<"export" | "inspect" | "import" | "push" | "pull" | null>(null);
  const nativeFilesPending = runtimeInfo?.runtime === "desktop" && runtimeInfo.nativeFiles !== true;

  useEffect(() => setWorkspaceNameDraft(settings.name), [settings.name]);

  const exportCurrentBackup = async () => {
    setBusy("export");
    try { toast.fromResult(await exportBackup()); } finally { setBusy(null); }
  };

  const selectBackup = async () => {
    setBusy("inspect");
    try {
      const result = await inspectBackup();
      if (!result.ok) toast.fromResult(result);
      else if (result.value) setPreview(result.value);
    } finally { setBusy(null); }
  };

  const importPreview = async (mode: "merge" | "replace") => {
    if (!preview) return;
    if (mode === "replace") {
      const confirmed = await confirm({
        title: "Substituir todo o workspace local?",
        description: "O conteúdo atual deste dispositivo será trocado pelo backup validado. Exporte um backup antes se quiser preservá-lo.",
        impactTitle: "Será substituído",
        impact: [
          `${cases.length} caso(s) → ${preview.summary.cases}`,
          `${plans.length} plano(s) → ${preview.summary.plans}`,
          `${runs.length} execução(ões) → ${preview.summary.runs}`,
          `${demands.length} demanda(s) → ${preview.summary.demands}`,
          `${evidence.length} evidência(s) → ${preview.summary.evidence}`,
        ],
        confirmLabel: "Substituir workspace",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    setBusy("import");
    try {
      const result = await applyImport(preview.previewToken, mode);
      toast.fromResult(result);
      if (result.ok) setPreview(null);
    } finally { setBusy(null); }
  };

  const pushCurrentRepository = async () => {
    setBusy("push");
    try { toast.fromResult(await pushRepository()); } finally { setBusy(null); }
  };

  const selectRepository = async () => {
    setBusy("pull");
    try {
      const result = await inspectRepository();
      if (!result.ok) toast.fromResult(result);
      else if (result.value) setRepositoryPreview(result.value);
    } finally { setBusy(null); }
  };

  const mergeRepository = async () => {
    if (!repositoryPreview) return;
    setBusy("pull");
    try {
      const result = await pullRepository(repositoryPreview.previewToken);
      toast.fromResult(result);
      if (result.ok) setRepositoryPreview(null);
    } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Configurações" description="Controle o workspace local, sincronize uma estrutura versionável e mantenha backups portáteis." />
      {storageError && <div className="mb-5"><Notice tone="error" title="Problema de armazenamento">{storageError}</Notice></div>}
      {nativeFilesPending && (
        <div className="mb-5">
          <Notice tone="warning" title="Desktop em preparação">
            Casos e configurações já são gravados no SQLite. Planos, execuções, relatórios e demandas entram na Fase 4; arquivos nativos entram na Fase 5.
          </Notice>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-run-tint p-2.5 text-run"><Database size={20} /></span><div><h2 className="font-bold text-body">Workspace</h2><p className="mt-1 text-sm text-muted">Dados portáteis e preferências locais ficam em categorias separadas.</p></div></div>
          <div className="mt-5 rounded-xl border border-hairline p-4 text-sm text-subtle">
            <strong className="text-body">Runtime atual</strong>
            <p className="mt-1">{runtimeInfo?.runtime === "desktop" ? "Aplicativo desktop" : "Navegador"} · {runtimeInfo?.persistence === "memory" ? "memória temporária" : "persistência local"}</p>
          </div>
          <label className="mt-4 block text-xs font-bold text-subtle">Nome do workspace<input className={`${inputClass} mt-1`} value={workspaceNameDraft} onChange={(event) => setWorkspaceNameDraft(event.target.value)} onBlur={() => { if (workspaceNameDraft !== settings.name) void updateSettings({ name: workspaceNameDraft }); }} /></label>
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-hairline p-3 text-sm text-control"><input type="checkbox" checked={settings.compactEvidence} onChange={(event) => { void updateSettings({ compactEvidence: event.target.checked }); }} className="mt-1 h-4 w-4 accent-run" /><span><strong className="block text-body">Compactar novas evidências</strong><span className="mt-1 block text-xs text-muted">Reduz imagens antes de enviá-las ao adapter do runtime.</span></span></label>
          <div className="mt-5 rounded-xl bg-surface p-4 text-sm text-subtle"><strong className="text-body">Estado confirmado</strong><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>{cases.length} caso(s)</span><span>{plans.length} plano(s)</span><span>{runs.length} execução(ões)</span><span>{demands.length} demanda(s)</span><span>{evidence.length} evidência(s)</span></div></div>
        </section>

        <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-explore-tint p-2.5 text-explore"><FolderGit2 size={20} /></span><div><h2 className="font-bold text-body">Adaptador de repositório</h2><p className="mt-1 text-sm text-muted">O runtime cuida da seleção e do acesso à pasta; a tela não recebe paths internos.</p></div></div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" loading={busy === "push"} loadingLabel="Gravando…" disabled={nativeFilesPending || busy !== null} icon={<Upload size={16} />} onClick={() => void pushCurrentRepository()}>Gravar .qaflow</Button>
            <Button loading={busy === "pull"} loadingLabel="Validando…" disabled={nativeFilesPending || busy !== null} icon={<RefreshCw size={16} />} onClick={() => void selectRepository()}>Selecionar para mesclar</Button>
          </div>
          {repositoryPreview && (
            <div className="mt-4"><Notice tone="warning" title={`Repositório validado: ${repositoryPreview.repositoryName}`}><p>{repositoryPreview.summary.cases} casos, {repositoryPreview.summary.plans} planos e {repositoryPreview.summary.runs} execuções.</p><div className="mt-3 flex gap-2"><Button variant="primary" disabled={busy !== null} onClick={() => void mergeRepository()}>Mesclar agora</Button><button type="button" className={buttonSecondary} onClick={() => setRepositoryPreview(null)}>Cancelar</button></div></Notice></div>
          )}
        </section>

        <section className="rounded-2xl border border-hairline bg-raised p-5 shadow-sm xl:col-span-2">
          <h2 className="font-bold text-body">Backup e restauração</h2><p className="mt-1 text-sm text-muted">O adapter valida o backup antes de devolver uma prévia tokenizada.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" loading={busy === "export"} loadingLabel="Exportando…" disabled={nativeFilesPending || busy !== null} icon={<Download size={16} />} onClick={() => void exportCurrentBackup()}>Exportar backup</Button>
            <button type="button" className={buttonSecondary} disabled={nativeFilesPending || busy !== null} onClick={() => void selectBackup()}><Upload size={16} /> Selecionar backup</button>
          </div>
          {preview && (
            <div className="mt-4">
              <Notice tone="warning" title={`Prévia validada: ${preview.sourceName}`}>
                <p>{preview.summary.cases} casos, {preview.summary.plans} planos, {preview.summary.runs} execuções, {preview.summary.demands} demandas, {preview.summary.evidence} evidências.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" loading={busy === "import"} loadingLabel="Mesclando…" disabled={busy !== null} onClick={() => void importPreview("merge")}>Mesclar por ID</Button>
                  <button type="button" className={buttonDanger} disabled={busy !== null} onClick={() => void importPreview("replace")}>Substituir workspace</button>
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
