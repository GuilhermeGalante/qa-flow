use std::{collections::HashSet, path::Path, time::Duration};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde_json::{json, Map, Value};

use crate::{
    contracts::{
        ChangedEntity, CommitRequest, CommitResponse, DesktopError, DesktopErrorCode, EntityKind,
        ExpectedEntityRevision, IntegrityReport, MutationAction, StorageMutation, ValidationIssue,
        WorkspaceHealth, WorkspaceHealthStatus, WorkspaceSnapshot, IPC_CONTRACT_VERSION,
    },
    error::DesktopResult,
    storage::migrations::{self, hex_sha256, JSON_SCHEMA_VERSION},
};

const MAX_MUTATIONS: usize = 64;
const MAX_MUTATION_BYTES: usize = 512 * 1024;
const MAX_COMMIT_BYTES: usize = 2 * 1024 * 1024;
const MAX_CASE_STEPS: usize = 500;

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
        let workspace_created_at = read_meta(&self.connection, "workspace_created_at")?;
        let committed_at = read_meta(&self.connection, "last_committed_at")?;
        let settings_json: String = self.connection.query_row(
            "SELECT payload_json FROM workspace_settings WHERE singleton_id = 1",
            [],
            |row| row.get(0),
        )?;
        let settings: Value = parse_stored_json(&settings_json)?;

        let mut statement = self.connection.prepare(
            "SELECT c.payload_json
             FROM case_heads h
             JOIN cases c ON c.id = h.id AND c.revision = h.current_revision
             ORDER BY c.updated_at DESC, c.id ASC",
        )?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        let mut cases = Vec::new();
        for row in rows {
            cases.push(parse_stored_json(&row?)?);
        }

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
                "plans": [],
                "runs": [],
                "reports": [],
                "evidence": [],
                "demandColumns": default_demand_columns(&workspace_created_at),
                "demands": [],
                "settings": settings,
                "migrationReport": Value::Null,
            }),
        })
    }

    pub fn commit(&mut self, request: CommitRequest) -> DesktopResult<CommitResponse> {
        self.commit_with_failpoint(request, CommitFailpoint::None)
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

    pub fn verify_integrity(&self) -> DesktopResult<IntegrityReport> {
        let checked_at = sqlite_now(&self.connection)?;
        let result: String = self
            .connection
            .query_row("PRAGMA quick_check(1)", [], |row| row.get(0))?;
        if result.eq_ignore_ascii_case("ok") {
            Ok(IntegrityReport {
                status: WorkspaceHealthStatus::Healthy,
                checked_at,
                issues: Vec::new(),
            })
        } else {
            Ok(IntegrityReport {
                status: WorkspaceHealthStatus::RecoveryRequired,
                checked_at,
                issues: vec![ValidationIssue {
                    path: "workspace".to_owned(),
                    message: "A verificação de integridade encontrou inconsistências.".to_owned(),
                }],
            })
        }
    }
}

fn apply_mutation(
    transaction: &Transaction<'_>,
    mutation: &StorageMutation,
) -> DesktopResult<ChangedEntity> {
    match mutation.kind {
        EntityKind::Case => apply_case_mutation(transaction, mutation),
        EntityKind::Settings => apply_settings_mutation(transaction, mutation),
        _ => Err(DesktopError::validation(
            "Esta entidade ainda não está habilitada no SQLite.",
            "mutations.kind",
            "Planos, execuções, relatórios e demandas serão habilitados na Fase 4.",
        )),
    }
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

fn default_demand_columns(now: &str) -> Vec<Value> {
    [
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
    .map(|(order, (id, name, semantic))| {
        json!({
            "id": id,
            "name": name,
            "semantic": semantic,
            "order": order,
            "createdAt": now,
            "updatedAt": now,
        })
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contracts::StorageMutation;

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
