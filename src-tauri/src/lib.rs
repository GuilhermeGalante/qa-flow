pub mod contracts;
pub mod error;
pub mod logging;
pub mod storage;

use std::sync::{Arc, Mutex};

use contracts::{
    CommitRequest, CommitResponse, DesktopError, DesktopErrorCode, IntegrityReport, RuntimeInfo,
    WorkspaceSnapshot, IPC_CONTRACT_VERSION,
};
use error::DesktopResult;
use serde_json::{json, Value};
use storage::{layout::WorkspaceLayout, service::WorkspaceService};
use tauri::{Manager, State};

#[derive(Clone)]
struct DesktopState {
    service: Arc<Mutex<WorkspaceService>>,
}

impl DesktopState {
    fn new(layout: WorkspaceLayout) -> Self {
        Self {
            service: Arc::new(Mutex::new(WorkspaceService::new(layout))),
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
    request: CommitRequest,
) -> DesktopResult<CommitResponse> {
    with_service(state, move |service| service.commit(request)).await
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
        native_files: false,
    }
}

#[tauri::command]
async fn preferences_get(state: State<'_, DesktopState>) -> DesktopResult<Value> {
    with_service(state, |service| Ok(service.preferences())).await
}

#[tauri::command]
async fn preferences_set(state: State<'_, DesktopState>, changes: Value) -> DesktopResult<()> {
    with_service(state, move |service| service.set_preferences(changes)).await
}

#[tauri::command]
fn update_check() -> Value {
    json!({ "status": "unsupported" })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let app_log_dir = app.path().app_log_dir()?;
            app.manage(DesktopState::new(WorkspaceLayout::new(
                app_data_dir,
                app_log_dir,
            )));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspace_initialize,
            workspace_commit,
            integrity_verify,
            runtime_info,
            preferences_get,
            preferences_set,
            update_check
        ])
        .run(tauri::generate_context!())
        .expect("failed to run QA Flow Desktop");
}
