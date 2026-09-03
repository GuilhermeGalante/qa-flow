pub mod contracts;
pub mod error;
pub mod logging;
pub mod storage;

use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::{fs, io::Write, path::Path};

use contracts::{
    ApplyImportRequest, CommitRequest, CommitResponse, DesktopError, DesktopErrorCode,
    EvidenceBytes, EvidenceRequest, ExportRequest, GeneratedFileRequest, ImportReceipt,
    IntegrityReport, RemoveEvidenceRequest, RepositoryPullRequest, RepositoryPushRequest,
    RuntimeInfo, TransferResult, TransferStatus, WorkspaceSnapshot, IPC_CONTRACT_VERSION,
};
use error::DesktopResult;
use serde_json::{json, Value};
use storage::{layout::WorkspaceLayout, service::WorkspaceService, transfer::selected_path};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::{Updater, UpdaterExt};

#[derive(Clone)]
struct DesktopState {
    service: Arc<Mutex<WorkspaceService>>,
    pending_commits: Arc<AtomicUsize>,
    close_requested: Arc<AtomicBool>,
}

impl DesktopState {
    fn new(layout: WorkspaceLayout) -> Self {
        Self {
            service: Arc::new(Mutex::new(WorkspaceService::new(layout))),
            pending_commits: Arc::new(AtomicUsize::new(0)),
            close_requested: Arc::new(AtomicBool::new(false)),
        }
    }
}

async fn with_service<T, F>(state: State<'_, DesktopState>, operation: F) -> DesktopResult<T>
where
    T: Send + 'static,
    F: FnOnce(&mut WorkspaceService) -> DesktopResult<T> + Send + 'static,
{
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = service.lock().map_err(|_| {
            DesktopError::new(
                DesktopErrorCode::Internal,
                "O serviço de armazenamento precisa ser reiniciado.",
            )
        })?;
        operation(&mut service)
    })
    .await
    .map_err(|_| {
        DesktopError::new(
            DesktopErrorCode::Internal,
            "A operação nativa foi interrompida antes de terminar.",
        )
    })?
}

#[tauri::command]
async fn workspace_initialize(state: State<'_, DesktopState>) -> DesktopResult<WorkspaceSnapshot> {
    with_service(state, WorkspaceService::initialize).await
}

#[tauri::command]
async fn workspace_commit(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    request: CommitRequest,
) -> DesktopResult<CommitResponse> {
    let pending_commits = Arc::clone(&state.pending_commits);
    let close_requested = Arc::clone(&state.close_requested);
    pending_commits.fetch_add(1, Ordering::AcqRel);
    let result = with_service(state, move |service| service.commit(request)).await;
    finish_pending_commit(&pending_commits, &close_requested, &app);
    result
}

#[tauri::command]
async fn evidence_add(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    request: EvidenceRequest,
    bytes: Vec<u8>,
) -> DesktopResult<CommitResponse> {
    let pending_commits = Arc::clone(&state.pending_commits);
    let close_requested = Arc::clone(&state.close_requested);
    pending_commits.fetch_add(1, Ordering::AcqRel);
    let result = with_service(state, move |service| service.add_evidence(request, bytes)).await;
    finish_pending_commit(&pending_commits, &close_requested, &app);
    result
}

#[tauri::command]
async fn evidence_read(
    state: State<'_, DesktopState>,
    evidence_id: String,
) -> DesktopResult<EvidenceBytes> {
    with_service(state, move |service| service.read_evidence(&evidence_id)).await
}

#[tauri::command]
async fn evidence_remove(
    state: State<'_, DesktopState>,
    app: tauri::AppHandle,
    request: RemoveEvidenceRequest,
) -> DesktopResult<CommitResponse> {
    let pending_commits = Arc::clone(&state.pending_commits);
    let close_requested = Arc::clone(&state.close_requested);
    pending_commits.fetch_add(1, Ordering::AcqRel);
    let result = with_service(state, move |service| service.remove_evidence(request)).await;
    finish_pending_commit(&pending_commits, &close_requested, &app);
    result
}

fn finish_pending_commit(
    pending_commits: &AtomicUsize,
    close_requested: &AtomicBool,
    app: &tauri::AppHandle,
) {
    if pending_commits.fetch_sub(1, Ordering::AcqRel) == 1
        && close_requested.swap(false, Ordering::AcqRel)
    {
        app.exit(0);
    }
}

#[tauri::command]
async fn integrity_verify(state: State<'_, DesktopState>) -> DesktopResult<IntegrityReport> {
    with_service(state, WorkspaceService::verify_integrity).await
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        ipc_contract_version: IPC_CONTRACT_VERSION,
        runtime: "desktop".to_owned(),
        persistence: "sqlite".to_owned(),
        platform: std::env::consts::OS.to_owned(),
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        native_files: true,
        workspace_transfers: true,
    }
}

