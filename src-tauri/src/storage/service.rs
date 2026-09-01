use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    path::Path,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use fs2::FileExt;
use serde_json::Value;

use crate::{
    contracts::{
        ApplyImportRequest, CommitRequest, CommitResponse, DesktopError, DesktopErrorCode,
        EvidenceBytes, EvidenceRequest, ImportMode, ImportPreview, ImportReceipt, IntegrityReport,
        RemoveEvidenceRequest, RepositoryPreview, RepositoryPullRequest, WorkspaceSnapshot,
    },
    error::DesktopResult,
    logging::NativeLogger,
    storage::{
        layout::WorkspaceLayout,
        migrations::hex_sha256,
        repository::WorkspaceRepository,
        transfer::{
            prune_recovery_backups, read_repository, recovery_name, repository_display_name,
            write_atomic, write_repository, RecoveryRetentionPolicy, ValidatedBundle,
            DEFAULT_RECOVERY_RETENTION_COUNT, DEFAULT_RECOVERY_RETENTION_DAYS, PREVIEW_TTL_SECONDS,
        },
    },
};

#[derive(Clone)]
struct PreviewEntry {
    bundle: ValidatedBundle,
    repository_name: Option<String>,
    expires_at: Instant,
}

pub struct WorkspaceService {
    layout: WorkspaceLayout,
    lock_file: Option<File>,
    repository: Option<WorkspaceRepository>,
    logger: NativeLogger,
    previews: HashMap<String, PreviewEntry>,
    preview_sequence: u64,
}

