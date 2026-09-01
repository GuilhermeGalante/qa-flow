use std::{collections::HashSet, fs, io::Write, path::Path, time::Duration};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde_json::{json, Map, Value};

use crate::{
    contracts::{
        ChangedEntity, CommitRequest, CommitResponse, DesktopError, DesktopErrorCode, EntityKind,
        EvidenceBytes, EvidenceMeta, EvidenceRequest, ExpectedEntityRevision, ImportMode,
        IntegrityReport, MutationAction, RemoveEvidenceRequest, StorageMutation, ValidationIssue,
        WorkspaceHealth, WorkspaceHealthStatus, WorkspaceSnapshot, IPC_CONTRACT_VERSION,
    },
    error::DesktopResult,
    storage::{
        migrations::{self, hex_sha256, JSON_SCHEMA_VERSION},
        transfer::{assemble_bundle, write_atomic, ValidatedBundle},
    },
};

const MAX_MUTATIONS: usize = 64;
const MAX_MUTATION_BYTES: usize = 512 * 1024;
const MAX_COMMIT_BYTES: usize = 2 * 1024 * 1024;
const MAX_CASE_STEPS: usize = 500;
pub const MAX_EVIDENCE_BYTES: usize = 10 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CommitFailpoint {
    #[default]
    None,
    AfterBegin,
    AfterFirstMutation,
    BeforeCommit,
    AfterCommit,
}

#[derive(Debug)]
pub struct WorkspaceRepository {
    connection: Connection,
}

impl WorkspaceRepository {
    pub fn open(database_path: &Path) -> DesktopResult<Self> {
        let mut connection = Connection::open(database_path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        connection.pragma_update(None, "trusted_schema", "OFF")?;
        let journal_mode: String =
            connection.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
        if !journal_mode.eq_ignore_ascii_case("wal") {
            return Err(DesktopError::new(
                DesktopErrorCode::RecoveryRequired,
                "O banco local não aceitou o modo seguro de persistência.",
            ));
        }

        migrations::run(&mut connection)?;
        ensure_integrity(&connection)?;
        Ok(Self { connection })
    }

    pub fn snapshot(&self) -> DesktopResult<WorkspaceSnapshot> {
        let storage_revision = read_storage_revision(&self.connection)?;
        let committed_at = read_meta(&self.connection, "last_committed_at")?;
        let settings_json: String = self.connection.query_row(
            "SELECT payload_json FROM workspace_settings WHERE singleton_id = 1",
            [],
            |row| row.get(0),
        )?;
        let settings: Value = parse_stored_json(&settings_json)?;

        let cases = load_payloads(
            &self.connection,
            "SELECT c.payload_json
             FROM case_heads h
             JOIN cases c ON c.id = h.id AND c.revision = h.current_revision
             ORDER BY c.updated_at DESC, c.id ASC",
        )?;
        let plans = load_payloads(
            &self.connection,
            "SELECT p.payload_json
             FROM plan_heads h
             JOIN plans p ON p.id = h.id AND p.revision = h.current_revision
             ORDER BY p.updated_at DESC, p.id ASC",
        )?;
        let runs = load_payloads(
            &self.connection,
            "SELECT payload_json FROM runs ORDER BY started_at DESC, id ASC",
        )?;
        let reports = load_payloads(
            &self.connection,
            "SELECT payload_json FROM reports ORDER BY created_at DESC, id ASC",
        )?;
        let demand_columns = load_payloads(
            &self.connection,
            "SELECT payload_json FROM demand_columns ORDER BY display_order ASC, id ASC",
        )?;
        let demands = load_payloads(
            &self.connection,
            "SELECT payload_json FROM demands ORDER BY column_id ASC, display_order ASC, id ASC",
        )?;
        let evidence = load_payloads(
            &self.connection,
            "SELECT payload_json FROM evidence ORDER BY created_at ASC, id ASC",
        )?;

        Ok(WorkspaceSnapshot {
            ipc_contract_version: IPC_CONTRACT_VERSION,
            storage_revision,
            committed_at: if committed_at.is_empty() {
                None
            } else {
                Some(committed_at)
            },
            health: WorkspaceHealth {
                status: WorkspaceHealthStatus::Healthy,
                message: None,
            },
            workspace: json!({
                "cases": cases,
                "plans": plans,
                "runs": runs,
                "reports": reports,
                "evidence": evidence,
                "demandColumns": demand_columns,
                "demands": demands,
                "settings": settings,
                "migrationReport": Value::Null,
            }),
        })
    }

    pub fn commit(&mut self, request: CommitRequest) -> DesktopResult<CommitResponse> {
        self.commit_with_failpoint(request, CommitFailpoint::None)
    }

    pub fn add_evidence(
        &mut self,
        request: EvidenceRequest,
        bytes: &[u8],
        evidence_dir: &Path,
    ) -> DesktopResult<CommitResponse> {
        validate_evidence_request(&request, bytes)?;
        let operation_id = request.operation_id.clone();
        let blob_name = format!("{}.blob", request.meta.id);
        let final_path = evidence_dir.join(&blob_name);
        if final_path.exists() {
            return Err(DesktopError::conflict(
                "A evidência já existe no armazenamento local.",
                read_storage_revision(&self.connection)?,
            )
            .operation(operation_id));
        }

        let mut staged = tempfile::NamedTempFile::new_in(evidence_dir)?;
        staged.write_all(bytes)?;
        staged.as_file_mut().sync_all()?;
        let byte_size = u64::try_from(bytes.len()).map_err(|_| {
            DesktopError::new(
                DesktopErrorCode::Validation,
                "A evidência excede o tamanho suportado.",
            )
        })?;
        let blob_hash = hex_sha256(bytes);
        let payload = serde_json::to_value(&request.meta)?;
        let payload_json = serde_json::to_string(&payload)?;
        let content_hash = hex_sha256(payload_json.as_bytes());

        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current_revision = read_storage_revision(&transaction)?;
        if current_revision != request.expected_storage_revision {
            return Err(DesktopError::conflict(
                "O workspace mudou desde a última leitura. Recarregue antes de anexar.",
                current_revision,
            )
            .operation(operation_id));
        }
        let already_exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM evidence WHERE id = ?1)",
            [&request.meta.id],
            |row| row.get(0),
        )?;
        if already_exists {
            return Err(
                DesktopError::conflict("A evidência já existe.", current_revision)
                    .operation(operation_id),
            );
        }

        let mut changed = Vec::with_capacity(request.mutations.len());
        for mutation in &request.mutations {
            changed.push(apply_mutation(&transaction, mutation)?);
        }
        validate_evidence_reference(&request.meta, &request.mutations)?;
        transaction.execute(
            "INSERT INTO evidence(
                id, run_id, owner_type, owner_id, mime_type, blob_name, byte_size,
                blob_hash, created_at, payload_json, content_hash
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                request.meta.id,
                request.meta.run_id,
                request.meta.owner_type,
                request.meta.owner_id,
                request.meta.mime_type,
                blob_name,
                byte_size,
                blob_hash,
                request.meta.created_at,
                payload_json,
                content_hash,
            ],
        )?;
        let (next_revision, committed_at) =
            advance_storage_revision(&transaction, current_revision)?;

        staged
            .persist(&final_path)
            .map_err(|error| DesktopError::from(error.error))?;
        if let Err(error) = transaction.commit() {
            let _ = fs::remove_file(&final_path);
            return Err(error.into());
        }

        Ok(CommitResponse {
            storage_revision: next_revision,
            changed,
            committed_at,
        })
    }

    pub fn read_evidence(
        &self,
        evidence_id: &str,
        evidence_dir: &Path,
    ) -> DesktopResult<EvidenceBytes> {
        if !is_safe_id(evidence_id, 128) {
            return Err(DesktopError::validation(
                "O identificador da evidência é inválido.",
                "evidenceId",
                "Identificador seguro esperado.",
            ));
        }
        let stored: Option<(String, String, u64, String)> = self
            .connection
            .query_row(
                "SELECT mime_type, blob_name, byte_size, blob_hash FROM evidence WHERE id = ?1",
                [evidence_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;
        let (mime_type, blob_name, expected_size, expected_hash) = stored
            .ok_or_else(|| DesktopError::new(DesktopErrorCode::Io, "Evidência não encontrada."))?;
        if !is_safe_blob_name(&blob_name) {
            return Err(DesktopError::new(
                DesktopErrorCode::RecoveryRequired,
                "A referência do arquivo de evidência é inválida.",
            ));
        }
        let bytes = fs::read(evidence_dir.join(blob_name))?;
        if bytes.len() as u64 != expected_size || hex_sha256(&bytes) != expected_hash {
            return Err(DesktopError::new(
                DesktopErrorCode::CorruptStorage,
                "O arquivo de evidência não corresponde aos metadados persistidos.",
            ));
        }
        Ok(EvidenceBytes {
            evidence_id: evidence_id.to_owned(),
            mime_type,
            bytes,
        })
    }

    pub fn export_bundle(&self, evidence_dir: &Path) -> DesktopResult<ValidatedBundle> {
        let snapshot = self.snapshot()?;
        let mut evidence = Vec::new();
        for value in snapshot.workspace["evidence"]
            .as_array()
            .cloned()
            .unwrap_or_default()
        {
            let meta: EvidenceMeta = serde_json::from_value(value)?;
            let stored = self.read_evidence(&meta.id, evidence_dir)?;
            evidence.push((meta, stored.bytes));
        }
        assemble_bundle(snapshot.workspace, sqlite_now(&self.connection)?, evidence)
    }

    pub fn apply_bundle(
        &mut self,
        bundle: &ValidatedBundle,
        mode: ImportMode,
        expected_storage_revision: u64,
        evidence_dir: &Path,
    ) -> DesktopResult<WorkspaceSnapshot> {
        let mut published = Vec::new();
        let mut imported_blobs = Map::new();
        for item in &bundle.evidence {
            let hash = hex_sha256(&item.bytes);
            let blob_name = format!("{}-{}.blob", item.meta.id, &hash[..16]);
            if !is_safe_blob_name(&blob_name) {
                return Err(DesktopError::validation(
                    "O identificador da evidência não pode formar um blob seguro.",
                    "evidence.meta.id",
                    "Identificador inválido.",
                ));
            }
            let path = evidence_dir.join(&blob_name);
            if path.exists() {
                let existing = fs::read(&path)?;
                if existing.len() != item.bytes.len() || hex_sha256(&existing) != hash {
                    return Err(DesktopError::new(
                        DesktopErrorCode::CorruptStorage,
                        "Um blob de evidência existente não corresponde ao conteúdo importado.",
                    ));
                }
            } else if let Err(error) = write_atomic(&path, &item.bytes) {
                for published_path in published {
                    let _ = fs::remove_file(published_path);
                }
                return Err(error);
            } else {
                published.push(path);
            }
            imported_blobs.insert(
                item.meta.id.clone(),
                json!({
                    "blobName": blob_name,
                    "byteSize": item.bytes.len(),
                    "blobHash": hash,
                }),
            );
        }

        let result =
            self.apply_bundle_transaction(bundle, mode, expected_storage_revision, &imported_blobs);
        if result.is_err() {
            for path in published {
                let _ = fs::remove_file(path);
            }
            return result;
        }
        // A transação já foi confirmada. Limpeza de órfãos é manutenção best-effort e
        // não pode fazer o chamador repetir uma importação que já foi aplicada.
        let _ = self.remove_orphan_blobs(evidence_dir);
        result
    }

    fn apply_bundle_transaction(
        &mut self,
        bundle: &ValidatedBundle,
        mode: ImportMode,
        expected_storage_revision: u64,
        imported_blobs: &Map<String, Value>,
    ) -> DesktopResult<WorkspaceSnapshot> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current_revision = read_storage_revision(&transaction)?;
        if current_revision != expected_storage_revision {
            return Err(DesktopError::conflict(
                "O workspace mudou desde a prévia. Selecione o conteúdo novamente.",
                current_revision,
            ));
        }
        if mode == ImportMode::Replace {
            clear_workspace_tables(&transaction)?;
        }
        import_bundle_entities(&transaction, bundle, imported_blobs, mode)?;
        validate_all_evidence_links(&transaction)?;
        let (next_revision, committed_at) =
            advance_storage_revision(&transaction, current_revision)?;
        transaction.commit()?;
        let mut snapshot = self.snapshot()?;
        snapshot.storage_revision = next_revision;
        snapshot.committed_at = Some(committed_at);
        Ok(snapshot)
    }

    fn remove_orphan_blobs(&self, evidence_dir: &Path) -> DesktopResult<()> {
        let mut statement = self.connection.prepare("SELECT blob_name FROM evidence")?;
        let referenced = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<HashSet<_>, _>>()?;
        for entry in fs::read_dir(evidence_dir)? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if entry.file_type()?.is_file()
                && is_safe_blob_name(&name)
                && !referenced.contains(&name)
            {
                let _ = fs::remove_file(entry.path());
            }
        }
        Ok(())
    }

    pub fn remove_evidence(
        &mut self,
        request: RemoveEvidenceRequest,
        evidence_dir: &Path,
    ) -> DesktopResult<CommitResponse> {
        let commit_request = CommitRequest {
            operation_id: request.operation_id.clone(),
            expected_storage_revision: request.expected_storage_revision,
            mutations: request.mutations.clone(),
        };
        validate_commit_request(&commit_request)?;
        if !is_safe_id(&request.evidence_id, 128) {
            return Err(DesktopError::validation(
                "O identificador da evidência é inválido.",
                "evidenceId",
                "Identificador seguro esperado.",
            ));
        }

        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current_revision = read_storage_revision(&transaction)?;
        if current_revision != request.expected_storage_revision {
            return Err(DesktopError::conflict(
                "O workspace mudou desde a última leitura. Recarregue antes de remover.",
                current_revision,
            )
            .operation(request.operation_id));
        }
        let blob_name: String = transaction
            .query_row(
                "SELECT blob_name FROM evidence WHERE id = ?1",
                [&request.evidence_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| DesktopError::new(DesktopErrorCode::Io, "Evidência não encontrada."))?;
        if !is_safe_blob_name(&blob_name) {
            return Err(DesktopError::new(
                DesktopErrorCode::RecoveryRequired,
                "A referência do arquivo de evidência é inválida.",
            ));
        }

        let mut changed = Vec::with_capacity(request.mutations.len());
        for mutation in &request.mutations {
            changed.push(apply_mutation(&transaction, mutation)?);
        }
        ensure_evidence_unreferenced(&request.evidence_id, &request.mutations)?;
        transaction.execute("DELETE FROM evidence WHERE id = ?1", [&request.evidence_id])?;
        let (next_revision, committed_at) =
            advance_storage_revision(&transaction, current_revision)?;
        transaction.commit()?;
        match fs::remove_file(evidence_dir.join(blob_name)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                // O banco já não referencia o blob. A Fase 6 poderá limpar este órfão
                // sem risco de apagar uma evidência válida.
            }
        }

        Ok(CommitResponse {
            storage_revision: next_revision,
            changed,
            committed_at,
        })
    }

    pub(crate) fn commit_with_failpoint(
        &mut self,
        request: CommitRequest,
        failpoint: CommitFailpoint,
    ) -> DesktopResult<CommitResponse> {
        validate_commit_request(&request)?;
        let operation_id = request.operation_id.clone();
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current_revision = read_storage_revision(&transaction)?;
        if current_revision != request.expected_storage_revision {
            return Err(DesktopError::conflict(
                "O workspace mudou desde a última leitura. Recarregue antes de salvar.",
                current_revision,
            )
            .operation(operation_id));
        }
        fail_if(failpoint, CommitFailpoint::AfterBegin, &operation_id)?;

        let mut changed = Vec::with_capacity(request.mutations.len());
        for (index, mutation) in request.mutations.iter().enumerate() {
            changed.push(apply_mutation(&transaction, mutation)?);
            if index == 0 {
                fail_if(
                    failpoint,
                    CommitFailpoint::AfterFirstMutation,
                    &operation_id,
                )?;
            }
        }

        let committed_at = sqlite_now(&transaction)?;
        let next_revision = current_revision.checked_add(1).ok_or_else(|| {
            DesktopError::new(
                DesktopErrorCode::Internal,
                "A revisão global do workspace atingiu o limite suportado.",
            )
        })?;
        transaction.execute(
            "UPDATE storage_meta SET value = ?1 WHERE key = 'storage_revision'",
            [next_revision.to_string()],
        )?;
        transaction.execute(
            "UPDATE storage_meta SET value = ?1 WHERE key = 'last_committed_at'",
            [&committed_at],
        )?;
        fail_if(failpoint, CommitFailpoint::BeforeCommit, &operation_id)?;
        transaction.commit()?;
        fail_if(failpoint, CommitFailpoint::AfterCommit, &operation_id)?;

        Ok(CommitResponse {
            storage_revision: next_revision,
            changed,
            committed_at,
        })
    }

    pub fn verify_integrity(&self, evidence_dir: &Path) -> DesktopResult<IntegrityReport> {
        let checked_at = sqlite_now(&self.connection)?;
        let result: String = self
            .connection
            .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;
        if !result.eq_ignore_ascii_case("ok") {
            return Ok(IntegrityReport {
                status: WorkspaceHealthStatus::RecoveryRequired,
                checked_at,
                issues: vec![ValidationIssue {
                    path: "workspace".to_owned(),
                    message: "A verificação de integridade encontrou inconsistências.".to_owned(),
                }],
            });
        }

        let mut statement = self
            .connection
            .prepare("SELECT id, blob_name, byte_size, blob_hash FROM evidence ORDER BY id")?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, u64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let mut issues = Vec::new();
        for row in rows {
            let (id, blob_name, expected_size, expected_hash) = row?;
            match fs::read(evidence_dir.join(&blob_name)) {
                Ok(bytes)
                    if is_safe_blob_name(&blob_name)
                        && bytes.len() as u64 == expected_size
                        && hex_sha256(&bytes) == expected_hash => {}
                Ok(_) => issues.push(ValidationIssue {
                    path: format!("evidence.{id}"),
                    message: "O arquivo não corresponde aos metadados persistidos.".to_owned(),
                }),
                Err(_) => issues.push(ValidationIssue {
                    path: format!("evidence.{id}"),
                    message: "O arquivo binário está ausente ou inacessível.".to_owned(),
                }),
            }
        }
        Ok(IntegrityReport {
            status: if issues.is_empty() {
                WorkspaceHealthStatus::Healthy
            } else {
                WorkspaceHealthStatus::Degraded
            },
            checked_at,
            issues,
        })
    }

    pub fn preferences(&self) -> DesktopResult<Value> {
        let mut statement = self
            .connection
            .prepare("SELECT key, payload_json FROM app_preferences ORDER BY key")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut preferences = Map::new();
        for row in rows {
            let (key, payload_json) = row?;
            preferences.insert(key, parse_stored_json(&payload_json)?);
        }
        Ok(Value::Object(preferences))
    }

    pub fn set_preferences(&mut self, changes: &Map<String, Value>) -> DesktopResult<()> {
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        let updated_at = sqlite_now(&transaction)?;
        for (key, value) in changes {
            transaction.execute(
                "INSERT INTO app_preferences(key, payload_json, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(key) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at",
                params![key, serde_json::to_string(value)?, updated_at],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }
}

fn apply_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    match mutation.kind {
        EntityKind::Case => apply_case_mutation(transaction, mutation),
        EntityKind::Plan => apply_plan_mutation(transaction, mutation),
        EntityKind::Run => apply_run_mutation(transaction, mutation),
        EntityKind::Report => apply_report_mutation(transaction, mutation),
        EntityKind::DemandColumn => apply_demand_column_mutation(transaction, mutation),
        EntityKind::Demand => apply_demand_mutation(transaction, mutation),
        EntityKind::Settings => apply_settings_mutation(transaction, mutation),
    }
}