#[tauri::command]
async fn backup_export_dialog(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    request: ExportRequest,
) -> DesktopResult<TransferResult> {
    let suggested_name =
        simple_suggested_name(request.suggested_name.as_deref(), "qa-flow-backup", "json")?;
    let selected = app
        .dialog()
        .file()
        .set_file_name(&suggested_name)
        .add_filter("Backup QA Flow", &["json"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(cancelled_transfer());
    };
    let path = selected_path(selected)?;
    let display_name = path_display_name(&path, &suggested_name);
    let bytes_written = with_service(state, move |service| service.export_backup(&path)).await?;
    Ok(TransferResult {
        status: TransferStatus::Completed,
        display_name: Some(display_name),
        bytes_written: Some(bytes_written),
    })
}

#[tauri::command]
async fn backup_inspect_dialog(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
) -> DesktopResult<Value> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Backup QA Flow", &["json"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(json!({ "status": "cancelled" }));
    };
    let path = selected_path(selected)?;
    let preview = with_service(state, move |service| service.inspect_backup(&path)).await?;
    Ok(serde_json::to_value(preview)?)
}

#[tauri::command]
async fn backup_apply(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    request: ApplyImportRequest,
) -> DesktopResult<ImportReceipt> {
    let pending_commits = Arc::clone(&state.pending_commits);
    let close_requested = Arc::clone(&state.close_requested);
    pending_commits.fetch_add(1, Ordering::AcqRel);
    let result = with_service(state, move |service| service.apply_import(request)).await;
    finish_pending_commit(&pending_commits, &close_requested, &app);
    result
}

#[tauri::command]
async fn repository_push_dialog(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    request: RepositoryPushRequest,
) -> DesktopResult<TransferResult> {
    if let Some(name) = request.suggested_name.as_deref() {
        simple_suggested_name(Some(name), "workspace", "qaflow")?;
    }
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(cancelled_transfer());
    };
    let path = selected_path(selected)?;
    let display_name = path_display_name(&path, "workspace");
    with_service(state, move |service| service.push_repository(&path)).await?;
    Ok(TransferResult {
        status: TransferStatus::Completed,
        display_name: Some(display_name),
        bytes_written: None,
    })
}

#[tauri::command]
async fn repository_inspect_dialog(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
) -> DesktopResult<Value> {
    let selected = app.dialog().file().blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(json!({ "status": "cancelled" }));
    };
    let path = selected_path(selected)?;
    let preview = with_service(state, move |service| service.inspect_repository(&path)).await?;
    Ok(serde_json::to_value(preview)?)
}

#[tauri::command]
async fn repository_pull(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    request: RepositoryPullRequest,
) -> DesktopResult<ImportReceipt> {
    let pending_commits = Arc::clone(&state.pending_commits);
    let close_requested = Arc::clone(&state.close_requested);
    pending_commits.fetch_add(1, Ordering::AcqRel);
    let result = with_service(state, move |service| service.pull_repository(request)).await;
    finish_pending_commit(&pending_commits, &close_requested, &app);
    result
}

fn cancelled_transfer() -> TransferResult {
    TransferResult {
        status: TransferStatus::Cancelled,
        display_name: None,
        bytes_written: None,
    }
}

fn simple_suggested_name(
    candidate: Option<&str>,
    fallback: &str,
    extension: &str,
) -> DesktopResult<String> {
    let raw = candidate.unwrap_or(fallback).trim();
    let name = Path::new(raw)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty() && value.len() <= 180)
        .ok_or_else(|| {
            DesktopError::validation(
                "O nome sugerido é inválido.",
                "request.suggestedName",
                "Nome simples entre 1 e 180 caracteres esperado.",
            )
        })?;
    if name.chars().any(char::is_control) {
        return Err(DesktopError::validation(
            "O nome sugerido é inválido.",
            "request.suggestedName",
            "Caracteres de controle não são permitidos.",
        ));
    }
    let suffix = format!(".{extension}");
    Ok(if name.to_ascii_lowercase().ends_with(&suffix) {
        name.to_owned()
    } else {
        format!("{name}{suffix}")
    })
}

fn path_display_name(path: &Path, fallback: &str) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback)
        .to_owned()
}

