use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use sha2::{Digest, Sha256};

use crate::{
    contracts::{DesktopError, DesktopErrorCode},
    error::DesktopResult,
};

pub const STORAGE_FORMAT_VERSION: u32 = 1;
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
        verify_receipt(conn)?;
        return Ok(());
    }

    let transaction = conn.transaction_with_behavior(TransactionBehavior::Exclusive)?;
    transaction.execute_batch(MIGRATION_V1)?;
    migration_fail_if(failpoint, MigrationFailpoint::AfterSchema)?;
    let now: String =
        transaction.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })?;
    let default_settings = r#"{"mode":"browser","name":"Meu workspace","repositoryPath":".qaflow","compactEvidence":true}"#;
    let settings_hash = hex_sha256(default_settings.as_bytes());

    for (key, value) in [
        ("storage_format_version", STORAGE_FORMAT_VERSION.to_string()),
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

    let checksum = hex_sha256(MIGRATION_V1.as_bytes());
    transaction.execute(
        "INSERT INTO migration_receipts(version, name, checksum, applied_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            STORAGE_FORMAT_VERSION,
            "initial_sqlite_storage",
            checksum,
            now
        ],
    )?;
    transaction.pragma_update(None, "user_version", STORAGE_FORMAT_VERSION)?;
    migration_fail_if(failpoint, MigrationFailpoint::BeforeCommit)?;
    transaction.commit()?;
    Ok(())
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

fn verify_receipt(conn: &Connection) -> DesktopResult<()> {
    let receipt: Option<String> = conn
        .query_row(
            "SELECT checksum FROM migration_receipts WHERE version = ?1",
            [STORAGE_FORMAT_VERSION],
            |row| row.get(0),
        )
        .optional()?;
    let expected = hex_sha256(MIGRATION_V1.as_bytes());
    if receipt.as_deref() != Some(expected.as_str()) {
        return Err(DesktopError::new(
            DesktopErrorCode::RecoveryRequired,
            "Os recibos de migração do banco local são inválidos.",
        ));
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
        assert_eq!(receipts, 1);
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
}
