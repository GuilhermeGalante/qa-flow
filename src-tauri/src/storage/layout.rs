use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::{
    contracts::{DesktopError, DesktopErrorCode},
    error::DesktopResult,
};

#[derive(Debug, Clone)]
pub struct WorkspaceLayout {
    pub root: PathBuf,
    pub workspace_dir: PathBuf,
    pub database_path: PathBuf,
    pub evidence_dir: PathBuf,
    pub recovery_dir: PathBuf,
    pub transfer_staging_dir: PathBuf,
    pub runtime_manifest_path: PathBuf,
    pub lock_path: PathBuf,
    pub log_dir: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest<'a> {
    storage_format_version: u32,
    json_schema_version: u32,
    ipc_contract_version: u32,
    bundle_identifier: &'a str,
}

impl WorkspaceLayout {
    pub fn new(root: impl Into<PathBuf>, log_dir: impl Into<PathBuf>) -> Self {
        let root = root.into();
        let workspace_dir = root.join("workspace");
        Self {
            database_path: workspace_dir.join("qaflow.sqlite3"),
            evidence_dir: workspace_dir.join("evidence"),
            recovery_dir: root.join("recovery"),
            transfer_staging_dir: root.join("transfer-staging"),
            runtime_manifest_path: root.join("runtime.json"),
            lock_path: root.join("workspace.lock"),
            root,
            workspace_dir,
            log_dir: log_dir.into(),
        }
    }

    pub fn prepare(&self) -> DesktopResult<()> {
        for directory in [
            &self.root,
            &self.workspace_dir,
            &self.evidence_dir,
            &self.recovery_dir,
            &self.transfer_staging_dir,
            &self.log_dir,
        ] {
            fs::create_dir_all(directory)?;
        }

        self.verify_writable(&self.workspace_dir)?;
        self.write_runtime_manifest()?;
        Ok(())
    }

    fn verify_writable(&self, directory: &Path) -> DesktopResult<()> {
        let probe = directory.join(".qaflow-write-probe");
        let result = OpenOptions::new().write(true).create_new(true).open(&probe);
        match result {
            Ok(file) => {
                drop(file);
                fs::remove_file(probe)?;
                Ok(())
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                Err(DesktopError::new(
                    DesktopErrorCode::StorageLocked,
                    "O diretório de dados contém uma verificação pendente de outra execução.",
                ))
            }
            Err(error) => Err(error.into()),
        }
    }

    fn write_runtime_manifest(&self) -> DesktopResult<()> {
        let manifest = RuntimeManifest {
            storage_format_version: 1,
            json_schema_version: 2,
            ipc_contract_version: crate::contracts::IPC_CONTRACT_VERSION,
            bundle_identifier: "dev.qaflow.app",
        };
        let bytes = serde_json::to_vec_pretty(&manifest).map_err(|_| {
            DesktopError::new(
                DesktopErrorCode::Internal,
                "Não foi possível preparar os metadados do runtime.",
            )
        })?;
        fs::write(&self.runtime_manifest_path, bytes)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_the_expected_app_data_layout() {
        let root = tempfile::tempdir().expect("temp root");
        let logs = tempfile::tempdir().expect("temp logs");
        let layout = WorkspaceLayout::new(root.path(), logs.path());

        layout.prepare().expect("prepare layout");

        assert!(layout.workspace_dir.is_dir());
        assert!(layout.evidence_dir.is_dir());
        assert!(layout.recovery_dir.is_dir());
        assert!(layout.transfer_staging_dir.is_dir());
        assert!(layout.runtime_manifest_path.is_file());
        assert!(!layout.database_path.exists());
    }
}