#[tauri::command]
async fn generated_file_save_dialog(
    app: tauri::AppHandle,
    request: GeneratedFileRequest,
    bytes: Vec<u8>,
) -> DesktopResult<TransferResult> {
    let (display_name, extension, filter_name) = validate_generated_file(&request, bytes.len())?;
    let selected = app
        .dialog()
        .file()
        .set_file_name(&display_name)
        .add_filter(filter_name, &[extension.as_str()])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(TransferResult {
            status: TransferStatus::Cancelled,
            display_name: None,
            bytes_written: None,
        });
    };
    let path = selected.into_path().map_err(|_| {
        DesktopError::new(
            DesktopErrorCode::PermissionDenied,
            "O destino selecionado não pode ser gravado pelo aplicativo.",
        )
    })?;
    let written_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&display_name)
        .to_owned();
    let bytes_written = u64::try_from(bytes.len()).map_err(|_| {
        DesktopError::new(
            DesktopErrorCode::Validation,
            "O arquivo gerado excede o tamanho suportado.",
        )
    })?;
    tauri::async_runtime::spawn_blocking(move || write_generated_file(&path, &bytes))
        .await
        .map_err(|_| {
            DesktopError::new(
                DesktopErrorCode::Internal,
                "A gravação do arquivo foi interrompida.",
            )
        })??;
    Ok(TransferResult {
        status: TransferStatus::Completed,
        display_name: Some(written_name),
        bytes_written: Some(bytes_written),
    })
}

fn validate_generated_file(
    request: &GeneratedFileRequest,
    byte_count: usize,
) -> DesktopResult<(String, String, &'static str)> {
    const MAX_GENERATED_FILE_BYTES: usize = 100 * 1024 * 1024;
    if byte_count == 0 || byte_count > MAX_GENERATED_FILE_BYTES {
        return Err(DesktopError::validation(
            "O tamanho do arquivo gerado não é permitido.",
            "bytes",
            "O arquivo deve ter entre 1 byte e 100 MiB.",
        ));
    }
    let extension = request
        .extension
        .trim_start_matches('.')
        .to_ascii_lowercase();
    let filter_name = match (extension.as_str(), request.mime_type.as_str()) {
        ("pdf", "application/pdf") => "PDF",
        ("json", "application/json") => "JSON",
        ("csv", "text/csv") | ("csv", "text/csv;charset=utf-8") => "CSV",
        _ => {
            return Err(DesktopError::validation(
                "O tipo do arquivo gerado não é permitido.",
                "request",
                "Use PDF, JSON ou CSV com o MIME correspondente.",
            ))
        }
    };
    let raw_name = Path::new(&request.suggested_name)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty() && name.len() <= 180)
        .ok_or_else(|| {
            DesktopError::validation(
                "O nome sugerido é inválido.",
                "request.suggestedName",
                "Nome simples entre 1 e 180 caracteres esperado.",
            )
        })?;
    if raw_name.chars().any(char::is_control) {
        return Err(DesktopError::validation(
            "O nome sugerido é inválido.",
            "request.suggestedName",
            "Caracteres de controle não são permitidos.",
        ));
    }
    let suffix = format!(".{extension}");
    let display_name = if raw_name.to_ascii_lowercase().ends_with(&suffix) {
        raw_name.to_owned()
    } else {
        format!("{raw_name}{suffix}")
    };
    Ok((display_name, extension, filter_name))
}

fn write_generated_file(path: &Path, bytes: &[u8]) -> DesktopResult<()> {
    let parent = path.parent().ok_or_else(|| {
        DesktopError::new(
            DesktopErrorCode::PermissionDenied,
            "O destino selecionado não possui um diretório válido.",
        )
    })?;
    fs::create_dir_all(parent)?;
    let mut staged = tempfile::NamedTempFile::new_in(parent)?;
    staged.write_all(bytes)?;
    staged.as_file_mut().sync_all()?;
    staged
        .persist(path)
        .map_err(|error| DesktopError::from(error.error))?;
    Ok(())
}

#[tauri::command]
async fn preferences_get(state: State<'_, DesktopState>) -> DesktopResult<Value> {
    with_service(state, WorkspaceService::preferences).await
}

#[tauri::command]
async fn preferences_set(state: State<'_, DesktopState>, changes: Value) -> DesktopResult<()> {
    with_service(state, move |service| service.set_preferences(changes)).await
}

#[tauri::command]
async fn update_check(app: tauri::AppHandle) -> DesktopResult<Value> {
    let Some(updater) = configured_updater(&app)? else {
        return Ok(json!({
            "status": "disabled",
            "reason": "Esta build não contém uma chave pública de atualização."
        }));
    };
    match updater.check().await? {
        Some(update) => Ok(json!({
            "status": "available",
            "version": update.version,
            "notes": update.body,
            "publishedAt": update.date.map(|date| date.to_string()),
        })),
        None => Ok(json!({ "status": "upToDate" })),
    }
}