fn clear_workspace_tables(transaction: &Transaction<'_>) -> DesktopResult<()> {
    transaction.execute_batch(
        "DELETE FROM evidence;
         DELETE FROM reports;
         DELETE FROM runs;
         DELETE FROM plan_heads;
         DELETE FROM plans;
         DELETE FROM case_heads;
         DELETE FROM cases;
         DELETE FROM demands;
         DELETE FROM demand_columns;",
    )?;
    Ok(())
}

fn import_bundle_entities(
    transaction: &Transaction<'_>,
    bundle: &ValidatedBundle,
    imported_blobs: &Map<String, Value>,
    mode: ImportMode,
) -> DesktopResult<()> {
    let object = bundle.value.as_object().expect("validated bundle object");
    for payload in bundle_values(object, "cases") {
        let id = payload["id"].as_str().expect("validated case id");
        validate_case_payload(payload, id)?;
        import_versioned_entity(transaction, "cases", "case_heads", payload)?;
    }
    for payload in bundle_values(object, "plans") {
        let id = payload["id"].as_str().expect("validated plan id");
        validate_plan_payload(transaction, payload, id)?;
        import_versioned_entity(transaction, "plans", "plan_heads", payload)?;
    }

    let mut pending_runs = bundle_values(object, "runs").to_vec();
    while !pending_runs.is_empty() {
        let before = pending_runs.len();
        let mut deferred = Vec::new();
        for payload in pending_runs {
            let source_ready = payload
                .get("sourceRunId")
                .and_then(Value::as_str)
                .is_none_or(|source_id| {
                    transaction
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM runs WHERE id = ?1)",
                            [source_id],
                            |row| row.get::<_, bool>(0),
                        )
                        .unwrap_or(false)
                });
            if source_ready {
                import_run(transaction, &payload)?;
            } else {
                deferred.push(payload);
            }
        }
        if deferred.len() == before {
            return Err(field_issue(
                "sourceRunId",
                "As execuções importadas possuem uma referência de origem ausente ou cíclica.",
            ));
        }
        pending_runs = deferred;
    }

    for payload in bundle_values(object, "reports") {
        let id = payload["id"].as_str().expect("validated report id");
        validate_report_payload(transaction, payload, id)?;
        let payload_json = serde_json::to_string(payload)?;
        transaction.execute(
            "INSERT INTO reports(id, run_id, created_at, payload_json, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                run_id = excluded.run_id,
                created_at = excluded.created_at,
                payload_json = excluded.payload_json,
                content_hash = excluded.content_hash",
            params![
                id,
                payload["runId"].as_str().expect("validated runId"),
                payload["createdAt"].as_str().expect("validated createdAt"),
                payload_json,
                hex_sha256(serde_json::to_string(payload)?.as_bytes()),
            ],
        )?;
    }

    let columns = bundle_values(object, "demandColumns");
    if !columns.is_empty() {
        for payload in columns {
            let id = payload["id"].as_str().expect("validated column id");
            validate_demand_column_payload(payload, id)?;
            let payload_json = serde_json::to_string(payload)?;
            transaction.execute(
                "INSERT INTO demand_columns(
                    id, display_order, semantic, created_at, updated_at, payload_json, content_hash
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                    display_order = excluded.display_order,
                    semantic = excluded.semantic,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at,
                    payload_json = excluded.payload_json,
                    content_hash = excluded.content_hash",
                params![
                    id,
                    payload["order"].as_u64().expect("validated order"),
                    payload["semantic"].as_str().expect("validated semantic"),
                    payload["createdAt"].as_str().expect("validated createdAt"),
                    payload["updatedAt"].as_str().expect("validated updatedAt"),
                    payload_json,
                    hex_sha256(serde_json::to_string(payload)?.as_bytes()),
                ],
            )?;
        }
    } else if mode == ImportMode::Replace {
        let now = sqlite_now(transaction)?;
        insert_default_columns_for_import(transaction, &now)?;
    }
    for payload in bundle_values(object, "demands") {
        let id = payload["id"].as_str().expect("validated demand id");
        validate_demand_payload(transaction, payload, id)?;
        let payload_json = serde_json::to_string(payload)?;
        transaction.execute(
            "INSERT INTO demands(id, column_id, display_order, updated_at, payload_json, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                column_id = excluded.column_id,
                display_order = excluded.display_order,
                updated_at = excluded.updated_at,
                payload_json = excluded.payload_json,
                content_hash = excluded.content_hash",
            params![
                id,
                payload["columnId"].as_str().expect("validated columnId"),
                payload["order"].as_u64().expect("validated order"),
                payload["updatedAt"].as_str().expect("validated updatedAt"),
                payload_json,
                hex_sha256(serde_json::to_string(payload)?.as_bytes()),
            ],
        )?;
    }

    for item in &bundle.evidence {
        let run_json: String = transaction.query_row(
            "SELECT payload_json FROM runs WHERE id = ?1",
            [&item.meta.run_id],
            |row| row.get(0),
        )?;
        let run_payload = parse_stored_json(&run_json)?;
        validate_evidence_reference(
            &item.meta,
            &[StorageMutation {
                kind: EntityKind::Run,
                action: MutationAction::Upsert,
                id: item.meta.run_id.clone(),
                expected_entity_revision: ExpectedEntityRevision::Omitted,
                payload: Some(run_payload),
            }],
        )?;
        let blob = imported_blobs
            .get(&item.meta.id)
            .expect("imported evidence blob");
        let payload_json = serde_json::to_string(&item.meta)?;
        transaction.execute(
            "INSERT INTO evidence(
                id, run_id, owner_type, owner_id, mime_type, blob_name, byte_size,
                blob_hash, created_at, payload_json, content_hash
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                run_id = excluded.run_id,
                owner_type = excluded.owner_type,
                owner_id = excluded.owner_id,
                mime_type = excluded.mime_type,
                blob_name = excluded.blob_name,
                byte_size = excluded.byte_size,
                blob_hash = excluded.blob_hash,
                created_at = excluded.created_at,
                payload_json = excluded.payload_json,
                content_hash = excluded.content_hash",
            params![
                item.meta.id,
                item.meta.run_id,
                item.meta.owner_type,
                item.meta.owner_id,
                item.meta.mime_type,
                blob["blobName"].as_str().expect("blob name"),
                blob["byteSize"].as_u64().expect("blob size"),
                blob["blobHash"].as_str().expect("blob hash"),
                item.meta.created_at,
                payload_json,
                hex_sha256(serde_json::to_string(&item.meta)?.as_bytes()),
            ],
        )?;
    }

    if mode == ImportMode::Replace {
        let settings = object.get("settings").expect("validated settings");
        validate_settings_payload(settings)?;
        let payload_json = serde_json::to_string(settings)?;
        transaction.execute(
            "UPDATE workspace_settings SET
                revision = revision + 1,
                payload_json = ?1,
                updated_at = ?2,
                content_hash = ?3
             WHERE singleton_id = 1",
            params![
                payload_json,
                sqlite_now(transaction)?,
                hex_sha256(serde_json::to_string(settings)?.as_bytes()),
            ],
        )?;
    }
    Ok(())
}

