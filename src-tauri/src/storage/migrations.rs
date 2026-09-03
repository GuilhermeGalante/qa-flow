use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use sha2::{Digest, Sha256};

use crate::{
    contracts::{DesktopError, DesktopErrorCode},
    error::DesktopResult,
};

pub const STORAGE_FORMAT_VERSION: u32 = 3;
pub const JSON_SCHEMA_VERSION: u32 = 2;
pub const BUNDLE_IDENTIFIER: &str = "dev.qaflow.app";

const MIGRATION_V1: &str = r#"
CREATE TABLE storage_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE workspace_settings (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    revision INTEGER NOT NULL CHECK (revision >= 1),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    updated_at TEXT NOT NULL,
    content_hash TEXT NOT NULL
) STRICT;

CREATE TABLE cases (
    id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    PRIMARY KEY (id, revision)
) STRICT;

CREATE TABLE case_heads (
    id TEXT PRIMARY KEY NOT NULL,
    current_revision INTEGER NOT NULL CHECK (current_revision >= 1),
    FOREIGN KEY (id, current_revision) REFERENCES cases(id, revision)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE migration_receipts (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
) STRICT;
"#;

const MIGRATION_V2: &str = r#"
CREATE TABLE plans (
    id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    PRIMARY KEY (id, revision)
) STRICT;

CREATE TABLE plan_heads (
    id TEXT PRIMARY KEY NOT NULL,
    current_revision INTEGER NOT NULL CHECK (current_revision >= 1),
    FOREIGN KEY (id, current_revision) REFERENCES plans(id, revision)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE runs (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL,
    plan_revision INTEGER NOT NULL CHECK (plan_revision >= 1),
    status TEXT NOT NULL CHECK (status IN ('draft', 'in_progress', 'paused', 'completed', 'aborted')),
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    content_hash TEXT NOT NULL,
    FOREIGN KEY (plan_id, plan_revision) REFERENCES plans(id, revision)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE reports (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    content_hash TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE demand_columns (
    id TEXT PRIMARY KEY NOT NULL,
    display_order INTEGER NOT NULL CHECK (display_order >= 0),
    semantic TEXT NOT NULL CHECK (semantic IN ('neutral', 'active', 'blocked', 'done')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    content_hash TEXT NOT NULL
) STRICT;

CREATE TABLE demands (
    id TEXT PRIMARY KEY NOT NULL,
    column_id TEXT NOT NULL,
    display_order INTEGER NOT NULL CHECK (display_order >= 0),
    updated_at TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    content_hash TEXT NOT NULL,
    FOREIGN KEY (column_id) REFERENCES demand_columns(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE TABLE app_preferences (
    key TEXT PRIMARY KEY NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_cases_current_order ON cases(updated_at DESC, id);
CREATE INDEX idx_plans_current_order ON plans(updated_at DESC, id);
CREATE INDEX idx_runs_plan_started ON runs(plan_id, started_at DESC);
CREATE INDEX idx_runs_updated ON runs(updated_at DESC, id);
CREATE INDEX idx_reports_run_created ON reports(run_id, created_at DESC);
CREATE INDEX idx_reports_created ON reports(created_at DESC, id);
CREATE INDEX idx_demand_columns_order ON demand_columns(display_order, id);
CREATE INDEX idx_demands_column_order ON demands(column_id, display_order, id);
CREATE INDEX idx_demands_updated ON demands(updated_at DESC, id);
"#;

const MIGRATION_V3: &str = r#"
CREATE TABLE evidence (
    id TEXT PRIMARY KEY NOT NULL,
    run_id TEXT NOT NULL,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('step', 'exploratory')),
    owner_id TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    blob_name TEXT NOT NULL UNIQUE,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    blob_hash TEXT NOT NULL CHECK (length(blob_hash) = 64),
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    content_hash TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_evidence_run_created ON evidence(run_id, created_at, id);
"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
enum MigrationFailpoint {
    #[default]
    None,
    AfterSchema,
    BeforeCommit,
}

pub fn run(conn: &mut Connection) -> DesktopResult<()> {
    run_inner(conn, MigrationFailpoint::None)
}

fn run_inner(conn: &mut Connection, failpoint: MigrationFailpoint) -> DesktopResult<()> {
    let current: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if current > STORAGE_FORMAT_VERSION {
        return Err(DesktopError::new(
            DesktopErrorCode::UnsupportedSchema,
            "Este banco foi criado por uma versão mais nova do QA Flow.",
        ));
    }
    if current == STORAGE_FORMAT_VERSION {
        verify_receipts(conn, current)?;
        return Ok(());
    }

    if current == 0 {
        apply_v1(conn, failpoint)?;
    } else {
        verify_receipts(conn, current)?;
    }
    let current: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if current == 1 {
        apply_v2(conn, failpoint)?;
    }
    let current: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if current == 2 {
        apply_v3(conn, failpoint)?;
    }
    Ok(())
}

fn apply_v1(conn: &mut Connection, failpoint: MigrationFailpoint) -> DesktopResult<()> {
    let transaction = conn.transaction_with_behavior(TransactionBehavior::Exclusive)?;
    transaction.execute_batch(MIGRATION_V1)?;
    migration_fail_if(failpoint, MigrationFailpoint::AfterSchema)?;
    let now = sqlite_now(&transaction)?;
    let default_settings = r#"{"mode":"browser","name":"Meu workspace","repositoryPath":".qaflow","compactEvidence":true}"#;
    let settings_hash = hex_sha256(default_settings.as_bytes());

    for (key, value) in [
        ("storage_format_version", "1".to_owned()),
        ("storage_revision", "0".to_owned()),
        ("workspace_created_at", now.clone()),
        ("last_committed_at", String::new()),
        ("bundle_identifier", BUNDLE_IDENTIFIER.to_owned()),
        ("schema_version", JSON_SCHEMA_VERSION.to_string()),
    ] {
        transaction.execute(
            "INSERT INTO storage_meta(key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
    }
    transaction.execute(
        "INSERT INTO workspace_settings(singleton_id, revision, payload_json, updated_at, content_hash)
         VALUES (1, 1, ?1, ?2, ?3)",
        params![default_settings, now, settings_hash],
    )?;
    insert_receipt(
        &transaction,
        1,
        "initial_sqlite_storage",
        MIGRATION_V1,
        &now,
    )?;
    transaction.pragma_update(None, "user_version", 1)?;
    migration_fail_if(failpoint, MigrationFailpoint::BeforeCommit)?;
    transaction.commit()?;
    Ok(())
}

fn apply_v2(conn: &mut Connection, failpoint: MigrationFailpoint) -> DesktopResult<()> {
    verify_receipts(conn, 1)?;
    let transaction = conn.transaction_with_behavior(TransactionBehavior::Exclusive)?;
    transaction.execute_batch(MIGRATION_V2)?;
    migration_fail_if(failpoint, MigrationFailpoint::AfterSchema)?;
    let now = sqlite_now(&transaction)?;
    let created_at: String = transaction.query_row(
        "SELECT value FROM storage_meta WHERE key = 'workspace_created_at'",
        [],
        |row| row.get(0),
    )?;
    insert_default_demand_columns(&transaction, &created_at)?;
    insert_receipt(
        &transaction,
        2,
        "structured_entity_parity",
        MIGRATION_V2,
        &now,
    )?;
    transaction.execute(
        "UPDATE storage_meta SET value = ?1 WHERE key = 'storage_format_version'",
        ["2"],
    )?;
    transaction.pragma_update(None, "user_version", 2)?;
    migration_fail_if(failpoint, MigrationFailpoint::BeforeCommit)?;
    transaction.commit()?;
    Ok(())
}

fn apply_v3(conn: &mut Connection, failpoint: MigrationFailpoint) -> DesktopResult<()> {
    verify_receipts(conn, 2)?;
    let transaction = conn.transaction_with_behavior(TransactionBehavior::Exclusive)?;
    transaction.execute_batch(MIGRATION_V3)?;
    migration_fail_if(failpoint, MigrationFailpoint::AfterSchema)?;
    let now = sqlite_now(&transaction)?;
    insert_receipt(&transaction, 3, "native_evidence_files", MIGRATION_V3, &now)?;
    transaction.execute(
        "UPDATE storage_meta SET value = ?1 WHERE key = 'storage_format_version'",
        [STORAGE_FORMAT_VERSION.to_string()],
    )?;
    transaction.pragma_update(None, "user_version", STORAGE_FORMAT_VERSION)?;
    migration_fail_if(failpoint, MigrationFailpoint::BeforeCommit)?;
    transaction.commit()?;
    Ok(())
}

fn insert_default_demand_columns(
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
        let payload = serde_json::json!({
            "id": id,
            "name": name,
            "semantic": semantic,
            "order": order,
            "createdAt": created_at,
            "updatedAt": created_at,
        });
        let payload_json = serde_json::to_string(&payload)?;
        let content_hash = hex_sha256(payload_json.as_bytes());
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
                content_hash
            ],
        )?;
    }
    Ok(())
}

fn insert_receipt(
    transaction: &Transaction<'_>,
    version: u32,
    name: &str,
    sql: &str,
    applied_at: &str,
) -> DesktopResult<()> {
    transaction.execute(
        "INSERT INTO migration_receipts(version, name, checksum, applied_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![version, name, hex_sha256(sql.as_bytes()), applied_at],
    )?;
    Ok(())
}

fn sqlite_now(conn: &Connection) -> DesktopResult<String> {
    Ok(
        conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })?,
    )
}

fn migration_fail_if(
    actual: MigrationFailpoint,
    expected: MigrationFailpoint,
) -> DesktopResult<()> {
    if actual == expected {
        Err(DesktopError::new(
            DesktopErrorCode::Io,
            "Falha de migração simulada pelo harness de consistência.",
        ))
    } else {
        Ok(())
    }
}

fn verify_receipts(conn: &Connection, current: u32) -> DesktopResult<()> {
    for (version, sql) in [(1, MIGRATION_V1), (2, MIGRATION_V2), (3, MIGRATION_V3)] {
        if version > current {
            continue;
        }
        let receipt: Option<String> = conn
            .query_row(
                "SELECT checksum FROM migration_receipts WHERE version = ?1",
                [version],
                |row| row.get(0),
            )
            .optional()?;
        let expected = hex_sha256(sql.as_bytes());
        if receipt.as_deref() != Some(expected.as_str()) {
            return Err(DesktopError::new(
                DesktopErrorCode::RecoveryRequired,
                "Os recibos de migração do banco local são inválidos.",
            ));
        }
    }
    Ok(())
}

pub fn hex_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_is_atomic_and_idempotent() {
        let mut conn = Connection::open_in_memory().expect("open sqlite");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        run(&mut conn).expect("first migration");
        run(&mut conn).expect("second migration");

        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user version");
        let receipts: u32 = conn
            .query_row("SELECT count(*) FROM migration_receipts", [], |row| {
                row.get(0)
            })
            .expect("receipts");
        assert_eq!(version, STORAGE_FORMAT_VERSION);
        assert_eq!(receipts, 3);
    }

    #[test]
    fn newer_storage_version_is_rejected_without_changes() {
        let mut conn = Connection::open_in_memory().expect("open sqlite");
        conn.pragma_update(None, "user_version", 99)
            .expect("set version");
        let error = run(&mut conn).expect_err("must reject newer schema");
        assert_eq!(error.code, DesktopErrorCode::UnsupportedSchema);
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user version");
        assert_eq!(version, 99);
    }

    #[test]
    fn migration_failpoints_never_advance_a_partial_schema() {
        for failpoint in [
            MigrationFailpoint::AfterSchema,
            MigrationFailpoint::BeforeCommit,
        ] {
            let directory = tempfile::tempdir().expect("temp dir");
            let database_path = directory.path().join("migration.sqlite3");
            let mut conn = Connection::open(&database_path).expect("open sqlite");
            run_inner(&mut conn, failpoint).expect_err("fail migration");
            drop(conn);

            let mut reopened = Connection::open(&database_path).expect("reopen sqlite");
            let version: u32 = reopened
                .pragma_query_value(None, "user_version", |row| row.get(0))
                .expect("user version");
            let tables: u32 = reopened
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'storage_meta'",
                    [],
                    |row| row.get(0),
                )
                .expect("table count");
            assert_eq!(version, 0);
            assert_eq!(tables, 0);
            run(&mut reopened).expect("retry migration");
        }
    }

    #[test]
    fn migration_v2_preserves_v1_data_and_is_atomic() {
        let directory = tempfile::tempdir().expect("temp dir");
        let database_path = directory.path().join("migration.sqlite3");
        let mut conn = Connection::open(&database_path).expect("open sqlite");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        apply_v1(&mut conn, MigrationFailpoint::None).expect("apply v1");
        conn.execute(
            "INSERT INTO cases(id, revision, payload_json, created_at, updated_at, content_hash)
             VALUES ('CASE-OLD', 1, '{\"id\":\"CASE-OLD\"}', '2026-08-29T00:00:00Z', '2026-08-29T00:00:00Z', 'hash')",
            [],
        )
        .expect("insert legacy case");
        conn.execute(
            "INSERT INTO case_heads(id, current_revision) VALUES ('CASE-OLD', 1)",
            [],
        )
        .expect("insert legacy head");

        apply_v2(&mut conn, MigrationFailpoint::BeforeCommit).expect_err("fail v2");
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("version after rollback");
        assert_eq!(version, 1);
        let new_tables: u32 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'plans'",
                [],
                |row| row.get(0),
            )
            .expect("new table count");
        assert_eq!(new_tables, 0);

        run(&mut conn).expect("retry complete migration");
        let old_cases: u32 = conn
            .query_row(
                "SELECT count(*) FROM cases WHERE id = 'CASE-OLD'",
                [],
                |row| row.get(0),
            )
            .expect("legacy case count");
        let columns: u32 = conn
            .query_row("SELECT count(*) FROM demand_columns", [], |row| row.get(0))
            .expect("default columns");
        assert_eq!(old_cases, 1);
        assert_eq!(columns, 7);
    }

    #[test]
    fn migration_v3_preserves_structured_data_and_is_atomic() {
        let directory = tempfile::tempdir().expect("temp dir");
        let database_path = directory.path().join("migration.sqlite3");
        let mut conn = Connection::open(&database_path).expect("open sqlite");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        apply_v1(&mut conn, MigrationFailpoint::None).expect("apply v1");
        apply_v2(&mut conn, MigrationFailpoint::None).expect("apply v2");

        apply_v3(&mut conn, MigrationFailpoint::BeforeCommit).expect_err("fail v3");
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("version after rollback");
        assert_eq!(version, 2);
        let evidence_tables: u32 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'evidence'",
                [],
                |row| row.get(0),
            )
            .expect("evidence table count");
        assert_eq!(evidence_tables, 0);

        run(&mut conn).expect("retry complete migration");
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("completed version");
        assert_eq!(version, STORAGE_FORMAT_VERSION);
    }
}
