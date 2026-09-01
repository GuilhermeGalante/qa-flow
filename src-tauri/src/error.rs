use std::{fmt, io};

use rusqlite::{ffi::ErrorCode as SqliteErrorCode, Error as SqliteError};

use crate::contracts::{DesktopError, DesktopErrorCode, ValidationIssue};

pub type DesktopResult<T> = Result<T, DesktopError>;

impl DesktopError {
    pub fn new(code: DesktopErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            operation_id: None,
            retryable: false,
            issues: None,
            current_storage_revision: None,
        }
    }

    pub fn operation(mut self, operation_id: impl Into<String>) -> Self {
        self.operation_id = Some(operation_id.into());
        self
    }

    pub fn retryable(mut self, retryable: bool) -> Self {
        self.retryable = retryable;
        self
    }

    pub fn issues(mut self, issues: Vec<ValidationIssue>) -> Self {
        self.issues = Some(issues);
        self
    }

    pub fn current_revision(mut self, revision: u64) -> Self {
        self.current_storage_revision = Some(revision);
        self
    }

    pub fn validation(message: impl Into<String>, path: &str, issue: impl Into<String>) -> Self {
        Self::new(DesktopErrorCode::Validation, message).issues(vec![ValidationIssue {
            path: path.to_owned(),
            message: issue.into(),
        }])
    }

    pub fn conflict(message: impl Into<String>, revision: u64) -> Self {
        Self::new(DesktopErrorCode::Conflict, message).current_revision(revision)
    }
}

impl fmt::Display for DesktopError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for DesktopError {}

pub fn map_sqlite_error(error: SqliteError) -> DesktopError {
    let code = match &error {
        SqliteError::SqliteFailure(details, _) => details.code,
        _ => {
            return DesktopError::new(
                DesktopErrorCode::Internal,
                "O armazenamento local retornou uma resposta inválida.",
            )
        }
    };

    match code {
        SqliteErrorCode::DatabaseCorrupt | SqliteErrorCode::NotADatabase => DesktopError::new(
            DesktopErrorCode::RecoveryRequired,
            "O banco local está corrompido e precisa de recuperação.",
        ),
        SqliteErrorCode::DiskFull => DesktopError::new(
            DesktopErrorCode::DiskFull,
            "Não há espaço para concluir a gravação.",
        )
        .retryable(true),
        SqliteErrorCode::PermissionDenied | SqliteErrorCode::ReadOnly => DesktopError::new(
            DesktopErrorCode::PermissionDenied,
            "O aplicativo não tem permissão para gravar o workspace.",
        ),
        SqliteErrorCode::DatabaseBusy | SqliteErrorCode::DatabaseLocked => DesktopError::new(
            DesktopErrorCode::StorageLocked,
            "O workspace está sendo usado por outra operação ou instância.",
        )
        .retryable(true),
        SqliteErrorCode::CannotOpen | SqliteErrorCode::SystemIoFailure => DesktopError::new(
            DesktopErrorCode::Io,
            "Não foi possível acessar o armazenamento local.",
        )
        .retryable(true),
        _ => DesktopError::new(
            DesktopErrorCode::Internal,
            "Não foi possível concluir a operação no armazenamento local.",
        ),
    }
}

pub fn map_io_error(error: io::Error) -> DesktopError {
    match error.kind() {
        io::ErrorKind::PermissionDenied => DesktopError::new(
            DesktopErrorCode::PermissionDenied,
            "O aplicativo não tem permissão para acessar seus dados locais.",
        ),
        io::ErrorKind::StorageFull => DesktopError::new(
            DesktopErrorCode::DiskFull,
            "Não há espaço para concluir a gravação.",
        )
        .retryable(true),
        _ => DesktopError::new(
            DesktopErrorCode::Io,
            "Não foi possível acessar os dados locais do aplicativo.",
        )
        .retryable(true),
    }
}

impl From<SqliteError> for DesktopError {
    fn from(value: SqliteError) -> Self {
        map_sqlite_error(value)
    }
}

impl From<io::Error> for DesktopError {
    fn from(value: io::Error) -> Self {
        map_io_error(value)
    }
}

impl From<serde_json::Error> for DesktopError {
    fn from(_: serde_json::Error) -> Self {
        DesktopError::new(
            DesktopErrorCode::Validation,
            "O payload recebido não é um JSON v2 válido.",
        )
    }
}

impl From<tauri_plugin_updater::Error> for DesktopError {
    fn from(_: tauri_plugin_updater::Error) -> Self {
        DesktopError::new(
            DesktopErrorCode::Update,
            "Não foi possível consultar ou instalar a atualização com segurança.",
        )
        .retryable(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_errors_are_redacted() {
        let source = SqliteError::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_FULL),
            Some("INSERT INTO secret /Users/alice/workspace".to_owned()),
        );
        let error = map_sqlite_error(source);

        assert_eq!(error.code, DesktopErrorCode::DiskFull);
        assert!(!error.message.contains("INSERT"));
        assert!(!error.message.contains("alice"));
    }
}