fn import_versioned_entity(
    transaction: &Transaction<'_>,
    table: &str,
    heads: &str,
    payload: &Value,
) -> DesktopResult<()> {
    let id = payload["id"].as_str().expect("validated entity id");
    let revision = payload["revision"].as_u64().expect("validated revision");
    let payload_json = serde_json::to_string(payload)?;
    let content_hash = hex_sha256(payload_json.as_bytes());
    let existing: Option<String> = transaction
        .query_row(
            &format!("SELECT content_hash FROM {table} WHERE id = ?1 AND revision = ?2"),
            params![id, revision],
            |row| row.get(0),
        )
        .optional()?;
    if existing.as_deref().is_some_and(|hash| hash != content_hash) {
        return Err(DesktopError::new(
            DesktopErrorCode::Conflict,
            "A importação tenta redefinir uma revisão histórica existente.",
        ));
    }
    if existing.is_none() {
        transaction.execute(
            &format!(
                "INSERT INTO {table}(id, revision, payload_json, created_at, updated_at, content_hash)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
            ),
            params![
                id,
                revision,
                payload_json,
                payload["createdAt"].as_str().expect("validated createdAt"),
                payload["updatedAt"].as_str().expect("validated updatedAt"),
                content_hash,
            ],
        )?;
    }
    transaction.execute(
        &format!(
            "INSERT INTO {heads}(id, current_revision) VALUES (?1, ?2)
             ON CONFLICT(id) DO UPDATE SET current_revision = excluded.current_revision"
        ),
        params![id, revision],
    )?;
    Ok(())
}

fn import_run(transaction: &Transaction<'_>, payload: &Value) -> DesktopResult<()> {
    let id = payload["id"].as_str().expect("validated run id");
    validate_run_payload(transaction, payload, id)?;
    let payload_json = serde_json::to_string(payload)?;
    transaction.execute(
        "INSERT INTO runs(
            id, plan_id, plan_revision, status, started_at, updated_at, payload_json, content_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
            plan_id = excluded.plan_id,
            plan_revision = excluded.plan_revision,
            status = excluded.status,
            started_at = excluded.started_at,
            updated_at = excluded.updated_at,
            payload_json = excluded.payload_json,
            content_hash = excluded.content_hash",
        params![
            id,
            payload["planId"].as_str().expect("validated planId"),
            payload["planRevision"]
                .as_u64()
                .expect("validated planRevision"),
            payload["status"].as_str().expect("validated status"),
            payload["startedAt"].as_str().expect("validated startedAt"),
            payload["updatedAt"].as_str().expect("validated updatedAt"),
            payload_json,
            hex_sha256(serde_json::to_string(payload)?.as_bytes()),
        ],
    )?;
    Ok(())
}

fn insert_default_columns_for_import(
    transaction: &Transaction<'_>,
    created_at: &str,
) -> DesktopResult<()> {
    for (order, (id, name, semantic)) in [
        ("COL-BACKLOG", "Backlog", "neutral"),
        ("COL-REFINEMENT", "Refinamento", "neutral"),
        ("COL-READY", "Pronto", "neutral"),
        ("COL-PROGRESS", "Em andamento", "active"),
        ("COL-BLOCKED", "Bloqueado", "blocked"),
        ("COL-VALIDATION", "Em validação", "active"),
        ("COL-DONE", "Concluído", "done"),
    ]
    .into_iter()
    .enumerate()
    {
        let payload = json!({
            "id": id, "name": name, "semantic": semantic, "order": order,
            "createdAt": created_at, "updatedAt": created_at,
        });
        let payload_json = serde_json::to_string(&payload)?;
        transaction.execute(
            "INSERT INTO demand_columns(
                id, display_order, semantic, created_at, updated_at, payload_json, content_hash
             ) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)",
            params![
                id,
                order as u64,
                semantic,
                created_at,
                payload_json,
                hex_sha256(serde_json::to_string(&payload)?.as_bytes()),
            ],
        )?;
    }
    Ok(())
}

fn validate_all_evidence_links(transaction: &Transaction<'_>) -> DesktopResult<()> {
    let mut statement = transaction.prepare("SELECT id, payload_json FROM runs")?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (run_id, payload_json) = row?;
        let payload = parse_stored_json(&payload_json)?;
        let ids = payload["results"]
            .as_object()
            .into_iter()
            .flat_map(|results| results.values())
            .filter_map(|result| result["evidenceIds"].as_array())
            .flatten()
            .chain(
                payload["exploratoryRecords"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|record| record["evidenceIds"].as_array())
                    .flatten(),
            );
        for evidence_id in ids {
            let evidence_id = evidence_id
                .as_str()
                .ok_or_else(|| field_issue("evidenceIds", "Identificador inválido."))?;
            let owner_run: Option<String> = transaction
                .query_row(
                    "SELECT run_id FROM evidence WHERE id = ?1",
                    [evidence_id],
                    |row| row.get(0),
                )
                .optional()?;
            if owner_run.as_deref() != Some(&run_id) {
                return Err(field_issue(
                    "evidenceIds",
                    "A evidência referenciada não existe ou pertence a outra execução.",
                ));
            }
        }
    }
    Ok(())
}

fn bundle_values<'a>(object: &'a Map<String, Value>, field: &str) -> &'a [Value] {
    object
        .get(field)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn apply_case_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    if mutation.action == MutationAction::Delete {
        return Err(DesktopError::validation(
            "Casos não podem ser removidos fisicamente.",
            "mutations.action",
            "Use archive para preservar o histórico.",
        ));
    }
    let payload = mutation.payload.as_ref().ok_or_else(|| {
        DesktopError::validation(
            "O caso precisa de um payload.",
            "mutations.payload",
            "Campo obrigatório.",
        )
    })?;
    validate_case_payload(payload, &mutation.id)?;

    let current: Option<u64> = transaction
        .query_row(
            "SELECT current_revision FROM case_heads WHERE id = ?1",
            [&mutation.id],
            |row| row.get(0),
        )
        .optional()?;
    match (&mutation.expected_entity_revision, current) {
        (ExpectedEntityRevision::Absent, None) => {}
        (ExpectedEntityRevision::Revision(expected), Some(actual)) if *expected == actual => {}
        _ => {
            return Err(DesktopError::conflict(
                "O caso foi alterado por outra gravação. Reabra-o antes de salvar.",
                read_storage_revision(transaction)?,
            ))
        }
    }

    let payload_revision = payload
        .get("revision")
        .and_then(Value::as_u64)
        .expect("validated revision");
    let expected_next = current.unwrap_or(0) + 1;
    if payload_revision != expected_next {
        return Err(DesktopError::validation(
            "A revisão do caso não é sequencial.",
            "mutations.payload.revision",
            format!("Esperado {expected_next}."),
        ));
    }

    let payload_json = serde_json::to_string(payload)?;
    let content_hash = hex_sha256(payload_json.as_bytes());
    let created_at = payload["createdAt"].as_str().expect("validated createdAt");
    let updated_at = payload["updatedAt"].as_str().expect("validated updatedAt");
    transaction.execute(
        "INSERT INTO cases(id, revision, payload_json, created_at, updated_at, content_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            mutation.id,
            payload_revision,
            payload_json,
            created_at,
            updated_at,
            content_hash
        ],
    )?;
    transaction.execute(
        "INSERT INTO case_heads(id, current_revision) VALUES (?1, ?2)
         ON CONFLICT(id) DO UPDATE SET current_revision = excluded.current_revision",
        params![mutation.id, payload_revision],
    )?;

    Ok(ChangedEntity {
        kind: EntityKind::Case,
        id: mutation.id.clone(),
        payload: Some(payload.clone()),
    })
}

fn apply_plan_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    if mutation.action == MutationAction::Delete {
        return Err(DesktopError::validation(
            "Planos não podem ser removidos fisicamente.",
            "mutations.action",
            "Use archive para preservar o histórico.",
        ));
    }
    let payload = required_payload(mutation, "O plano precisa de um payload.")?;
    validate_plan_payload(transaction, payload, &mutation.id)?;
    let current: Option<u64> = transaction
        .query_row(
            "SELECT current_revision FROM plan_heads WHERE id = ?1",
            [&mutation.id],
            |row| row.get(0),
        )
        .optional()?;
    validate_expected_revision(transaction, mutation, current, "plano")?;
    let payload_revision = payload["revision"].as_u64().expect("validated revision");
    let expected_next = current.unwrap_or(0) + 1;
    if payload_revision != expected_next {
        return Err(field_issue(
            "revision",
            format!("A revisão do plano deve ser sequencial. Esperado {expected_next}."),
        ));
    }

    let payload_json = serde_json::to_string(payload)?;
    transaction.execute(
        "INSERT INTO plans(id, revision, payload_json, created_at, updated_at, content_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            mutation.id,
            payload_revision,
            payload_json,
            payload["createdAt"].as_str().expect("validated createdAt"),
            payload["updatedAt"].as_str().expect("validated updatedAt"),
            hex_sha256(payload_json.as_bytes())
        ],
    )?;
    transaction.execute(
        "INSERT INTO plan_heads(id, current_revision) VALUES (?1, ?2)
         ON CONFLICT(id) DO UPDATE SET current_revision = excluded.current_revision",
        params![mutation.id, payload_revision],
    )?;
    Ok(changed_with_payload(EntityKind::Plan, mutation, payload))
}

fn apply_run_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    if mutation.action != MutationAction::Upsert {
        return Err(DesktopError::validation(
            "Execuções não podem ser arquivadas ou excluídas.",
            "mutations.action",
            "A conclusão ou o aborto preservam o histórico.",
        ));
    }
    let payload = required_payload(mutation, "A execução precisa de um payload.")?;
    validate_run_payload(transaction, payload, &mutation.id)?;
    let previous_json: Option<String> = transaction
        .query_row(
            "SELECT payload_json FROM runs WHERE id = ?1",
            [&mutation.id],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(previous_json) = previous_json {
        let previous = parse_stored_json(&previous_json)?;
        validate_run_update(&previous, payload)?;
    } else {
        if !matches!(
            &mutation.expected_entity_revision,
            ExpectedEntityRevision::Omitted | ExpectedEntityRevision::Absent
        ) {
            return Err(DesktopError::conflict(
                "A execução já mudou. Recarregue antes de salvar.",
                read_storage_revision(transaction)?,
            ));
        }
        if !matches!(payload["status"].as_str(), Some("draft" | "in_progress")) {
            return Err(field_issue(
                "status",
                "Uma nova execução deve começar como rascunho ou em andamento.",
            ));
        }
        let prior_runs: u64 = transaction.query_row(
            "SELECT count(*) FROM runs WHERE plan_id = ?1",
            [payload["planId"].as_str().expect("validated planId")],
            |row| row.get(0),
        )?;
        let expected_attempt = prior_runs + 1;
        if payload["attempt"].as_u64() != Some(expected_attempt) {
            return Err(field_issue(
                "attempt",
                format!("Número de tentativa esperado: {expected_attempt}."),
            ));
        }
    }

    let payload_json = serde_json::to_string(payload)?;
    transaction.execute(
        "INSERT INTO runs(
            id, plan_id, plan_revision, status, started_at, updated_at, payload_json, content_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at,
            payload_json = excluded.payload_json,
            content_hash = excluded.content_hash",
        params![
            mutation.id,
            payload["planId"].as_str().expect("validated planId"),
            payload["planRevision"]
                .as_u64()
                .expect("validated planRevision"),
            payload["status"].as_str().expect("validated status"),
            payload["startedAt"].as_str().expect("validated startedAt"),
            payload["updatedAt"].as_str().expect("validated updatedAt"),
            payload_json,
            hex_sha256(payload_json.as_bytes())
        ],
    )?;
    Ok(changed_with_payload(EntityKind::Run, mutation, payload))
}

fn apply_report_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    if mutation.action == MutationAction::Delete {
        let removed = transaction.execute("DELETE FROM reports WHERE id = ?1", [&mutation.id])?;
        if removed == 0 {
            return Err(field_issue("id", "Relatório não encontrado."));
        }
        return Ok(changed_without_payload(EntityKind::Report, mutation));
    }
    if mutation.action != MutationAction::Upsert {
        return Err(field_issue(
            "action",
            "Relatórios aceitam somente criação ou exclusão.",
        ));
    }
    let payload = required_payload(mutation, "O relatório precisa de um payload.")?;
    validate_report_payload(transaction, payload, &mutation.id)?;
    let payload_json = serde_json::to_string(payload)?;
    let inserted = transaction.execute(
        "INSERT INTO reports(id, run_id, created_at, payload_json, content_hash)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO NOTHING",
        params![
            mutation.id,
            payload["runId"].as_str().expect("validated runId"),
            payload["createdAt"].as_str().expect("validated createdAt"),
            payload_json,
            hex_sha256(payload_json.as_bytes())
        ],
    )?;
    if inserted == 0 {
        return Err(DesktopError::conflict(
            "Já existe um relatório com este ID.",
            read_storage_revision(transaction)?,
        ));
    }
    Ok(changed_with_payload(EntityKind::Report, mutation, payload))
}