impl WorkspaceService {
    pub fn new(layout: WorkspaceLayout) -> Self {
        let logger = NativeLogger::new(&layout.log_dir);
        Self {
            layout,
            lock_file: None,
            repository: None,
            logger,
            previews: HashMap::new(),
            preview_sequence: 0,
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

    pub fn add_evidence(
        &mut self,
        request: EvidenceRequest,
        bytes: Vec<u8>,
    ) -> DesktopResult<CommitResponse> {
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
            .add_evidence(request, &bytes, &self.layout.evidence_dir)
            .map_err(|mut error| {
                if error.operation_id.is_none() {
                    error.operation_id = Some(operation_id.clone());
                }
                error
            });
        self.log_result(
            "evidence_add",
            result.as_ref().map(|_| ()).map_err(Clone::clone),
            Some(&operation_id),
            started,
            Some(mutation_count),
        );
        result
    }

    pub fn read_evidence(&mut self, evidence_id: &str) -> DesktopResult<EvidenceBytes> {
        if self.repository.is_none() {
            self.initialize_inner()?;
        }
        self.repository
            .as_ref()
            .expect("repository initialized")
            .read_evidence(evidence_id, &self.layout.evidence_dir)
    }

    pub fn remove_evidence(
        &mut self,
        request: RemoveEvidenceRequest,
    ) -> DesktopResult<CommitResponse> {
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
            .remove_evidence(request, &self.layout.evidence_dir)
            .map_err(|mut error| {
                if error.operation_id.is_none() {
                    error.operation_id = Some(operation_id.clone());
                }
                error
            });
        self.log_result(
            "evidence_remove",
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
            .verify_integrity(&self.layout.evidence_dir);
        self.log_result(
            "integrity_verify",
            result.as_ref().map(|_| ()).map_err(Clone::clone),
            None,
            started,
            None,
        );
        result
    }

    pub fn export_backup(&mut self, path: &Path) -> DesktopResult<u64> {
        if self.repository.is_none() {
            self.initialize_inner()?;
        }
        let bundle = self
            .repository
            .as_ref()
            .expect("repository initialized")
            .export_bundle(&self.layout.evidence_dir)?;
        let bytes = bundle.to_pretty_bytes()?;
        write_atomic(path, &bytes)?;
        u64::try_from(bytes.len()).map_err(|_| {
            DesktopError::new(
                DesktopErrorCode::Internal,
                "O tamanho do backup não pôde ser representado.",
            )
        })
    }

    pub fn inspect_backup(&mut self, path: &Path) -> DesktopResult<ImportPreview> {
        let bundle = ValidatedBundle::from_file(path)?;
        self.validate_bundle(&bundle)?;
        let source_name = display_name(path, "backup.json");
        let preview_token = self.store_preview(bundle.clone(), source_name.clone(), None);
        Ok(ImportPreview {
            status: "ready".to_owned(),
            preview_token,
            source_name,
            summary: bundle.summary,
        })
    }

    pub fn apply_import(&mut self, request: ApplyImportRequest) -> DesktopResult<ImportReceipt> {
        self.apply_preview(
            &request.preview_token,
            request.mode,
            request.expected_storage_revision,
        )
    }

    pub fn push_repository(&mut self, root: &Path) -> DesktopResult<()> {
        if self.repository.is_none() {
            self.initialize_inner()?;
        }
        let bundle = self
            .repository
            .as_ref()
            .expect("repository initialized")
            .export_bundle(&self.layout.evidence_dir)?;
        write_repository(root, &bundle)
    }

    pub fn inspect_repository(&mut self, root: &Path) -> DesktopResult<RepositoryPreview> {
        let bundle = read_repository(root)?;
        self.validate_bundle(&bundle)?;
        let repository_name = repository_display_name(root);
        let source_name = format!("{repository_name}/.qaflow");
        let preview_token = self.store_preview(
            bundle.clone(),
            source_name.clone(),
            Some(repository_name.clone()),
        );
        Ok(RepositoryPreview {
            status: "ready".to_owned(),
            preview_token,
            source_name,
            summary: bundle.summary,
            repository_name,
        })
    }

    pub fn pull_repository(
        &mut self,
        request: RepositoryPullRequest,
    ) -> DesktopResult<ImportReceipt> {
        self.apply_preview(
            &request.preview_token,
            request.mode,
            request.expected_storage_revision,
        )
    }

    fn validate_bundle(&self, bundle: &ValidatedBundle) -> DesktopResult<()> {
        let validation_root = tempfile::tempdir()?;
        let evidence_dir = validation_root.path().join("evidence");
        std::fs::create_dir_all(&evidence_dir)?;
        let database_path = validation_root.path().join("validation.sqlite3");
        let mut repository = WorkspaceRepository::open(&database_path)?;
        repository.apply_bundle(bundle, ImportMode::Replace, 0, &evidence_dir)?;
        Ok(())
    }

    fn store_preview(
        &mut self,
        bundle: ValidatedBundle,
        source_name: String,
        repository_name: Option<String>,
    ) -> String {
        self.clean_expired_previews();
        if self.previews.len() >= 16 {
            if let Some(oldest) = self
                .previews
                .iter()
                .min_by_key(|(_, entry)| entry.expires_at)
                .map(|(token, _)| token.clone())
            {
                self.previews.remove(&oldest);
            }
        }
        self.preview_sequence = self.preview_sequence.wrapping_add(1);
        let unix_nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        let token =
            hex_sha256(format!("{unix_nanos}:{}:{source_name}", self.preview_sequence).as_bytes());
        self.previews.insert(
            token.clone(),
            PreviewEntry {
                bundle,
                repository_name,
                expires_at: Instant::now() + std::time::Duration::from_secs(PREVIEW_TTL_SECONDS),
            },
        );
        token
    }

    fn apply_preview(
        &mut self,
        preview_token: &str,
        mode: ImportMode,
        expected_storage_revision: u64,
    ) -> DesktopResult<ImportReceipt> {
        self.clean_expired_previews();
        let preview = self.previews.get(preview_token).cloned().ok_or_else(|| {
            DesktopError::validation(
                "A prévia expirou ou já foi utilizada. Selecione a origem novamente.",
                "previewToken",
                "Token de prévia válido por 15 minutos esperado.",
            )
        })?;
        if self.repository.is_none() {
            self.initialize_inner()?;
        }
        let current = self
            .repository
            .as_ref()
            .expect("repository initialized")
            .export_bundle(&self.layout.evidence_dir)?;
        let recovery_path = self.layout.recovery_dir.join(recovery_name(
            if preview.repository_name.is_some() {
                "before-repository-pull"
            } else {
                "before-backup-import"
            },
            expected_storage_revision,
            &current,
        ));
        write_atomic(&recovery_path, &current.to_pretty_bytes()?)?;
        let snapshot = self
            .repository
            .as_mut()
            .expect("repository initialized")
            .apply_bundle(
                &preview.bundle,
                mode,
                expected_storage_revision,
                &self.layout.evidence_dir,
            )?;
        self.previews.remove(preview_token);
        self.prune_recovery_best_effort();
        Ok(ImportReceipt {
            storage_revision: snapshot.storage_revision,
            committed_at: snapshot.committed_at.clone().ok_or_else(|| {
                DesktopError::new(
                    DesktopErrorCode::Internal,
                    "A importação foi concluída sem data de confirmação.",
                )
            })?,
            summary: preview.bundle.summary,
            snapshot,
        })
    }

    fn clean_expired_previews(&mut self) {
        let now = Instant::now();
        self.previews.retain(|_, entry| entry.expires_at > now);
    }

    fn prune_recovery_best_effort(&mut self) {
        let started = Instant::now();
        let result = self.recovery_retention_policy().and_then(|policy| {
            prune_recovery_backups(&self.layout.recovery_dir, policy).map(|_| ())
        });
        self.log_result("recovery_prune", result, None, started, None);
    }

    fn recovery_retention_policy(&self) -> DesktopResult<RecoveryRetentionPolicy> {
        let preferences = self
            .repository
            .as_ref()
            .expect("repository initialized")
            .preferences()?;
        Ok(RecoveryRetentionPolicy {
            max_backups: preferences["recoveryRetentionCount"]
                .as_u64()
                .and_then(|value| usize::try_from(value).ok())
                .unwrap_or(DEFAULT_RECOVERY_RETENTION_COUNT),
            max_age_days: preferences["recoveryRetentionDays"]
                .as_u64()
                .unwrap_or(DEFAULT_RECOVERY_RETENTION_DAYS),
        })
    }

    pub fn preferences(&mut self) -> DesktopResult<Value> {
        if self.repository.is_none() {
            self.initialize_inner()?;
        }
        self.repository
            .as_ref()
            .expect("repository initialized")
            .preferences()
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
                "recoveryRetentionCount"
                    if value
                        .as_u64()
                        .is_some_and(|count| (1..=100).contains(&count)) => {}
                "recoveryRetentionDays"
                    if value
                        .as_u64()
                        .is_some_and(|days| (1..=3_650).contains(&days)) => {}
                _ => {
                    return Err(DesktopError::validation(
                        "Uma preferência local é inválida.",
                        &format!("changes.{key}"),
                        "Chave ou valor não permitido.",
                    ))
                }
            }
        }
        if self.repository.is_none() {
            self.initialize_inner()?;
        }
        self.repository
            .as_mut()
            .expect("repository initialized")
            .set_preferences(changes)?;
        self.prune_recovery_best_effort();
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

fn display_name(path: &Path, fallback: &str) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback)
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn empty_bundle() -> Value {
        json!({
            "schemaVersion": 2,
            "exportedAt": "2026-08-31T12:00:00.000Z",
            "cases": [], "plans": [], "runs": [], "reports": [],
            "demandColumns": [], "demands": [], "evidence": [],
            "settings": {
                "mode": "browser", "name": "Workspace restaurado",
                "repositoryPath": ".qaflow", "compactEvidence": true
            }
        })
    }

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
            .set_preferences(serde_json::json!({
                "sidebarCollapsed": true,
                "recoveryRetentionCount": 12,
                "recoveryRetentionDays": 45
            }))
            .expect("valid preference");
        let error = service
            .set_preferences(serde_json::json!({ "databasePath": "C:/private" }))
            .expect_err("unknown preference");

        assert_eq!(
            service.preferences().expect("read preferences")["sidebarCollapsed"],
            true
        );
        assert_eq!(
            service.preferences().expect("read preferences")["recoveryRetentionCount"],
            12
        );
        assert_eq!(error.code, DesktopErrorCode::Validation);
    }