#[tauri::command]
async fn update_install(
    app: tauri::AppHandle,
    state: State<'_, DesktopState>,
    expected_version: String,
) -> DesktopResult<()> {
    if state.pending_commits.load(Ordering::Acquire) > 0 {
        return Err(DesktopError::new(
            DesktopErrorCode::Conflict,
            "Aguarde a gravação atual terminar antes de instalar a atualização.",
        )
        .retryable(true));
    }
    if expected_version.trim().is_empty() || expected_version.len() > 64 {
        return Err(DesktopError::validation(
            "A versão esperada da atualização é inválida.",
            "expectedVersion",
            "Versão SemVer esperada.",
        ));
    }
    let updater = configured_updater(&app)?.ok_or_else(|| {
        DesktopError::new(
            DesktopErrorCode::Update,
            "O updater não está habilitado nesta build.",
        )
    })?;
    let update = updater.check().await?.ok_or_else(|| {
        DesktopError::new(
            DesktopErrorCode::Update,
            "A atualização selecionada não está mais disponível.",
        )
        .retryable(true)
    })?;
    if update.version != expected_version {
        return Err(DesktopError::new(
            DesktopErrorCode::Conflict,
            "A versão disponível mudou. Verifique as atualizações novamente.",
        )
        .retryable(true));
    }
    update.download_and_install(|_, _| {}, || {}).await?;
    Ok(())
}

fn configured_updater(app: &tauri::AppHandle) -> DesktopResult<Option<Updater>> {
    let Some(public_key) = option_env!("QA_FLOW_UPDATER_PUBLIC_KEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    let endpoint = option_env!("QA_FLOW_UPDATER_ENDPOINT")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(
            "https://github.com/GuilhermeGalante/qa-flow/releases/latest/download/latest.json",
        );
    if !endpoint.starts_with("https://") || endpoint.chars().any(char::is_whitespace) {
        return Err(DesktopError::new(
            DesktopErrorCode::Update,
            "O endpoint HTTPS do updater é inválido nesta build.",
        ));
    }
    let endpoint = endpoint.parse().map_err(|_| {
        DesktopError::new(
            DesktopErrorCode::Update,
            "O endpoint do updater é inválido nesta build.",
        )
    })?;
    Ok(Some(
        app.updater_builder()
            .pubkey(public_key)
            .endpoints(vec![endpoint])?
            .timeout(std::time::Duration::from_secs(30))
            .build()?,
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let app_log_dir = app.path().app_log_dir()?;
            app.manage(DesktopState::new(WorkspaceLayout::new(
                app_data_dir,
                app_log_dir,
            )));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<DesktopState>();
                if state.pending_commits.load(Ordering::Acquire) > 0 {
                    state.close_requested.store(true, Ordering::Release);
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            workspace_initialize,
            workspace_commit,
            evidence_add,
            evidence_read,
            evidence_remove,
            integrity_verify,
            backup_export_dialog,
            backup_inspect_dialog,
            backup_apply,
            repository_push_dialog,
            repository_inspect_dialog,
            repository_pull,
            generated_file_save_dialog,
            runtime_info,
            preferences_get,
            preferences_set,
            update_check,
            update_install
        ])
        .run(tauri::generate_context!())
        .expect("failed to run QA Flow Desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_files_are_allowlisted_and_replaced_atomically() {
        let request = GeneratedFileRequest {
            suggested_name: "resultado".to_owned(),
            mime_type: "application/pdf".to_owned(),
            extension: ".pdf".to_owned(),
        };
        let (name, extension, _) = validate_generated_file(&request, 3).expect("valid file");
        assert_eq!(name, "resultado.pdf");
        assert_eq!(extension, "pdf");

        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join(name);
        write_generated_file(&path, b"old").expect("first write");
        write_generated_file(&path, b"new").expect("replacement write");
        assert_eq!(fs::read(path).expect("read generated file"), b"new");
    }

    #[test]
    fn generated_file_rejects_path_and_type_injection() {
        let invalid_type = GeneratedFileRequest {
            suggested_name: "resultado.exe".to_owned(),
            mime_type: "application/octet-stream".to_owned(),
            extension: ".exe".to_owned(),
        };
        assert_eq!(
            validate_generated_file(&invalid_type, 3)
                .expect_err("invalid type")
                .code,
            DesktopErrorCode::Validation
        );
        let unsafe_name = GeneratedFileRequest {
            suggested_name: "../resultado".to_owned(),
            mime_type: "application/json".to_owned(),
            extension: ".json".to_owned(),
        };
        let (name, _, _) = validate_generated_file(&unsafe_name, 3).expect("basename contained");
        assert_eq!(name, "resultado.json");
    }
}