fn apply_demand_column_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    if mutation.action == MutationAction::Delete {
        let references: u64 = transaction.query_row(
            "SELECT count(*) FROM demands WHERE column_id = ?1",
            [&mutation.id],
            |row| row.get(0),
        )?;
        let total: u64 =
            transaction.query_row("SELECT count(*) FROM demand_columns", [], |row| row.get(0))?;
        if references > 0 || total <= 1 {
            return Err(field_issue(
                "id",
                "A coluna precisa estar vazia e o quadro deve manter ao menos uma coluna.",
            ));
        }
        let removed =
            transaction.execute("DELETE FROM demand_columns WHERE id = ?1", [&mutation.id])?;
        if removed == 0 {
            return Err(field_issue("id", "Coluna não encontrada."));
        }
        return Ok(changed_without_payload(EntityKind::DemandColumn, mutation));
    }
    if mutation.action != MutationAction::Upsert {
        return Err(field_issue(
            "action",
            "Colunas de demanda aceitam somente upsert ou delete.",
        ));
    }
    let payload = required_payload(mutation, "A coluna precisa de um payload.")?;
    validate_demand_column_payload(payload, &mutation.id)?;
    let payload_json = serde_json::to_string(payload)?;
    transaction.execute(
        "INSERT INTO demand_columns(
            id, display_order, semantic, created_at, updated_at, payload_json, content_hash
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
            display_order = excluded.display_order,
            semantic = excluded.semantic,
            updated_at = excluded.updated_at,
            payload_json = excluded.payload_json,
            content_hash = excluded.content_hash",
        params![
            mutation.id,
            payload["order"].as_u64().expect("validated order"),
            payload["semantic"].as_str().expect("validated semantic"),
            payload["createdAt"].as_str().expect("validated createdAt"),
            payload["updatedAt"].as_str().expect("validated updatedAt"),
            payload_json,
            hex_sha256(payload_json.as_bytes())
        ],
    )?;
    Ok(changed_with_payload(
        EntityKind::DemandColumn,
        mutation,
        payload,
    ))
}

fn apply_demand_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    if mutation.action == MutationAction::Delete {
        let removed = transaction.execute("DELETE FROM demands WHERE id = ?1", [&mutation.id])?;
        if removed == 0 {
            return Err(field_issue("id", "Demanda não encontrada."));
        }
        return Ok(changed_without_payload(EntityKind::Demand, mutation));
    }
    if mutation.action != MutationAction::Upsert {
        return Err(field_issue(
            "action",
            "Demandas aceitam somente upsert ou delete.",
        ));
    }
    let payload = required_payload(mutation, "A demanda precisa de um payload.")?;
    validate_demand_payload(transaction, payload, &mutation.id)?;
    let payload_json = serde_json::to_string(payload)?;
    transaction.execute(
        "INSERT INTO demands(id, column_id, display_order, updated_at, payload_json, content_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            column_id = excluded.column_id,
            display_order = excluded.display_order,
            updated_at = excluded.updated_at,
            payload_json = excluded.payload_json,
            content_hash = excluded.content_hash",
        params![
            mutation.id,
            payload["columnId"].as_str().expect("validated columnId"),
            payload["order"].as_u64().expect("validated order"),
            payload["updatedAt"].as_str().expect("validated updatedAt"),
            payload_json,
            hex_sha256(payload_json.as_bytes())
        ],
    )?;
    Ok(changed_with_payload(EntityKind::Demand, mutation, payload))
}

fn required_payload<'a>(mutation: &'a StorageMutation, message: &str) -> DesktopResult<&'a Value> {
    mutation
        .payload
        .as_ref()
        .ok_or_else(|| DesktopError::validation(message, "mutations.payload", "Campo obrigatório."))
}

fn validate_expected_revision(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
    current: Option<u64>,
    entity_label: &str,
) -> DesktopResult<()> {
    match (&mutation.expected_entity_revision, current) {
        (ExpectedEntityRevision::Absent, None) => Ok(()),
        (ExpectedEntityRevision::Revision(expected), Some(actual)) if *expected == actual => Ok(()),
        _ => Err(DesktopError::conflict(
            format!("O {entity_label} foi alterado por outra gravação. Reabra-o antes de salvar."),
            read_storage_revision(transaction)?,
        )),
    }
}

fn changed_with_payload(
    kind: EntityKind,
    mutation: &StorageMutation,
    payload: &Value,
) -> ChangedEntity {
    ChangedEntity {
        kind,
        id: mutation.id.clone(),
        payload: Some(payload.clone()),
    }
}

fn changed_without_payload(kind: EntityKind, mutation: &StorageMutation) -> ChangedEntity {
    ChangedEntity {
        kind,
        id: mutation.id.clone(),
        payload: None,
    }
}

fn apply_settings_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    if mutation.id != "workspace" || mutation.action != MutationAction::Upsert {
        return Err(DesktopError::validation(
            "A mutação de configurações não é permitida.",
            "mutations",
            "Use upsert com o ID workspace.",
        ));
    }
    let payload = mutation.payload.as_ref().ok_or_else(|| {
        DesktopError::validation(
            "As configurações precisam de um payload.",
            "mutations.payload",
            "Campo obrigatório.",
        )
    })?;
    validate_settings_payload(payload)?;
    let payload_json = serde_json::to_string(payload)?;
    let content_hash = hex_sha256(payload_json.as_bytes());
    let updated_at = sqlite_now(transaction)?;
    transaction.execute(
        "UPDATE workspace_settings
         SET revision = revision + 1, payload_json = ?1, updated_at = ?2, content_hash = ?3
         WHERE singleton_id = 1",
        params![payload_json, updated_at, content_hash],
    )?;
    Ok(ChangedEntity {
        kind: EntityKind::Settings,
        id: mutation.id.clone(),
        payload: Some(payload.clone()),
    })
}

fn validate_commit_request(request: &CommitRequest) -> DesktopResult<()> {
    if !is_safe_id(&request.operation_id, 160) {
        return Err(DesktopError::validation(
            "O identificador da operação é inválido.",
            "operationId",
            "Use de 1 a 160 caracteres alfanuméricos, ponto, hífen, sublinhado ou dois-pontos.",
        ));
    }
    if request.mutations.is_empty() || request.mutations.len() > MAX_MUTATIONS {
        return Err(DesktopError::validation(
            "A quantidade de mutações não é permitida.",
            "mutations",
            format!("Envie entre 1 e {MAX_MUTATIONS} mutações."),
        ));
    }

    let mut total_bytes = 0usize;
    let mut identities = HashSet::new();
    for mutation in &request.mutations {
        if !is_safe_id(&mutation.id, 128) {
            return Err(DesktopError::validation(
                "O identificador da entidade é inválido.",
                "mutations.id",
                "Use de 1 a 128 caracteres alfanuméricos, ponto, hífen, sublinhado ou dois-pontos.",
            ));
        }
        let identity = (mutation.kind.clone(), mutation.id.clone());
        if !identities.insert(identity) {
            return Err(DesktopError::validation(
                "A mesma entidade aparece mais de uma vez no commit.",
                "mutations",
                "Agrupe cada entidade em uma única mutação.",
            ));
        }
        if let Some(payload) = &mutation.payload {
            let size = serde_json::to_vec(payload)?.len();
            if size > MAX_MUTATION_BYTES {
                return Err(DesktopError::validation(
                    "Um payload excede o limite permitido.",
                    "mutations.payload",
                    format!("Limite por mutação: {MAX_MUTATION_BYTES} bytes."),
                ));
            }
            total_bytes = total_bytes.saturating_add(size);
        }
    }
    if total_bytes > MAX_COMMIT_BYTES {
        return Err(DesktopError::validation(
            "O commit excede o limite total permitido.",
            "mutations",
            format!("Limite por commit: {MAX_COMMIT_BYTES} bytes."),
        ));
    }
    Ok(())
}

fn validate_evidence_request(request: &EvidenceRequest, bytes: &[u8]) -> DesktopResult<()> {
    validate_commit_request(&CommitRequest {
        operation_id: request.operation_id.clone(),
        expected_storage_revision: request.expected_storage_revision,
        mutations: request.mutations.clone(),
    })?;
    let meta = &request.meta;
    for (path, value) in [
        ("meta.id", meta.id.as_str()),
        ("meta.runId", meta.run_id.as_str()),
        ("meta.ownerId", meta.owner_id.as_str()),
    ] {
        if !is_safe_id(value, 128) {
            return Err(DesktopError::validation(
                "Os metadados da evidência são inválidos.",
                path,
                "Identificador seguro esperado.",
            ));
        }
    }
    if !matches!(meta.owner_type.as_str(), "step" | "exploratory") {
        return Err(DesktopError::validation(
            "Os metadados da evidência são inválidos.",
            "meta.ownerType",
            "Use step ou exploratory.",
        ));
    }
    if !matches!(
        meta.mime_type.as_str(),
        "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    ) {
        return Err(DesktopError::validation(
            "O tipo da evidência não é permitido.",
            "meta.mimeType",
            "Use PNG, JPEG, WebP ou GIF.",
        ));
    }
    if meta.name.trim().is_empty()
        || meta.name.len() > 255
        || meta.name.chars().any(char::is_control)
    {
        return Err(DesktopError::validation(
            "O nome da evidência é inválido.",
            "meta.name",
            "Use um nome entre 1 e 255 caracteres sem controles.",
        ));
    }
    if meta.created_at.trim().is_empty() || meta.created_at.len() > 64 {
        return Err(DesktopError::validation(
            "A data da evidência é inválida.",
            "meta.createdAt",
            "Data ISO esperada.",
        ));
    }
    if meta.sha256 != "unavailable"
        && (meta.sha256.len() != 64
            || !meta
                .sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()))
    {
        return Err(DesktopError::validation(
            "O hash da evidência é inválido.",
            "meta.sha256",
            "SHA-256 hexadecimal esperado.",
        ));
    }
    if bytes.is_empty() || bytes.len() > MAX_EVIDENCE_BYTES {
        return Err(DesktopError::validation(
            "O tamanho da evidência não é permitido.",
            "bytes",
            format!("Envie uma imagem entre 1 byte e {MAX_EVIDENCE_BYTES} bytes."),
        ));
    }
    if meta.size != bytes.len() as u64 {
        return Err(DesktopError::validation(
            "O tamanho informado não corresponde à evidência.",
            "meta.size",
            "Informe o tamanho exato do binário persistido.",
        ));
    }
    let signature_matches = match meta.mime_type.as_str() {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !signature_matches {
        return Err(DesktopError::validation(
            "O conteúdo não corresponde ao tipo de imagem informado.",
            "bytes",
            "Assinatura de imagem inválida.",
        ));
    }
    Ok(())
}

fn validate_evidence_reference(
    meta: &EvidenceMeta,
    mutations: &[StorageMutation],
) -> DesktopResult<()> {
    let run_payload = evidence_run_payload(mutations, &meta.run_id)?;
    let referenced = match meta.owner_type.as_str() {
        "step" => run_payload["results"]
            .get(&meta.owner_id)
            .and_then(|result| result.get("evidenceIds"))
            .and_then(Value::as_array)
            .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(&meta.id))),
        "exploratory" => run_payload["exploratoryRecords"]
            .as_array()
            .is_some_and(|records| {
                records.iter().any(|record| {
                    record["id"].as_str() == Some(&meta.owner_id)
                        && record["evidenceIds"]
                            .as_array()
                            .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(&meta.id)))
                })
            }),
        _ => false,
    };
    if !referenced {
        return Err(DesktopError::validation(
            "A evidência não está ligada ao resultado informado.",
            "meta.ownerId",
            "A mutação da execução precisa referenciar a evidência no mesmo commit.",
        ));
    }
    Ok(())
}

fn ensure_evidence_unreferenced(
    evidence_id: &str,
    mutations: &[StorageMutation],
) -> DesktopResult<()> {
    let mutation = mutations
        .iter()
        .find(|mutation| mutation.kind == EntityKind::Run)
        .ok_or_else(|| {
            DesktopError::validation(
                "A remoção precisa atualizar a execução proprietária.",
                "mutations",
                "Inclua uma mutação upsert da execução.",
            )
        })?;
    let payload = mutation.payload.as_ref().ok_or_else(|| {
        DesktopError::validation(
            "A remoção precisa atualizar a execução proprietária.",
            "mutations.payload",
            "Payload da execução esperado.",
        )
    })?;
    let still_referenced = payload["results"]
        .as_object()
        .into_iter()
        .flat_map(|results| results.values())
        .filter_map(|result| result["evidenceIds"].as_array())
        .flatten()
        .chain(
            payload["exploratoryRecords"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|record| record["evidenceIds"].as_array())
                .flatten(),
        )
        .any(|id| id.as_str() == Some(evidence_id));
    if still_referenced {
        return Err(DesktopError::validation(
            "A execução ainda referencia a evidência.",
            "mutations.payload",
            "Remova o ID de todos os resultados e exploratórios.",
        ));
    }
    Ok(())
}

