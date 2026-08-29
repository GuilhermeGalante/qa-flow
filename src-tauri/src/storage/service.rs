use std::{
    fs::{File, OpenOptions},
    time::Instant,
};

use fs2::FileExt;
use serde_json::{Map, Value};

use crate::{
    contracts::{
        CommitRequest, CommitResponse, DesktopError, DesktopErrorCode, IntegrityReport,
        WorkspaceSnapshot,
    },
    error::DesktopResult,
    logging::NativeLogger,
    storage::{layout::WorkspaceLayout, repository::WorkspaceRepository},
};

pub struct WorkspaceService {
    layout: WorkspaceLayout,
    lock_file: Option<File>,
    repository: Option<WorkspaceRepository>,
    preferences: Map<String, Value>,
    logger: NativeLogger,
}

impl WorkspaceService {
    pub fn new(layout: WorkspaceLayout) -> Self {
        let logger = NativeLogger::new(&layout.log_dir);
        Self {
            layout,
            lock_file: None,
            repository: None,
            preferences: Map::new(),
            logger,
        }
    }

    pub fn initialize(&mut self) -> DesktopResult<WorkspaceSnapshot> {
        let started = Instant::now();
        let result = self.initialize_inner();
        self.log_result(
            "workspace_initialize",
            result.as_ref().map(|_| ()).map_err(Clone::clone),
            None,
            started,
            None,
        );
        result
    }

    fn initialize_inner(&mut self) -> DesktopResult<WorkspaceSnapshot> {
        if self.repository.is_none() {
            self.layout.prepare()?;
            self.acquire_lock()?;
            self.repository = Some(WorkspaceRepository::open(&self.layout.database_path)?);
        }
        self.repository
            .as_ref()
            .expect("repository initialized")
            .snapshot()
    }

    pub fn commit(&mut self, request: CommitRequest) -> DesktopResult<CommitResponse> {
        let started = Instant::now();
        let operation_id = request.operation_id.clone();
        let mutation_count = request.mutations.len();
        if self.repository.is_none() {
            self.initialize_inner()?;
        }
        let result = self
            .repository
            .as_mut()
            .expect("repository initialized")
            .commit(request)
            .map_err(|mut error| {
                if error.operation_id.is_none() {
                    error.operation_id = Some(operation_id.clone());
                }
                error
            });
        self.log_result(
            "workspace_commit",
            result.as_ref().map(|_| ()).map_err(Clone::clone),
            Some(&operation_id),
            started,
            Some(mutation_count),
        );
        result
    }

    pub fn verify_integrity(&mut self) -> DesktopResult<IntegrityReport> {
        let started = Instant::now();
        if self.repository.is_none() {
            self.initialize_inner()?;
        }
        let result = self
            .repository
            .as_ref()
            .expect("repository initialized")
            .verify_integrity();
        self.log_result(
            "integrity_verify",
            result.as_ref().map(|_| ()).map_err(Clone::clone),
            None,
            started,
            None,
        );
        result
    }

    pub fn preferences(&self) -> Value {
        Value::Object(self.preferences.clone())
    }

    pub fn set_preferences(&mut self, changes: Value) -> DesktopResult<()> {
        let changes = changes.as_object().ok_or_else(|| {
            DesktopError::validation(
                "As preferências devem ser um objeto.",
                "changes",
                "Objeto JSON esperado.",
            )
        })?;
        for (key, value) in changes {
            match key.as_str() {
                "sidebarCollapsed" if value.is_boolean() => {}
                "demandViewMode"
                    if matches!(value.as_str(), Some("modal" | "fullscreen" | "sidebar")) => {}
                "demandSidebarWidth"
                    if value
                        .as_f64()
                        .is_some_and(|width| (240.0..=900.0).contains(&width)) => {}
                _ => {
                    return Err(DesktopError::validation(
                        "Uma preferência local é inválida.",
                        &format!("changes.{key}"),
                        "Chave ou valor não permitido.",
                    ))
                }
            }
        }
        self.preferences.extend(changes.clone());
        Ok(())
    }

    fn acquire_lock(&mut self) -> DesktopResult<()> {
        if self.lock_file.is_some() {
            return Ok(());
        }
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&self.layout.lock_path)?;
        file.try_lock_exclusive().map_err(|_| {
            DesktopError::new(
                DesktopErrorCode::StorageLocked,
                "O workspace já está aberto em outra instância do QA Flow.",
            )
            .retryable(true)
        })?;
        self.lock_file = Some(file);
        Ok(())
    }

    fn log_result(
        &self,
        command: &str,
        result: DesktopResult<()>,
        operation_id: Option<&str>,
        started: Instant,
        mutation_count: Option<usize>,
    ) {
        let duration = started.elapsed().as_millis();
        let _ = match result {
            Ok(()) => self
                .logger
                .record_success(command, operation_id, duration, mutation_count),
            Err(error) => self
                .logger
                .record_error(command, &error, duration, mutation_count),
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_service_cannot_acquire_the_workspace_lock() {
        let root = tempfile::tempdir().expect("temp root");
        let logs = tempfile::tempdir().expect("temp logs");
        let layout = WorkspaceLayout::new(root.path(), logs.path());
        let mut first = WorkspaceService::new(layout.clone());
        let mut second = WorkspaceService::new(layout);

        first.initialize().expect("first lock");
        let error = second.initialize().expect_err("second lock rejected");

        assert_eq!(error.code, DesktopErrorCode::StorageLocked);
    }

    #[test]
    fn local_preferences_are_strictly_allowlisted() {
        let root = tempfile::tempdir().expect("temp root");
        let logs = tempfile::tempdir().expect("temp logs");
        let mut service = WorkspaceService::new(WorkspaceLayout::new(root.path(), logs.path()));

        service
            .set_preferences(serde_json::json!({ "sidebarCollapsed": true }))
            .expect("valid preference");
        let error = service
            .set_preferences(serde_json::json!({ "databasePath": "C:/private" }))
            .expect_err("unknown preference");

        assert_eq!(service.preferences()["sidebarCollapsed"], true);
        assert_eq!(error.code, DesktopErrorCode::Validation);
    }
}