    #[test]
    fn preview_apply_creates_recovery_and_consumes_the_token() {
        let root = tempfile::tempdir().expect("temp root");
        let logs = tempfile::tempdir().expect("temp logs");
        let layout = WorkspaceLayout::new(root.path(), logs.path());
        let recovery_dir = layout.recovery_dir.clone();
        let backup_path = root.path().join("incoming.json");
        write_atomic(
            &backup_path,
            &serde_json::to_vec_pretty(&empty_bundle()).expect("bundle bytes"),
        )
        .expect("backup fixture");
        let mut service = WorkspaceService::new(layout);

        let preview = service.inspect_backup(&backup_path).expect("valid preview");
        let receipt = service
            .apply_import(ApplyImportRequest {
                preview_token: preview.preview_token.clone(),
                mode: ImportMode::Replace,
                expected_storage_revision: 0,
            })
            .expect("apply preview");

        assert_eq!(receipt.storage_revision, 1);
        assert_eq!(
            receipt.snapshot.workspace["settings"]["name"],
            "Workspace restaurado"
        );
        assert_eq!(
            std::fs::read_dir(recovery_dir)
                .expect("recovery directory")
                .count(),
            1
        );
        assert_eq!(
            service
                .apply_import(ApplyImportRequest {
                    preview_token: preview.preview_token,
                    mode: ImportMode::Replace,
                    expected_storage_revision: 1,
                })
                .expect_err("token consumed")
                .code,
            DesktopErrorCode::Validation
        );
    }

    #[test]
    fn invalid_preview_never_mutates_the_real_workspace() {
        let root = tempfile::tempdir().expect("temp root");
        let logs = tempfile::tempdir().expect("temp logs");
        let layout = WorkspaceLayout::new(root.path(), logs.path());
        let backup_path = root.path().join("invalid.json");
        let mut invalid = empty_bundle();
        invalid["settings"]["mode"] = json!("unsafe");
        write_atomic(
            &backup_path,
            &serde_json::to_vec_pretty(&invalid).expect("bundle bytes"),
        )
        .expect("backup fixture");
        let mut service = WorkspaceService::new(layout);

        assert_eq!(
            service
                .inspect_backup(&backup_path)
                .expect_err("invalid preview")
                .code,
            DesktopErrorCode::Validation
        );
        assert_eq!(
            service
                .initialize()
                .expect("workspace state")
                .storage_revision,
            0
        );
    }
}