fn evidence_run_payload<'a>(
    mutations: &'a [StorageMutation],
    run_id: &str,
) -> DesktopResult<&'a Value> {
    if mutations.len() != 1 {
        return Err(DesktopError::validation(
            "O commit de evidência deve atualizar somente a execução proprietária.",
            "mutations",
            "Envie uma única mutação de execução.",
        ));
    }
    let mutation = &mutations[0];
    if mutation.kind != EntityKind::Run
        || mutation.action != MutationAction::Upsert
        || mutation.id != run_id
    {
        return Err(DesktopError::validation(
            "A mutação não corresponde à execução da evidência.",
            "mutations",
            "Upsert da execução proprietária esperado.",
        ));
    }
    mutation.payload.as_ref().ok_or_else(|| {
        DesktopError::validation(
            "A mutação da execução não possui payload.",
            "mutations.payload",
            "Payload esperado.",
        )
    })
}

fn validate_case_payload(payload: &Value, expected_id: &str) -> DesktopResult<()> {
    let object = payload.as_object().ok_or_else(|| {
        DesktopError::validation(
            "O payload do caso deve ser um objeto.",
            "mutations.payload",
            "Objeto JSON esperado.",
        )
    })?;
    if object.get("schemaVersion").and_then(Value::as_u64) != Some(JSON_SCHEMA_VERSION as u64) {
        return Err(DesktopError::validation(
            "A versão do JSON do caso não é suportada.",
            "mutations.payload.schemaVersion",
            format!("Versão esperada: {JSON_SCHEMA_VERSION}."),
        ));
    }
    if object.get("id").and_then(Value::as_str) != Some(expected_id) {
        return Err(DesktopError::validation(
            "O ID do payload não corresponde ao envelope.",
            "mutations.payload.id",
            "Os IDs devem ser iguais.",
        ));
    }
    required_non_empty_string(object, "title", 500)?;
    required_non_empty_string(object, "createdAt", 64)?;
    required_non_empty_string(object, "updatedAt", 64)?;
    if object
        .get("revision")
        .and_then(Value::as_u64)
        .filter(|value| *value > 0)
        .is_none()
    {
        return Err(field_issue(
            "revision",
            "Informe uma revisão inteira positiva.",
        ));
    }
    if !matches!(
        object.get("priority").and_then(Value::as_str),
        Some("low" | "medium" | "high" | "critical")
    ) {
        return Err(field_issue("priority", "Prioridade inválida."));
    }
    if !matches!(
        object.get("status").and_then(Value::as_str),
        Some("active" | "draft" | "archived")
    ) {
        return Err(field_issue("status", "Status inválido."));
    }
    let steps = object
        .get("steps")
        .and_then(Value::as_array)
        .ok_or_else(|| field_issue("steps", "Informe ao menos uma etapa."))?;
    if steps.is_empty() || steps.len() > MAX_CASE_STEPS {
        return Err(field_issue(
            "steps",
            format!("Informe entre 1 e {MAX_CASE_STEPS} etapas."),
        ));
    }
    for (index, step) in steps.iter().enumerate() {
        let step = step.as_object().ok_or_else(|| {
            field_issue(&format!("steps.{index}"), "Cada etapa deve ser um objeto.")
        })?;
        required_non_empty_string_at(step, "id", 128, &format!("steps.{index}.id"))?;
        required_non_empty_string_at(step, "action", 10_000, &format!("steps.{index}.action"))?;
        required_non_empty_string_at(
            step,
            "expectedResult",
            10_000,
            &format!("steps.{index}.expectedResult"),
        )?;
        if !matches!(
            step.get("type").and_then(Value::as_str),
            Some("given" | "when" | "then" | "and")
        ) {
            return Err(field_issue(
                &format!("steps.{index}.type"),
                "Tipo de etapa inválido.",
            ));
        }
    }
    for array_field in ["path", "tags", "automationLinks", "externalReferences"] {
        if !object.get(array_field).is_some_and(Value::is_array) {
            return Err(field_issue(array_field, "Array esperado."));
        }
    }
    Ok(())
}

fn validate_plan_payload(
    transaction: &Transaction<'_>,
    payload: &Value,
    expected_id: &str,
) -> DesktopResult<()> {
    let object = validate_schema_identity(payload, expected_id, "plano")?;
    required_positive_u64(object, "revision")?;
    required_non_empty_string(object, "name", 500)?;
    required_non_empty_string(object, "project", 500)?;
    required_string(object, "description", 20_000)?;
    required_string(object, "objective", 20_000)?;
    required_string(object, "createdBy", 500)?;
    required_non_empty_string(object, "createdAt", 64)?;
    required_non_empty_string(object, "updatedAt", 64)?;
    if !matches!(
        object.get("status").and_then(Value::as_str),
        Some("active" | "draft" | "archived")
    ) {
        return Err(field_issue("status", "Status de plano inválido."));
    }
    if !object.get("tags").is_some_and(Value::is_array) {
        return Err(field_issue("tags", "Array esperado."));
    }
    let references = object
        .get("caseRefs")
        .and_then(Value::as_array)
        .ok_or_else(|| field_issue("caseRefs", "Array esperado."))?;
    if references.is_empty() {
        return Err(field_issue("caseRefs", "Informe ao menos um caso."));
    }
    let mut ids = HashSet::new();
    for (index, reference) in references.iter().enumerate() {
        let reference = reference
            .as_object()
            .ok_or_else(|| field_issue(&format!("caseRefs.{index}"), "Objeto esperado."))?;
        let case_id = reference
            .get("caseId")
            .and_then(Value::as_str)
            .filter(|value| is_safe_id(value, 128))
            .ok_or_else(|| field_issue(&format!("caseRefs.{index}.caseId"), "ID inválido."))?;
        if !ids.insert(case_id) {
            return Err(field_issue(
                &format!("caseRefs.{index}.caseId"),
                "Caso duplicado no plano.",
            ));
        }
        let revision = reference
            .get("caseRevision")
            .and_then(Value::as_u64)
            .filter(|revision| *revision > 0)
            .ok_or_else(|| {
                field_issue(
                    &format!("caseRefs.{index}.caseRevision"),
                    "Revisão inválida.",
                )
            })?;
        let exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM cases WHERE id = ?1 AND revision = ?2)",
            params![case_id, revision],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(field_issue(
                &format!("caseRefs.{index}"),
                "A revisão histórica do caso não existe.",
            ));
        }
    }
    Ok(())
}

fn validate_run_payload(
    transaction: &Transaction<'_>,
    payload: &Value,
    expected_id: &str,
) -> DesktopResult<()> {
    let object = validate_schema_identity(payload, expected_id, "execução")?;
    required_positive_u64(object, "attempt")?;
    let plan_id = required_safe_id(object, "planId")?;
    let plan_revision = required_positive_u64(object, "planRevision")?;
    let status = object
        .get("status")
        .and_then(Value::as_str)
        .filter(|status| {
            matches!(
                *status,
                "draft" | "in_progress" | "paused" | "completed" | "aborted"
            )
        })
        .ok_or_else(|| field_issue("status", "Status de execução inválido."))?;
    required_non_empty_string(object, "startedAt", 64)?;
    required_non_empty_string(object, "updatedAt", 64)?;
    if matches!(status, "completed" | "aborted") {
        required_non_empty_string(object, "finishedAt", 64)?;
    } else if object.get("finishedAt").is_some() {
        return Err(field_issue(
            "finishedAt",
            "Somente execuções concluídas ou abortadas possuem data de término.",
        ));
    }
    if let Some(source_run_id) = object.get("sourceRunId") {
        let source_run_id = source_run_id
            .as_str()
            .filter(|value| is_safe_id(value, 128))
            .ok_or_else(|| field_issue("sourceRunId", "Identificador inválido."))?;
        let source_exists: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM runs WHERE id = ?1)",
            [source_run_id],
            |row| row.get(0),
        )?;
        if !source_exists {
            return Err(field_issue(
                "sourceRunId",
                "A execução de origem não existe.",
            ));
        }
    }
    let context = object
        .get("context")
        .and_then(Value::as_object)
        .ok_or_else(|| field_issue("context", "Objeto esperado."))?;
    for field in [
        "environment",
        "build",
        "platform",
        "device",
        "browser",
        "tester",
        "notes",
    ] {
        required_string(context, field, 20_000)?;
    }

    let stored_plan_json: Option<String> = transaction
        .query_row(
            "SELECT payload_json FROM plans WHERE id = ?1 AND revision = ?2",
            params![plan_id, plan_revision],
            |row| row.get(0),
        )
        .optional()?;
    let stored_plan = stored_plan_json
        .as_deref()
        .map(parse_stored_json)
        .transpose()?
        .ok_or_else(|| field_issue("planRevision", "A revisão histórica do plano não existe."))?;
    let snapshot = object
        .get("snapshot")
        .and_then(Value::as_object)
        .ok_or_else(|| field_issue("snapshot", "Objeto esperado."))?;
    if snapshot.get("plan") != Some(&stored_plan) {
        return Err(field_issue(
            "snapshot.plan",
            "O snapshot do plano não corresponde à revisão persistida.",
        ));
    }
    let case_refs = stored_plan["caseRefs"]
        .as_array()
        .ok_or_else(|| field_issue("snapshot.plan.caseRefs", "Array esperado."))?;
    let snapshot_cases = snapshot
        .get("cases")
        .and_then(Value::as_array)
        .ok_or_else(|| field_issue("snapshot.cases", "Array esperado."))?;
    if case_refs.len() != snapshot_cases.len() {
        return Err(field_issue(
            "snapshot.cases",
            "A quantidade de casos não corresponde ao plano.",
        ));
    }
    let mut expected_result_keys = HashSet::new();
    for (index, (reference, snapshot_case)) in
        case_refs.iter().zip(snapshot_cases.iter()).enumerate()
    {
        let case_id = reference["caseId"].as_str().expect("validated plan ref");
        let case_revision = reference["caseRevision"]
            .as_u64()
            .expect("validated plan ref");
        let stored_case_json: String = transaction.query_row(
            "SELECT payload_json FROM cases WHERE id = ?1 AND revision = ?2",
            params![case_id, case_revision],
            |row| row.get(0),
        )?;
        let stored_case = parse_stored_json(&stored_case_json)?;
        if snapshot_case != &stored_case {
            return Err(field_issue(
                &format!("snapshot.cases.{index}"),
                "O caso não corresponde à revisão histórica do plano.",
            ));
        }
        for step in stored_case["steps"]
            .as_array()
            .expect("validated case steps")
        {
            expected_result_keys.insert(format!(
                "{case_id}::{}",
                step["id"].as_str().expect("validated step id")
            ));
        }
    }

    let results = object
        .get("results")
        .and_then(Value::as_object)
        .ok_or_else(|| field_issue("results", "Objeto esperado."))?;
    for (key, result) in results {
        if !expected_result_keys.contains(key) {
            return Err(field_issue(
                &format!("results.{key}"),
                "O resultado não pertence ao snapshot da execução.",
            ));
        }
        validate_step_result(result, key)?;
    }
    if status == "completed"
        && expected_result_keys.iter().any(|key| {
            results
                .get(key)
                .and_then(|result| result.get("status"))
                .and_then(Value::as_str)
                .is_none_or(|status| status == "not_run")
        })
    {
        return Err(field_issue(
            "results",
            "Uma execução concluída precisa ter resultado para todos os passos.",
        ));
    }
    let records = object
        .get("exploratoryRecords")
        .and_then(Value::as_array)
        .ok_or_else(|| field_issue("exploratoryRecords", "Array esperado."))?;
    for (index, record) in records.iter().enumerate() {
        let record = record.as_object().ok_or_else(|| {
            field_issue(&format!("exploratoryRecords.{index}"), "Objeto esperado.")
        })?;
        required_non_empty_string_at(record, "id", 128, &format!("exploratoryRecords.{index}.id"))?;
        required_non_empty_string_at(
            record,
            "title",
            500,
            &format!("exploratoryRecords.{index}.title"),
        )?;
        required_non_empty_string_at(
            record,
            "notes",
            20_000,
            &format!("exploratoryRecords.{index}.notes"),
        )?;
        if !record.get("evidenceIds").is_some_and(Value::is_array) {
            return Err(field_issue(
                &format!("exploratoryRecords.{index}.evidenceIds"),
                "Array esperado.",
            ));
        }
    }
    Ok(())
}

