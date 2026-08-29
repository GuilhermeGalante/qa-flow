use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

use crate::{
    contracts::{DesktopError, DesktopErrorCode},
    error::DesktopResult,
};

#[derive(Debug, Clone)]
pub struct NativeLogger {
    path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogRecord<'a> {
    timestamp_ms: u128,
    level: &'a str,
    command: &'a str,
    result: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<&'a DesktopErrorCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    operation_id: Option<&'a str>,
    duration_ms: u128,
    #[serde(skip_serializing_if = "Option::is_none")]
    mutation_count: Option<usize>,
}

impl NativeLogger {
    pub fn new(log_dir: &Path) -> Self {
        Self {
            path: log_dir.join("qaflow.log"),
        }
    }

    pub fn record_success(
        &self,
        command: &str,
        operation_id: Option<&str>,
        duration_ms: u128,
        mutation_count: Option<usize>,
    ) -> DesktopResult<()> {
        self.append(LogRecord {
            timestamp_ms: timestamp_ms(),
            level: "info",
            command,
            result: "success",
            code: None,
            operation_id: allowlisted_identifier(operation_id),
            duration_ms,
            mutation_count,
        })
    }

    pub fn record_error(
        &self,
        command: &str,
        error: &DesktopError,
        duration_ms: u128,
        mutation_count: Option<usize>,
    ) -> DesktopResult<()> {
        self.append(LogRecord {
            timestamp_ms: timestamp_ms(),
            level: "error",
            command,
            result: "error",
            code: Some(&error.code),
            operation_id: allowlisted_identifier(error.operation_id.as_deref()),
            duration_ms,
            mutation_count,
        })
    }

    fn append(&self, record: LogRecord<'_>) -> DesktopResult<()> {
        let mut bytes = serde_json::to_vec(&record).map_err(|_| {
            DesktopError::new(
                DesktopErrorCode::Internal,
                "Não foi possível estruturar o log local.",
            )
        })?;
        bytes.push(b'\n');
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        file.write_all(&bytes)?;
        file.flush()?;
        Ok(())
    }
}

fn allowlisted_identifier(value: Option<&str>) -> Option<&str> {
    value.filter(|candidate| {
        !candidate.is_empty()
            && candidate.len() <= 160
            && candidate.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-')
            })
    })
}

fn timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn log_schema_only_contains_allowlisted_redacted_fields() {
        let directory = tempfile::tempdir().expect("temp log dir");
        let logger = NativeLogger::new(directory.path());
        let error = DesktopError::new(
            DesktopErrorCode::Internal,
            "SELECT secret FROM /Users/alice/private.sqlite3",
        )
        .operation("../../private path");

        logger
            .record_error("workspace_commit", &error, 12, Some(2))
            .expect("write log");
        let contents =
            std::fs::read_to_string(directory.path().join("qaflow.log")).expect("read log");
        let record: serde_json::Value = serde_json::from_str(contents.trim()).expect("parse log");

        assert_eq!(record["command"], "workspace_commit");
        assert_eq!(record["code"], "INTERNAL");
        assert!(record.get("operationId").is_none());
        assert!(!contents.contains("SELECT"));
        assert!(!contents.contains("alice"));
        assert!(!contents.contains("private.sqlite3"));
    }
}
