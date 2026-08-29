use serde::{de::Error as _, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

pub const IPC_CONTRACT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub ipc_contract_version: u32,
    pub runtime: String,
    pub persistence: String,
    pub platform: String,
    pub app_version: String,
    pub native_files: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DesktopErrorCode {
    Cancelled,
    Conflict,
    Validation,
    UnsupportedSchema,
    StorageLocked,
    DiskFull,
    PermissionDenied,
    CorruptStorage,
    RecoveryRequired,
    Io,
    Update,
    Internal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopError {
    pub code: DesktopErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operation_id: Option<String>,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub issues: Option<Vec<ValidationIssue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_storage_revision: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum EntityKind {
    Case,
    Plan,
    Run,
    Report,
    DemandColumn,
    Demand,
    Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MutationAction {
    Upsert,
    Archive,
    Delete,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StorageMutation {
    pub kind: EntityKind,
    pub action: MutationAction,
    pub id: String,
    #[serde(default, skip_serializing_if = "ExpectedEntityRevision::is_omitted")]
    pub expected_entity_revision: ExpectedEntityRevision,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum ExpectedEntityRevision {
    #[default]
    Omitted,
    Absent,
    Revision(u64),
}

impl ExpectedEntityRevision {
    fn is_omitted(&self) -> bool {
        matches!(self, Self::Omitted)
    }
}

impl Serialize for ExpectedEntityRevision {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Omitted | Self::Absent => serializer.serialize_none(),
            Self::Revision(revision) => serializer.serialize_u64(*revision),
        }
    }
}

impl<'de> Deserialize<'de> for ExpectedEntityRevision {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        if value.is_null() {
            return Ok(Self::Absent);
        }
        value.as_u64().map(Self::Revision).ok_or_else(|| {
            D::Error::custom("expectedEntityRevision must be null or a non-negative integer")
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitRequest {
    pub operation_id: String,
    pub expected_storage_revision: u64,
    pub mutations: Vec<StorageMutation>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChangedEntity {
    pub kind: EntityKind,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitResponse {
    pub storage_revision: u64,
    pub changed: Vec<ChangedEntity>,
    pub committed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceHealthStatus {
    Healthy,
    Degraded,
    RecoveryRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHealth {
    pub status: WorkspaceHealthStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub ipc_contract_version: u32,
    pub storage_revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committed_at: Option<String>,
    pub health: WorkspaceHealth,
    pub workspace: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityReport {
    pub status: WorkspaceHealthStatus,
    pub checked_at: String,
    pub issues: Vec<ValidationIssue>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn commit_envelope_round_trip_uses_camel_case() {
        let request = CommitRequest {
            operation_id: "OP-1".into(),
            expected_storage_revision: 3,
            mutations: vec![StorageMutation {
                kind: EntityKind::DemandColumn,
                action: MutationAction::Upsert,
                id: "COL-1".into(),
                expected_entity_revision: ExpectedEntityRevision::Absent,
                payload: Some(json!({ "id": "COL-1" })),
            }],
        };

        let encoded = serde_json::to_value(&request).expect("serialize commit request");
        assert_eq!(encoded["operationId"], "OP-1");
        assert_eq!(encoded["expectedStorageRevision"], 3);
        assert_eq!(encoded["mutations"][0]["kind"], "demandColumn");
        assert_eq!(
            encoded["mutations"][0]["expectedEntityRevision"],
            Value::Null
        );
        assert_eq!(
            serde_json::from_value::<CommitRequest>(encoded).expect("deserialize commit request"),
            request
        );
    }

    #[test]
    fn desktop_error_uses_stable_code_and_redacted_fields() {
        let error = DesktopError {
            code: DesktopErrorCode::DiskFull,
            message: "Não há espaço para concluir a gravação.".into(),
            operation_id: Some("OP-2".into()),
            retryable: true,
            issues: None,
            current_storage_revision: Some(7),
        };

        let encoded = serde_json::to_value(error).expect("serialize desktop error");
        assert_eq!(encoded["code"], "DISK_FULL");
        assert_eq!(encoded["operationId"], "OP-2");
        assert_eq!(encoded["currentStorageRevision"], 7);
        assert!(encoded.get("issues").is_none());
    }
}