fn validate_step_result(result: &Value, key: &str) -> DesktopResult<()> {
    let result = result
        .as_object()
        .ok_or_else(|| field_issue(&format!("results.{key}"), "Objeto esperado."))?;
    let status = result
        .get("status")
        .and_then(Value::as_str)
        .filter(|status| {
            matches!(
                *status,
                "not_run" | "passed" | "failed" | "blocked" | "skipped"
            )
        })
        .ok_or_else(|| field_issue(&format!("results.{key}.status"), "Status inválido."))?;
    let actual = result
        .get("actualResult")
        .and_then(Value::as_str)
        .ok_or_else(|| field_issue(&format!("results.{key}.actualResult"), "Texto esperado."))?;
    if matches!(status, "failed" | "blocked") && actual.trim().is_empty() {
        return Err(field_issue(
            &format!("results.{key}.actualResult"),
            "Falha ou bloqueio exige resultado obtido.",
        ));
    }
    if !result.get("evidenceIds").is_some_and(Value::is_array) {
        return Err(field_issue(
            &format!("results.{key}.evidenceIds"),
            "Array esperado.",
        ));
    }
    required_non_empty_string_at(result, "updatedAt", 64, &format!("results.{key}.updatedAt"))?;
    Ok(())
}

fn validate_run_update(previous: &Value, next: &Value) -> DesktopResult<()> {
    let previous_status = previous["status"].as_str().unwrap_or_default();
    let next_status = next["status"].as_str().unwrap_or_default();
    if matches!(previous_status, "completed" | "aborted") {
        return Err(field_issue(
            "status",
            "Execuções concluídas ou abortadas são imutáveis.",
        ));
    }
    for field in [
        "schemaVersion",
        "id",
        "attempt",
        "sourceRunId",
        "planId",
        "planRevision",
        "context",
        "snapshot",
        "startedAt",
    ] {
        if previous.get(field) != next.get(field) {
            return Err(field_issue(
                field,
                "Este campo histórico não pode mudar após o início da execução.",
            ));
        }
    }
    let allowed = match previous_status {
        "draft" => matches!(next_status, "draft" | "in_progress" | "aborted"),
        "in_progress" => matches!(
            next_status,
            "in_progress" | "paused" | "completed" | "aborted"
        ),
        "paused" => matches!(next_status, "paused" | "in_progress" | "aborted"),
        _ => false,
    };
    if !allowed {
        return Err(field_issue(
            "status",
            format!("Transição de {previous_status} para {next_status} não permitida."),
        ));
    }
    Ok(())
}

fn validate_report_payload(
    transaction: &Transaction<'_>,
    payload: &Value,
    expected_id: &str,
) -> DesktopResult<()> {
    let object = payload
        .as_object()
        .ok_or_else(|| field_issue("$", "Objeto esperado."))?;
    validate_identity(object, expected_id)?;
    let run_id = required_safe_id(object, "runId")?;
    required_non_empty_string(object, "title", 500)?;
    required_string(object, "notes", 20_000)?;
    required_non_empty_string(object, "createdAt", 64)?;
    let run_exists: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM runs WHERE id = ?1)",
        [run_id],
        |row| row.get(0),
    )?;
    if !run_exists {
        return Err(field_issue("runId", "Execução não encontrada."));
    }
    Ok(())
}

fn validate_demand_column_payload(payload: &Value, expected_id: &str) -> DesktopResult<()> {
    let object = payload
        .as_object()
        .ok_or_else(|| field_issue("$", "Objeto esperado."))?;
    validate_identity(object, expected_id)?;
    required_non_empty_string(object, "name", 500)?;
    required_non_negative_u64(object, "order")?;
    required_non_empty_string(object, "createdAt", 64)?;
    required_non_empty_string(object, "updatedAt", 64)?;
    if !matches!(
        object.get("semantic").and_then(Value::as_str),
        Some("neutral" | "active" | "blocked" | "done")
    ) {
        return Err(field_issue("semantic", "Semântica de coluna inválida."));
    }
    Ok(())
}

fn validate_demand_payload(
    transaction: &Transaction<'_>,
    payload: &Value,
    expected_id: &str,
) -> DesktopResult<()> {
    let object = payload
        .as_object()
        .ok_or_else(|| field_issue("$", "Objeto esperado."))?;
    validate_identity(object, expected_id)?;
    required_non_empty_string(object, "title", 500)?;
    required_string(object, "description", 20_000)?;
    let column_id = required_safe_id(object, "columnId")?;
    required_non_negative_u64(object, "order")?;
    required_string(object, "assignee", 500)?;
    required_non_empty_string(object, "createdAt", 64)?;
    required_non_empty_string(object, "updatedAt", 64)?;
    if !matches!(
        object.get("priority").and_then(Value::as_str),
        Some("low" | "medium" | "high" | "critical")
    ) {
        return Err(field_issue("priority", "Prioridade inválida."));
    }
    for field in ["tags", "checklist", "links"] {
        if !object.get(field).is_some_and(Value::is_array) {
            return Err(field_issue(field, "Array esperado."));
        }
    }
    let column_exists: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM demand_columns WHERE id = ?1)",
        [column_id],
        |row| row.get(0),
    )?;
    if !column_exists {
        return Err(field_issue("columnId", "Coluna não encontrada."));
    }
    Ok(())
}

fn validate_schema_identity<'a>(
    payload: &'a Value,
    expected_id: &str,
    entity_label: &str,
) -> DesktopResult<&'a Map<String, Value>> {
    let object = payload.as_object().ok_or_else(|| {
        DesktopError::validation(
            format!("O payload do {entity_label} deve ser um objeto."),
            "mutations.payload",
            "Objeto JSON esperado.",
        )
    })?;
    if object.get("schemaVersion").and_then(Value::as_u64) != Some(JSON_SCHEMA_VERSION as u64) {
        return Err(field_issue(
            "schemaVersion",
            format!("Versão esperada: {JSON_SCHEMA_VERSION}."),
        ));
    }
    validate_identity(object, expected_id)?;
    Ok(object)
}

fn validate_identity(object: &Map<String, Value>, expected_id: &str) -> DesktopResult<()> {
    if object.get("id").and_then(Value::as_str) != Some(expected_id) {
        return Err(field_issue(
            "id",
            "O ID do payload não corresponde ao envelope.",
        ));
    }
    if !is_safe_id(expected_id, 128) {
        return Err(field_issue("id", "Identificador inválido."));
    }
    Ok(())
}

fn required_safe_id<'a>(object: &'a Map<String, Value>, field: &str) -> DesktopResult<&'a str> {
    let value = object
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| is_safe_id(value, 128))
        .ok_or_else(|| field_issue(field, "Identificador inválido."))?;
    Ok(value)
}

fn required_positive_u64(object: &Map<String, Value>, field: &str) -> DesktopResult<u64> {
    object
        .get(field)
        .and_then(Value::as_u64)
        .filter(|value| *value > 0)
        .ok_or_else(|| field_issue(field, "Informe um inteiro positivo."))
}

fn required_non_negative_u64(object: &Map<String, Value>, field: &str) -> DesktopResult<u64> {
    object
        .get(field)
        .and_then(Value::as_u64)
        .ok_or_else(|| field_issue(field, "Informe um inteiro não negativo."))
}

fn validate_settings_payload(payload: &Value) -> DesktopResult<()> {
    let object = payload.as_object().ok_or_else(|| {
        DesktopError::validation(
            "O payload de configurações deve ser um objeto.",
            "mutations.payload",
            "Objeto JSON esperado.",
        )
    })?;
    if !matches!(
        object.get("mode").and_then(Value::as_str),
        Some("browser" | "repository")
    ) {
        return Err(field_issue("mode", "Modo inválido."));
    }
    required_non_empty_string(object, "name", 200)?;
    required_string(object, "repositoryPath", 1024)?;
    if !object.get("compactEvidence").is_some_and(Value::is_boolean) {
        return Err(field_issue("compactEvidence", "Valor booleano esperado."));
    }
    Ok(())
}

fn required_non_empty_string(
    object: &Map<String, Value>,
    field: &str,
    max: usize,
) -> DesktopResult<()> {
    required_non_empty_string_at(object, field, max, field)
}

fn required_non_empty_string_at(
    object: &Map<String, Value>,
    field: &str,
    max: usize,
    path: &str,
) -> DesktopResult<()> {
    let value = object
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default();
    if value.trim().is_empty() || value.len() > max {
        return Err(field_issue(
            path,
            format!("Texto obrigatório com até {max} caracteres."),
        ));
    }
    Ok(())
}

fn required_string(object: &Map<String, Value>, field: &str, max: usize) -> DesktopResult<()> {
    let value = object
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| field_issue(field, "Texto esperado."))?;
    if value.len() > max {
        return Err(field_issue(field, format!("Limite: {max} caracteres.")));
    }
    Ok(())
}

fn field_issue(path: &str, message: impl Into<String>) -> DesktopError {
    DesktopError::validation(
        "O payload recebido não passou na validação.",
        &format!("mutations.payload.{path}"),
        message,
    )
}

fn is_safe_id(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}

fn is_safe_blob_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 220
        && value.ends_with(".blob")
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn load_payloads(conn: &Connection, sql: &str) -> DesktopResult<Vec<Value>> {
    let mut statement = conn.prepare(sql)?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let mut payloads = Vec::new();
    for row in rows {
        payloads.push(parse_stored_json(&row?)?);
    }
    Ok(payloads)
}

fn read_meta(conn: &Connection, key: &str) -> DesktopResult<String> {
    conn.query_row(
        "SELECT value FROM storage_meta WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
    .map_err(|_| {
        DesktopError::new(
            DesktopErrorCode::RecoveryRequired,
            "Os metadados obrigatórios do banco local estão ausentes.",
        )
    })
}

fn read_storage_revision(conn: &Connection) -> DesktopResult<u64> {
    read_meta(conn, "storage_revision")?.parse().map_err(|_| {
        DesktopError::new(
            DesktopErrorCode::RecoveryRequired,
            "A revisão global do banco local é inválida.",
        )
    })
}

fn advance_storage_revision(
    transaction: &Transaction<'_>,
    current_revision: u64,
) -> DesktopResult<(u64, String)> {
    let next_revision = current_revision.checked_add(1).ok_or_else(|| {
        DesktopError::new(
            DesktopErrorCode::Internal,
            "A revisão global do workspace atingiu o limite suportado.",
        )
    })?;
    let committed_at = sqlite_now(transaction)?;
    transaction.execute(
        "UPDATE storage_meta SET value = ?1 WHERE key = 'storage_revision'",
        [next_revision.to_string()],
    )?;
    transaction.execute(
        "UPDATE storage_meta SET value = ?1 WHERE key = 'last_committed_at'",
        [&committed_at],
    )?;
    Ok((next_revision, committed_at))
}

fn parse_stored_json(value: &str) -> DesktopResult<Value> {
    serde_json::from_str(value).map_err(|_| {
        DesktopError::new(
            DesktopErrorCode::RecoveryRequired,
            "O banco local contém um payload JSON inválido.",
        )
    })
}

fn sqlite_now(conn: &Connection) -> DesktopResult<String> {
    Ok(
        conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })?,
    )
}

fn ensure_integrity(conn: &Connection) -> DesktopResult<()> {
    let result: String = conn.query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;
    if result.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(DesktopError::new(
            DesktopErrorCode::RecoveryRequired,
            "A verificação de integridade encontrou inconsistências no banco local.",
        ))
    }
}

fn fail_if(
    actual: CommitFailpoint,
    expected: CommitFailpoint,
    operation_id: &str,
) -> DesktopResult<()> {
    if actual == expected {
        Err(DesktopError::new(
            DesktopErrorCode::Io,
            "Falha de gravação simulada pelo harness de consistência.",
        )
        .operation(operation_id)
        .retryable(true))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contracts::StorageMutation;
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    fn case_payload(id: &str, revision: u64, title: &str) -> Value {
        json!({
            "schemaVersion": 2,
            "id": id,
            "revision": revision,
            "title": title,
            "description": "",
            "path": [],
            "priority": "medium",
            "status": "active",
            "tags": [],
            "precondition": "",
            "steps": [{
                "id": "STEP-1",
                "type": "given",
                "action": "abrir o aplicativo",
                "expectedResult": "aplicativo aberto"
            }],
            "automationLinks": [],
            "externalReferences": [],
            "createdAt": "2026-08-29T12:00:00.000Z",
            "updatedAt": "2026-08-29T12:00:00.000Z"
        })
    }

    fn plan_payload(revision: u64, name: &str) -> Value {
        json!({
            "schemaVersion": 2,
            "id": "PLAN-1",
            "revision": revision,
            "name": name,
            "description": "Regressão principal",
            "objective": "Validar login",
            "project": "QA Flow",
            "status": "active",
            "tags": ["smoke"],
            "caseRefs": [{ "caseId": "CASE-1", "caseRevision": 1 }],
            "createdBy": "QA",
            "createdAt": "2026-08-29T12:01:00.000Z",
            "updatedAt": if revision == 1 {
                "2026-08-29T12:01:00.000Z"
            } else {
                "2026-08-29T13:00:00.000Z"
            }
        })
    }

    fn run_payload(status: &str, include_result: bool) -> Value {
        let mut payload = json!({
            "schemaVersion": 2,
            "id": "RUN-1",
            "attempt": 1,
            "planId": "PLAN-1",
            "planRevision": 1,
            "status": status,
            "context": {
                "environment": "local",
                "build": "2.1.0",
                "platform": "Windows",
                "device": "Desktop",
                "browser": "WebView2",
                "tester": "QA",
                "notes": ""
            },
            "snapshot": {
                "plan": plan_payload(1, "Plano de login"),
                "cases": [case_payload("CASE-1", 1, "Login")]
            },
            "results": if include_result { json!({
                "CASE-1::STEP-1": {
                    "status": "passed",
                    "actualResult": "Aplicativo aberto",
                    "evidenceIds": [],
                    "updatedAt": "2026-08-29T12:03:00.000Z"
                }
            }) } else { json!({}) },
            "exploratoryRecords": [],
            "startedAt": "2026-08-29T12:02:00.000Z",
            "updatedAt": if include_result {
                "2026-08-29T12:04:00.000Z"
            } else {
                "2026-08-29T12:02:00.000Z"
            }
        });
        if matches!(status, "completed" | "aborted") {
            payload["finishedAt"] = json!("2026-08-29T12:04:00.000Z");
        }
        payload
    }

    fn entity_commit(
        operation_id: &str,
        storage_revision: u64,
        mutation: StorageMutation,
    ) -> CommitRequest {
        CommitRequest {
            operation_id: operation_id.to_owned(),
            expected_storage_revision: storage_revision,
            mutations: vec![mutation],
        }
    }

    fn commit_request(
        storage_revision: u64,
        case_revision: ExpectedEntityRevision,
        payload_revision: u64,
    ) -> CommitRequest {
        CommitRequest {
            operation_id: format!("OP-{storage_revision}-{payload_revision}"),
            expected_storage_revision: storage_revision,
            mutations: vec![StorageMutation {
                kind: EntityKind::Case,
                action: MutationAction::Upsert,
                id: "CASE-1".to_owned(),
                expected_entity_revision: case_revision,
                payload: Some(case_payload("CASE-1", payload_revision, "Login")),
            }],
        }
    }

    fn open_temp_repository() -> (tempfile::TempDir, WorkspaceRepository) {
        let directory = tempfile::tempdir().expect("temp dir");
        let repository = WorkspaceRepository::open(&directory.path().join("qaflow.sqlite3"))
            .expect("open repository");
        (directory, repository)
    }

    fn seed_editable_run(repository: &mut WorkspaceRepository) {
        repository
            .commit(commit_request(0, ExpectedEntityRevision::Absent, 1))
            .expect("create case");
        repository
            .commit(entity_commit(
                "OP-PLAN-EVIDENCE",
                1,
                StorageMutation {
                    kind: EntityKind::Plan,
                    action: MutationAction::Upsert,
                    id: "PLAN-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Absent,
                    payload: Some(plan_payload(1, "Plano de login")),
                },
            ))
            .expect("create plan");
        repository
            .commit(entity_commit(
                "OP-RUN-EVIDENCE",
                2,
                StorageMutation {
                    kind: EntityKind::Run,
                    action: MutationAction::Upsert,
                    id: "RUN-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Omitted,
                    payload: Some(run_payload("in_progress", false)),
                },
            ))
            .expect("create run");
    }

    fn evidence_request(
        storage_revision: u64,
        operation_id: &str,
        evidence_ids: Vec<&str>,
    ) -> EvidenceRequest {
        let mut run = run_payload("in_progress", true);
        run["results"]["CASE-1::STEP-1"]["evidenceIds"] = json!(evidence_ids);
        EvidenceRequest {
            operation_id: operation_id.to_owned(),
            expected_storage_revision: storage_revision,
            meta: EvidenceMeta {
                id: "EVD-1".to_owned(),
                owner_type: "step".to_owned(),
                owner_id: "CASE-1::STEP-1".to_owned(),
                run_id: "RUN-1".to_owned(),
                name: "login.png".to_owned(),
                mime_type: "image/png".to_owned(),
                size: 15,
                sha256: "0".repeat(64),
                created_at: "2026-08-29T12:05:00.000Z".to_owned(),
            },
            mutations: vec![StorageMutation {
                kind: EntityKind::Run,
                action: MutationAction::Upsert,
                id: "RUN-1".to_owned(),
                expected_entity_revision: ExpectedEntityRevision::Omitted,
                payload: Some(run),
            }],
        }
    }

    #[test]
    fn new_database_uses_required_pragmas_and_metadata() {
        let (_directory, repository) = open_temp_repository();
        let foreign_keys: u32 = repository
            .connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .expect("foreign keys");
        let synchronous: u32 = repository
            .connection
            .pragma_query_value(None, "synchronous", |row| row.get(0))
            .expect("synchronous");
        let journal: String = repository
            .connection
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .expect("journal mode");
        let trusted_schema: u32 = repository
            .connection
            .pragma_query_value(None, "trusted_schema", |row| row.get(0))
            .expect("trusted schema");

        assert_eq!(foreign_keys, 1);
        assert_eq!(synchronous, 2);
        assert_eq!(journal.to_ascii_lowercase(), "wal");
        assert_eq!(trusted_schema, 0);
        assert_eq!(
            read_storage_revision(&repository.connection).expect("revision"),
            0
        );
    }

    #[test]
    fn case_survives_reopen_and_keeps_revision_history() {
        let (directory, mut repository) = open_temp_repository();
        repository
            .commit(commit_request(0, ExpectedEntityRevision::Absent, 1))
            .expect("create case");
        repository
            .commit(commit_request(1, ExpectedEntityRevision::Revision(1), 2))
            .expect("revise case");
        drop(repository);

        let reopened = WorkspaceRepository::open(&directory.path().join("qaflow.sqlite3"))
            .expect("reopen repository");
        let snapshot = reopened.snapshot().expect("snapshot");
        let history_count: u32 = reopened
            .connection
            .query_row(
                "SELECT count(*) FROM cases WHERE id = 'CASE-1'",
                [],
                |row| row.get(0),
            )
            .expect("history count");

        assert_eq!(snapshot.storage_revision, 2);
        assert_eq!(snapshot.workspace["cases"][0]["revision"], 2);
        assert_eq!(history_count, 2);
    }

    #[test]
    fn workspace_settings_survive_reopen() {
        let (directory, mut repository) = open_temp_repository();
        repository
            .commit(CommitRequest {
                operation_id: "OP-SETTINGS".to_owned(),
                expected_storage_revision: 0,
                mutations: vec![StorageMutation {
                    kind: EntityKind::Settings,
                    action: MutationAction::Upsert,
                    id: "workspace".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Omitted,
                    payload: Some(json!({
                        "mode": "browser",
                        "name": "Workspace persistente",
                        "repositoryPath": ".qaflow",
                        "compactEvidence": false
                    })),
                }],
            })
            .expect("commit settings");
        drop(repository);

        let reopened = WorkspaceRepository::open(&directory.path().join("qaflow.sqlite3"))
            .expect("reopen repository");
        let snapshot = reopened.snapshot().expect("snapshot");

        assert_eq!(snapshot.storage_revision, 1);
        assert_eq!(
            snapshot.workspace["settings"]["name"],
            "Workspace persistente"
        );
        assert_eq!(snapshot.workspace["settings"]["compactEvidence"], false);
    }

    #[test]
    fn case_plan_run_report_journey_survives_restart_without_historical_drift() {
        let (directory, mut repository) = open_temp_repository();
        repository
            .commit(commit_request(0, ExpectedEntityRevision::Absent, 1))
            .expect("create case");
        repository
            .commit(entity_commit(
                "OP-PLAN-1",
                1,
                StorageMutation {
                    kind: EntityKind::Plan,
                    action: MutationAction::Upsert,
                    id: "PLAN-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Absent,
                    payload: Some(plan_payload(1, "Plano de login")),
                },
            ))
            .expect("create plan");
        repository
            .commit(entity_commit(
                "OP-RUN-1",
                2,
                StorageMutation {
                    kind: EntityKind::Run,
                    action: MutationAction::Upsert,
                    id: "RUN-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Omitted,
                    payload: Some(run_payload("in_progress", false)),
                },
            ))
            .expect("create run");
        repository
            .commit(entity_commit(
                "OP-RUN-RESULT",
                3,
                StorageMutation {
                    kind: EntityKind::Run,
                    action: MutationAction::Upsert,
                    id: "RUN-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Omitted,
                    payload: Some(run_payload("in_progress", true)),
                },
            ))
            .expect("persist result");
        repository
            .commit(entity_commit(
                "OP-RUN-COMPLETE",
                4,
                StorageMutation {
                    kind: EntityKind::Run,
                    action: MutationAction::Upsert,
                    id: "RUN-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Omitted,
                    payload: Some(run_payload("completed", true)),
                },
            ))
            .expect("complete run");
        repository
            .commit(entity_commit(
                "OP-REPORT-1",
                5,
                StorageMutation {
                    kind: EntityKind::Report,
                    action: MutationAction::Upsert,
                    id: "REPORT-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Omitted,
                    payload: Some(json!({
                        "id": "REPORT-1",
                        "runId": "RUN-1",
                        "title": "Relatório de login",
                        "notes": "Snapshot validado",
                        "createdAt": "2026-08-29T12:05:00.000Z"
                    })),
                },
            ))
            .expect("create report");
        repository
            .commit(entity_commit(
                "OP-PLAN-2",
                6,
                StorageMutation {
                    kind: EntityKind::Plan,
                    action: MutationAction::Upsert,
                    id: "PLAN-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Revision(1),
                    payload: Some(plan_payload(2, "Plano de login revisado")),
                },
            ))
            .expect("revise plan after run");
        drop(repository);

        let reopened = WorkspaceRepository::open(&directory.path().join("qaflow.sqlite3"))
            .expect("reopen repository");
        let snapshot = reopened.snapshot().expect("snapshot after restart");
        assert_eq!(snapshot.storage_revision, 7);
        assert_eq!(
            snapshot.workspace["cases"].as_array().map(Vec::len),
            Some(1)
        );
        assert_eq!(
            snapshot.workspace["plans"].as_array().map(Vec::len),
            Some(1)
        );
        assert_eq!(snapshot.workspace["plans"][0]["revision"], 2);
        assert_eq!(snapshot.workspace["runs"].as_array().map(Vec::len), Some(1));
        assert_eq!(snapshot.workspace["runs"][0]["status"], "completed");
        assert_eq!(
            snapshot.workspace["runs"][0]["snapshot"]["plan"]["revision"],
            1
        );
        assert_eq!(
            snapshot.workspace["runs"][0]["snapshot"]["plan"]["name"],
            "Plano de login"
        );
        assert_eq!(
            snapshot.workspace["reports"].as_array().map(Vec::len),
            Some(1)
        );
        let plan_history: u64 = reopened
            .connection
            .query_row(
                "SELECT count(*) FROM plans WHERE id = 'PLAN-1'",
                [],
                |row| row.get(0),
            )
            .expect("plan history");
        assert_eq!(plan_history, 2);
    }

    #[test]
    fn demands_columns_and_preferences_survive_restart() {
        let (directory, mut repository) = open_temp_repository();
        repository
            .commit(entity_commit(
                "OP-DEMAND-1",
                0,
                StorageMutation {
                    kind: EntityKind::Demand,
                    action: MutationAction::Upsert,
                    id: "DEM-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Omitted,
                    payload: Some(json!({
                        "id": "DEM-1",
                        "title": "Validar login",
                        "description": "",
                        "columnId": "COL-BACKLOG",
                        "order": 0,
                        "priority": "high",
                        "assignee": "QA",
                        "tags": ["smoke"],
                        "checklist": [],
                        "links": [],
                        "createdAt": "2026-08-29T12:00:00.000Z",
                        "updatedAt": "2026-08-29T12:00:00.000Z"
                    })),
                },
            ))
            .expect("create demand");
        let mut preferences = Map::new();
        preferences.insert("sidebarCollapsed".to_owned(), json!(true));
        preferences.insert("demandViewMode".to_owned(), json!("sidebar"));
        repository
            .set_preferences(&preferences)
            .expect("persist preferences");
        drop(repository);

        let reopened = WorkspaceRepository::open(&directory.path().join("qaflow.sqlite3"))
            .expect("reopen repository");
        let snapshot = reopened.snapshot().expect("snapshot after restart");
        assert_eq!(
            snapshot.workspace["demandColumns"].as_array().map(Vec::len),
            Some(7)
        );
        assert_eq!(snapshot.workspace["demands"][0]["id"], "DEM-1");
        assert_eq!(
            reopened.preferences().expect("read preferences")["sidebarCollapsed"],
            true
        );
        assert_eq!(
            reopened.preferences().expect("read preferences")["demandViewMode"],
            "sidebar"
        );
        assert_eq!(snapshot.storage_revision, 1);
    }

    #[test]
    fn evidence_blob_and_metadata_survive_restart_and_are_verified() {
        let (directory, mut repository) = open_temp_repository();
        seed_editable_run(&mut repository);
        let evidence_dir = directory.path().join("evidence");
        fs::create_dir_all(&evidence_dir).expect("evidence directory");
        let bytes = b"\x89PNG\r\n\x1a\nfixture";

        let response = repository
            .add_evidence(
                evidence_request(3, "OP-EVIDENCE-ADD", vec!["EVD-1"]),
                bytes,
                &evidence_dir,
            )
            .expect("add evidence");
        assert_eq!(response.storage_revision, 4);
        assert_eq!(
            repository
                .read_evidence("EVD-1", &evidence_dir)
                .expect("read evidence")
                .bytes,
            bytes
        );
        assert_eq!(
            repository.snapshot().expect("snapshot").workspace["evidence"][0]["id"],
            "EVD-1"
        );
        assert_eq!(
            repository
                .verify_integrity(&evidence_dir)
                .expect("integrity")
                .status,
            WorkspaceHealthStatus::Healthy
        );
        drop(repository);

        let reopened = WorkspaceRepository::open(&directory.path().join("qaflow.sqlite3"))
            .expect("reopen repository");
        assert_eq!(
            reopened
                .read_evidence("EVD-1", &evidence_dir)
                .expect("read after restart")
                .bytes,
            bytes
        );
        fs::write(evidence_dir.join("EVD-1.blob"), b"corrupt").expect("corrupt fixture");
        assert_eq!(
            reopened
                .verify_integrity(&evidence_dir)
                .expect("degraded integrity")
                .status,
            WorkspaceHealthStatus::Degraded
        );
        assert_eq!(
            reopened
                .read_evidence("EVD-1", &evidence_dir)
                .expect_err("corrupt evidence")
                .code,
            DesktopErrorCode::CorruptStorage
        );
    }

    #[test]
    fn integral_bundle_round_trip_preserves_entities_and_evidence_bytes() {
        let (source_directory, mut source) = open_temp_repository();
        seed_editable_run(&mut source);
        let source_evidence = source_directory.path().join("evidence");
        fs::create_dir_all(&source_evidence).expect("source evidence directory");
        let bytes = b"\x89PNG\r\n\x1a\nfixture";
        let data_url = format!("data:image/png;base64,{}", STANDARD.encode(bytes));
        let mut request = evidence_request(3, "OP-BUNDLE-EVIDENCE", vec!["EVD-1"]);
        request.meta.sha256 = hex_sha256(data_url.as_bytes());
        source
            .add_evidence(request, bytes, &source_evidence)
            .expect("seed evidence");
        let bundle = source
            .export_bundle(&source_evidence)
            .expect("export integral bundle");

        let (target_directory, mut target) = open_temp_repository();
        let target_evidence = target_directory.path().join("evidence");
        fs::create_dir_all(&target_evidence).expect("target evidence directory");
        let restored = target
            .apply_bundle(&bundle, ImportMode::Replace, 0, &target_evidence)
            .expect("restore bundle");

        assert_eq!(restored.workspace["cases"], bundle.value["cases"]);
        assert_eq!(restored.workspace["plans"], bundle.value["plans"]);
        assert_eq!(restored.workspace["runs"], bundle.value["runs"]);
        assert_eq!(restored.workspace["evidence"][0]["id"], "EVD-1");
        assert_eq!(
            target
                .read_evidence("EVD-1", &target_evidence)
                .expect("read restored evidence")
                .bytes,
            bytes
        );
        assert_eq!(
            target
                .verify_integrity(&target_evidence)
                .expect("restored integrity")
                .status,
            WorkspaceHealthStatus::Healthy
        );
    }

    #[test]
    fn evidence_removal_updates_run_and_metadata_before_deleting_blob() {
        let (directory, mut repository) = open_temp_repository();
        seed_editable_run(&mut repository);
        let evidence_dir = directory.path().join("evidence");
        fs::create_dir_all(&evidence_dir).expect("evidence directory");
        repository
            .add_evidence(
                evidence_request(3, "OP-EVIDENCE-ADD", vec!["EVD-1"]),
                b"\x89PNG\r\n\x1a\nfixture",
                &evidence_dir,
            )
            .expect("add evidence");

        let request = evidence_request(4, "OP-EVIDENCE-REMOVE-RUN", vec![]);
        let response = repository
            .remove_evidence(
                RemoveEvidenceRequest {
                    operation_id: "OP-EVIDENCE-REMOVE".to_owned(),
                    expected_storage_revision: 4,
                    evidence_id: "EVD-1".to_owned(),
                    mutations: request.mutations,
                },
                &evidence_dir,
            )
            .expect("remove evidence");
        assert_eq!(response.storage_revision, 5);
        assert!(!evidence_dir.join("EVD-1.blob").exists());
        let snapshot = repository.snapshot().expect("snapshot");
        assert_eq!(
            snapshot.workspace["evidence"].as_array().map(Vec::len),
            Some(0)
        );
        assert_eq!(
            snapshot.workspace["runs"][0]["results"]["CASE-1::STEP-1"]["evidenceIds"]
                .as_array()
                .map(Vec::len),
            Some(0)
        );
    }

    #[test]
    #[ignore = "perfil NFR manual: cargo test metadata_profile -- --ignored --nocapture"]
    fn metadata_profile_meets_initial_phase_four_budgets() {
        let (_directory, mut repository) = open_temp_repository();
        let transaction = repository
            .connection
            .transaction()
            .expect("profile transaction");
        for index in 0..10_000 {
            let id = format!("CASE-PROFILE-{index}");
            let payload = format!(r#"{{"id":"{id}"}}"#);
            transaction
                .execute(
                    "INSERT INTO cases(id, revision, payload_json, created_at, updated_at, content_hash)
                     VALUES (?1, 1, ?2, '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z', 'hash')",
                    params![id, payload],
                )
                .expect("profile case");
            transaction
                .execute(
                    "INSERT INTO case_heads(id, current_revision) VALUES (?1, 1)",
                    [id],
                )
                .expect("profile case head");
        }
        for index in 0..1_000 {
            let id = format!("PLAN-PROFILE-{index}");
            let payload = format!(r#"{{"id":"{id}"}}"#);
            transaction
                .execute(
                    "INSERT INTO plans(id, revision, payload_json, created_at, updated_at, content_hash)
                     VALUES (?1, 1, ?2, '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z', 'hash')",
                    params![id, payload],
                )
                .expect("profile plan");
            transaction
                .execute(
                    "INSERT INTO plan_heads(id, current_revision) VALUES (?1, 1)",
                    [id],
                )
                .expect("profile plan head");
        }
        let mut results = Map::new();
        for index in 0..20 {
            results.insert(
                format!("CASE::{index}"),
                json!({ "status": "passed", "actualResult": "ok" }),
            );
        }
        for index in 0..5_000 {
            let id = format!("RUN-PROFILE-{index}");
            let plan_id = format!("PLAN-PROFILE-{}", index % 1_000);
            let payload = serde_json::to_string(&json!({
                "id": id,
                "results": results,
            }))
            .expect("profile run json");
            transaction
                .execute(
                    "INSERT INTO runs(
                        id, plan_id, plan_revision, status, started_at, updated_at, payload_json, content_hash
                     ) VALUES (?1, ?2, 1, 'completed', '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z', ?3, 'hash')",
                    params![id, plan_id, payload],
                )
                .expect("profile run");
            let report_id = format!("REPORT-PROFILE-{index}");
            transaction
                .execute(
                    "INSERT INTO reports(id, run_id, created_at, payload_json, content_hash)
                     VALUES (?1, ?2, '2026-08-29T00:00:00Z', ?3, 'hash')",
                    params![report_id, id, format!(r#"{{"id":"{report_id}"}}"#)],
                )
                .expect("profile report");
        }
        transaction.commit().expect("profile fixture commit");

        let started = std::time::Instant::now();
        let snapshot = repository.snapshot().expect("profile snapshot");
        let boot_elapsed = started.elapsed();
        assert_eq!(
            snapshot.workspace["cases"].as_array().map(Vec::len),
            Some(10_000)
        );
        assert_eq!(
            snapshot.workspace["plans"].as_array().map(Vec::len),
            Some(1_000)
        );
        assert_eq!(
            snapshot.workspace["runs"].as_array().map(Vec::len),
            Some(5_000)
        );
        assert_eq!(
            snapshot.workspace["reports"].as_array().map(Vec::len),
            Some(5_000)
        );
        assert!(
            boot_elapsed <= Duration::from_millis(2_500),
            "boot profile exceeded 2.5s: {boot_elapsed:?}"
        );

        let mut commit_samples = Vec::new();
        for index in 0..30 {
            let started = std::time::Instant::now();
            repository
                .commit(entity_commit(
                    &format!("OP-PROFILE-{index}"),
                    index,
                    StorageMutation {
                        kind: EntityKind::Demand,
                        action: MutationAction::Upsert,
                        id: format!("DEM-PROFILE-{index}"),
                        expected_entity_revision: ExpectedEntityRevision::Omitted,
                        payload: Some(json!({
                            "id": format!("DEM-PROFILE-{index}"),
                            "title": "Perfil",
                            "description": "",
                            "columnId": "COL-BACKLOG",
                            "order": index,
                            "priority": "medium",
                            "assignee": "",
                            "tags": [],
                            "checklist": [],
                            "links": [],
                            "createdAt": "2026-08-29T00:00:00Z",
                            "updatedAt": "2026-08-29T00:00:00Z"
                        })),
                    },
                ))
                .expect("profile metadata commit");
            commit_samples.push(started.elapsed());
        }
        commit_samples.sort();
        let p95 = commit_samples[28];
        println!("phase4 profile: boot={boot_elapsed:?}, commit_p95={p95:?}");
        assert!(
            p95 <= Duration::from_millis(300),
            "metadata commit p95 exceeded 300ms: {p95:?}"
        );
    }

    #[test]
    fn storage_and_entity_conflicts_are_deterministic() {
        let (_directory, mut repository) = open_temp_repository();
        repository
            .commit(commit_request(0, ExpectedEntityRevision::Absent, 1))
            .expect("create case");

        let stale_storage = repository
            .commit(commit_request(0, ExpectedEntityRevision::Revision(1), 2))
            .expect_err("stale storage");
        assert_eq!(stale_storage.code, DesktopErrorCode::Conflict);
        assert_eq!(stale_storage.current_storage_revision, Some(1));

        let stale_entity = repository
            .commit(commit_request(1, ExpectedEntityRevision::Absent, 2))
            .expect_err("stale entity");
        assert_eq!(stale_entity.code, DesktopErrorCode::Conflict);
        assert_eq!(repository.snapshot().expect("snapshot").storage_revision, 1);
    }

    #[test]
    fn failpoints_leave_the_old_or_complete_new_state() {
        for failpoint in [
            CommitFailpoint::AfterBegin,
            CommitFailpoint::AfterFirstMutation,
            CommitFailpoint::BeforeCommit,
        ] {
            let (directory, mut repository) = open_temp_repository();
            repository
                .commit_with_failpoint(
                    commit_request(0, ExpectedEntityRevision::Absent, 1),
                    failpoint,
                )
                .expect_err("fail before commit");
            drop(repository);
            let reopened = WorkspaceRepository::open(&directory.path().join("qaflow.sqlite3"))
                .expect("reopen old state");
            assert_eq!(reopened.snapshot().expect("snapshot").storage_revision, 0);
            assert_eq!(
                reopened.snapshot().expect("snapshot").workspace["cases"],
                json!([])
            );
        }

        let (directory, mut repository) = open_temp_repository();
        repository
            .commit_with_failpoint(
                commit_request(0, ExpectedEntityRevision::Absent, 1),
                CommitFailpoint::AfterCommit,
            )
            .expect_err("simulated lost acknowledgement");
        drop(repository);
        let reopened = WorkspaceRepository::open(&directory.path().join("qaflow.sqlite3"))
            .expect("reopen committed state");
        assert_eq!(reopened.snapshot().expect("snapshot").storage_revision, 1);
        assert_eq!(
            reopened.snapshot().expect("snapshot").workspace["cases"][0]["revision"],
            1
        );
    }

    #[test]
    fn invalid_payload_rolls_back_the_entire_commit() {
        let (_directory, mut repository) = open_temp_repository();
        let request = CommitRequest {
            operation_id: "OP-ATOMIC".to_owned(),
            expected_storage_revision: 0,
            mutations: vec![
                StorageMutation {
                    kind: EntityKind::Settings,
                    action: MutationAction::Upsert,
                    id: "workspace".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Omitted,
                    payload: Some(json!({
                        "mode": "browser",
                        "name": "Alterado",
                        "repositoryPath": ".qaflow",
                        "compactEvidence": true
                    })),
                },
                StorageMutation {
                    kind: EntityKind::Case,
                    action: MutationAction::Upsert,
                    id: "CASE-1".to_owned(),
                    expected_entity_revision: ExpectedEntityRevision::Absent,
                    payload: Some(json!({ "schemaVersion": 2, "id": "CASE-1" })),
                },
            ],
        };

        repository
            .commit(request)
            .expect_err("invalid second mutation");
        let snapshot = repository.snapshot().expect("snapshot");
        assert_eq!(snapshot.storage_revision, 0);
        assert_eq!(snapshot.workspace["settings"]["name"], "Meu workspace");
    }

    #[test]
    fn corrupt_database_is_never_replaced_with_an_empty_one() {
        let directory = tempfile::tempdir().expect("temp dir");
        let database_path = directory.path().join("qaflow.sqlite3");
        std::fs::write(&database_path, b"not a sqlite database").expect("write corruption");
        let original = std::fs::read(&database_path).expect("read original");

        let error = WorkspaceRepository::open(&database_path).expect_err("reject corruption");

        assert_eq!(error.code, DesktopErrorCode::RecoveryRequired);
        assert_eq!(
            std::fs::read(database_path).expect("read after failure"),
            original
        );
    }
}
