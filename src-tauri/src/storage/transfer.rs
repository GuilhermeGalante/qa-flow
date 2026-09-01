use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Map, Value};

use crate::{
    contracts::{DesktopError, DesktopErrorCode, EvidenceMeta, ImportSummary},
    error::DesktopResult,
    storage::migrations::hex_sha256,
};

pub const PREVIEW_TTL_SECONDS: u64 = 15 * 60;
pub const DEFAULT_RECOVERY_RETENTION_COUNT: usize = 20;
pub const DEFAULT_RECOVERY_RETENTION_DAYS: u64 = 90;
const MAX_BUNDLE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_ENTITY_COUNT: usize = 100_000;
const MAX_EVIDENCE_COUNT: usize = 10_000;

#[derive(Debug, Clone)]
pub struct BundleEvidence {
    pub meta: EvidenceMeta,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ValidatedBundle {
    pub value: Value,
    pub evidence: Vec<BundleEvidence>,
    pub summary: ImportSummary,
}

#[derive(Debug, Clone, Copy)]
pub struct RecoveryRetentionPolicy {
    pub max_backups: usize,
    pub max_age_days: u64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RecoveryCleanupReport {
    pub inspected: usize,
    pub removed: usize,
    pub retained: usize,
}

impl ValidatedBundle {
    pub fn parse(value: Value) -> DesktopResult<Self> {
        let object = value.as_object().ok_or_else(|| {
            DesktopError::validation(
                "O backup deve conter um objeto JSON.",
                "bundle",
                "Objeto esperado.",
            )
        })?;
        if object.get("schemaVersion").and_then(Value::as_u64) != Some(2) {
            return Err(DesktopError::new(
                DesktopErrorCode::UnsupportedSchema,
                "A versão do backup não é suportada por este QA Flow.",
            ));
        }
        required_string(object, "exportedAt", 64)?;
        let cases = required_array(object, "cases", MAX_ENTITY_COUNT)?;
        let plans = required_array(object, "plans", MAX_ENTITY_COUNT)?;
        let runs = required_array(object, "runs", MAX_ENTITY_COUNT)?;
        let reports = required_array(object, "reports", MAX_ENTITY_COUNT)?;
        let demand_columns = optional_array(object, "demandColumns", MAX_ENTITY_COUNT)?;
        let demands = optional_array(object, "demands", MAX_ENTITY_COUNT)?;
        let evidence_values = required_array(object, "evidence", MAX_EVIDENCE_COUNT)?;
        if !object.get("settings").is_some_and(Value::is_object) {
            return Err(issue("settings", "Objeto esperado."));
        }
        for (name, values) in [
            ("cases", cases),
            ("plans", plans),
            ("runs", runs),
            ("reports", reports),
            ("demandColumns", demand_columns),
            ("demands", demands),
        ] {
            ensure_unique_ids(name, values)?;
        }

        let mut evidence = Vec::with_capacity(evidence_values.len());
        let mut evidence_ids = HashSet::new();
        for (index, item) in evidence_values.iter().enumerate() {
            let item = item.as_object().ok_or_else(|| {
                issue(
                    &format!("evidence.{index}"),
                    "Objeto de evidência esperado.",
                )
            })?;
            let meta: EvidenceMeta =
                serde_json::from_value(item.get("meta").cloned().ok_or_else(|| {
                    issue(&format!("evidence.{index}.meta"), "Metadados ausentes.")
                })?)?;
            validate_evidence_meta(&meta, index)?;
            if !evidence_ids.insert(meta.id.clone()) {
                return Err(issue(
                    &format!("evidence.{index}.meta.id"),
                    "Identificador duplicado.",
                ));
            }
            let data_url = item
                .get("dataUrl")
                .and_then(Value::as_str)
                .ok_or_else(|| issue(&format!("evidence.{index}.dataUrl"), "Data URL esperada."))?;
            let expected_prefix = format!("data:{};base64,", meta.mime_type);
            let encoded = data_url.strip_prefix(&expected_prefix).ok_or_else(|| {
                issue(
                    &format!("evidence.{index}.dataUrl"),
                    "O tipo MIME não corresponde ao conteúdo.",
                )
            })?;
            let bytes = STANDARD.decode(encoded).map_err(|_| {
                issue(
                    &format!("evidence.{index}.dataUrl"),
                    "Conteúdo Base64 inválido.",
                )
            })?;
            validate_image(&meta, &bytes, index)?;
            if meta.sha256 != "unavailable" && hex_sha256(data_url.as_bytes()) != meta.sha256 {
                return Err(issue(
                    &format!("evidence.{index}.meta.sha256"),
                    "O checksum da evidência não confere.",
                ));
            }
            evidence.push(BundleEvidence { meta, bytes });
        }

        let summary = ImportSummary {
            cases: cases.len(),
            plans: plans.len(),
            runs: runs.len(),
            reports: reports.len(),
            demand_columns: demand_columns.len(),
            demands: demands.len(),
            evidence: evidence.len(),
        };
        Ok(Self {
            value,
            evidence,
            summary,
        })
    }

    pub fn from_file(path: &Path) -> DesktopResult<Self> {
        let metadata = fs::metadata(path)?;
        if metadata.len() == 0 || metadata.len() > MAX_BUNDLE_BYTES {
            return Err(DesktopError::validation(
                "O arquivo de backup excede o limite permitido.",
                "bundle",
                "Use um arquivo entre 1 byte e 512 MiB.",
            ));
        }
        let bytes = fs::read(path)?;
        let value = serde_json::from_slice(&bytes).map_err(|_| {
            DesktopError::validation(
                "O arquivo selecionado não contém JSON válido.",
                "bundle",
                "JSON v2 esperado.",
            )
        })?;
        Self::parse(value)
    }

    pub fn to_pretty_bytes(&self) -> DesktopResult<Vec<u8>> {
        let mut bytes = serde_json::to_vec_pretty(&self.value)?;
        bytes.push(b'\n');
        Ok(bytes)
    }
}

pub fn assemble_bundle(
    mut workspace: Value,
    exported_at: String,
    evidence: Vec<(EvidenceMeta, Vec<u8>)>,
) -> DesktopResult<ValidatedBundle> {
    let object = workspace.as_object_mut().ok_or_else(|| {
        DesktopError::new(
            DesktopErrorCode::RecoveryRequired,
            "O snapshot local não possui o formato esperado.",
        )
    })?;
    let evidence_values = evidence
        .into_iter()
        .map(|(meta, bytes)| {
            let data_url = format!("data:{};base64,{}", meta.mime_type, STANDARD.encode(bytes));
            json!({ "meta": meta, "dataUrl": data_url })
        })
        .collect::<Vec<_>>();
    object.insert("schemaVersion".to_owned(), json!(2));
    object.insert("exportedAt".to_owned(), Value::String(exported_at));
    object.insert("evidence".to_owned(), Value::Array(evidence_values));
    object.remove("migrationReport");
    ValidatedBundle::parse(workspace)
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> DesktopResult<()> {
    let parent = path.parent().ok_or_else(|| {
        DesktopError::new(
            DesktopErrorCode::PermissionDenied,
            "O destino não possui um diretório válido.",
        )
    })?;
    fs::create_dir_all(parent)?;
    let mut staged = tempfile::NamedTempFile::new_in(parent)?;
    staged.write_all(bytes)?;
    staged.as_file_mut().sync_all()?;
    staged
        .persist(path)
        .map_err(|error| DesktopError::from(error.error))?;
    Ok(())
}

pub fn write_repository(root: &Path, bundle: &ValidatedBundle) -> DesktopResult<()> {
    let qaflow = root.join(".qaflow");
    let cases_dir = qaflow.join("cases");
    let plans_dir = qaflow.join("plans");
    let runs_dir = qaflow.join("runs");
    let reports_dir = qaflow.join("reports");
    let demands_dir = qaflow.join("demands");
    let evidence_dir = qaflow.join("evidence");
    for directory in [
        &qaflow,
        &cases_dir,
        &plans_dir,
        &runs_dir,
        &reports_dir,
        &demands_dir,
        &evidence_dir,
    ] {
        fs::create_dir_all(directory)?;
    }

    let object = bundle.value.as_object().expect("validated bundle object");
    let mut manifest = json!({
        "schemaVersion": 2,
        "exportedAt": object["exportedAt"],
        "settings": object["settings"],
        "cases": [], "plans": [], "runs": [], "reports": [],
        "demandColumns": [], "demands": [], "evidence": []
    });
    write_entities(&cases_dir, "cases", &object["cases"], &mut manifest, true)?;
    write_entities(&plans_dir, "plans", &object["plans"], &mut manifest, true)?;
    write_entities(&runs_dir, "runs", &object["runs"], &mut manifest, false)?;
    write_entities(
        &reports_dir,
        "reports",
        &object["reports"],
        &mut manifest,
        false,
    )?;
    let empty = Value::Array(Vec::new());
    write_entities(
        &demands_dir,
        "demandColumns",
        object.get("demandColumns").unwrap_or(&empty),
        &mut manifest,
        false,
    )?;
    write_entities(
        &demands_dir,
        "demands",
        object.get("demands").unwrap_or(&empty),
        &mut manifest,
        false,
    )?;
    for item in &bundle.evidence {
        let extension = extension_for_mime(&item.meta.mime_type);
        let binary_hash = hex_sha256(&item.bytes);
        let file = format!(
            "{}.{}.{}",
            file_stem(&item.meta.id),
            &binary_hash[..12],
            extension
        );
        write_atomic(&evidence_dir.join(&file), &item.bytes)?;
        manifest["evidence"]
            .as_array_mut()
            .expect("manifest evidence")
            .push(json!({ "meta": item.meta, "file": file, "sha256": binary_hash }));
    }
    write_atomic(
        &qaflow.join("workspace.json"),
        &pretty_json_bytes(&manifest)?,
    )?;
    Ok(())
}

pub fn read_repository(root: &Path) -> DesktopResult<ValidatedBundle> {
    let qaflow = root.join(".qaflow");
    let manifest: Value = read_json_file(&qaflow.join("workspace.json"))?;
    let object = manifest
        .as_object()
        .ok_or_else(|| issue("workspace", "Manifesto inválido."))?;
    if object.get("schemaVersion").and_then(Value::as_u64) != Some(2) {
        return Err(DesktopError::new(
            DesktopErrorCode::UnsupportedSchema,
            "A versão do repositório .qaflow não é suportada.",
        ));
    }
    let mut bundle = json!({
        "schemaVersion": 2,
        "exportedAt": object.get("exportedAt").cloned().unwrap_or(Value::Null),
        "settings": object.get("settings").cloned().unwrap_or(Value::Null),
        "cases": [], "plans": [], "runs": [], "reports": [],
        "demandColumns": [], "demands": [], "evidence": []
    });
    read_entities(&qaflow.join("cases"), object, "cases", &mut bundle)?;
    read_entities(&qaflow.join("plans"), object, "plans", &mut bundle)?;
    read_entities(&qaflow.join("runs"), object, "runs", &mut bundle)?;
    read_entities(&qaflow.join("reports"), object, "reports", &mut bundle)?;
    read_entities(
        &qaflow.join("demands"),
        object,
        "demandColumns",
        &mut bundle,
    )?;
    read_entities(&qaflow.join("demands"), object, "demands", &mut bundle)?;
    let evidence_entries = optional_array(object, "evidence", MAX_EVIDENCE_COUNT)?;
    for (index, entry) in evidence_entries.iter().enumerate() {
        let entry = entry
            .as_object()
            .ok_or_else(|| issue("evidence", "Entrada inválida."))?;
        let meta = entry
            .get("meta")
            .cloned()
            .ok_or_else(|| issue(&format!("evidence.{index}.meta"), "Metadados ausentes."))?;
        let mime_type = meta["mimeType"]
            .as_str()
            .ok_or_else(|| issue(&format!("evidence.{index}.meta.mimeType"), "MIME ausente."))?;
        let file = safe_manifest_file(entry, index)?;
        let bytes = read_file_bytes(&qaflow.join("evidence").join(file), 10 * 1024 * 1024)?;
        verify_manifest_checksum(entry, &bytes, &format!("evidence.{index}.sha256"))?;
        bundle["evidence"]
            .as_array_mut()
            .expect("bundle evidence")
            .push(json!({
                "meta": meta,
                "dataUrl": format!("data:{mime_type};base64,{}", STANDARD.encode(bytes))
            }));
    }
    ValidatedBundle::parse(bundle)
}

pub fn recovery_name(prefix: &str, storage_revision: u64, bundle: &ValidatedBundle) -> String {
    let checksum = hex_sha256(&bundle.to_pretty_bytes().unwrap_or_default());
    format!("{prefix}-r{storage_revision}-{}.json", &checksum[..12])
}

pub fn prune_recovery_backups(
    recovery_dir: &Path,
    policy: RecoveryRetentionPolicy,
) -> DesktopResult<RecoveryCleanupReport> {
    fs::create_dir_all(recovery_dir)?;
    let max_backups = policy.max_backups.clamp(1, 100);
    let max_age = Duration::from_secs(policy.max_age_days.clamp(1, 3_650) * 24 * 60 * 60);
    let now = SystemTime::now();
    let mut candidates = Vec::new();
    for entry in fs::read_dir(recovery_dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if !is_managed_recovery_name(&name) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        candidates.push((entry.path(), modified));
    }
    candidates.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| right.0.cmp(&left.0)));
    let newest_valid = candidates
        .iter()
        .find(|(path, _)| ValidatedBundle::from_file(path).is_ok())
        .map(|(path, _)| path.clone());
    if newest_valid.is_none() {
        return Ok(RecoveryCleanupReport {
            inspected: candidates.len(),
            removed: 0,
            retained: candidates.len(),
        });
    }

    let mut removed = 0usize;
    for (index, (path, modified)) in candidates.iter().enumerate() {
        let protected = newest_valid.as_ref() == Some(path);
        let within_count = index < max_backups;
        let within_age = now
            .duration_since(*modified)
            .map_or(true, |age| age <= max_age);
        if !protected && (!within_count || !within_age) {
            fs::remove_file(path)?;
            removed += 1;
        }
    }
    Ok(RecoveryCleanupReport {
        inspected: candidates.len(),
        removed,
        retained: candidates.len().saturating_sub(removed),
    })
}

fn is_managed_recovery_name(name: &str) -> bool {
    name.ends_with(".json")
        && (name.starts_with("before-backup-import-r")
            || name.starts_with("before-repository-pull-r"))
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn validate_image(meta: &EvidenceMeta, bytes: &[u8], index: usize) -> DesktopResult<()> {
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 || meta.size != bytes.len() as u64 {
        return Err(issue(
            &format!("evidence.{index}.meta.size"),
            "Tamanho inválido ou divergente do binário.",
        ));
    }
    let valid = match meta.mime_type.as_str() {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !valid {
        return Err(issue(
            &format!("evidence.{index}.meta.mimeType"),
            "Imagem ou tipo MIME inválido.",
        ));
    }
    Ok(())
}

fn validate_evidence_meta(meta: &EvidenceMeta, index: usize) -> DesktopResult<()> {
    for (field, value) in [
        ("id", meta.id.as_str()),
        ("runId", meta.run_id.as_str()),
        ("ownerId", meta.owner_id.as_str()),
    ] {
        if !safe_identifier(value, 128) {
            return Err(issue(
                &format!("evidence.{index}.meta.{field}"),
                "Identificador inseguro.",
            ));
        }
    }
    if !matches!(meta.owner_type.as_str(), "step" | "exploratory") {
        return Err(issue(
            &format!("evidence.{index}.meta.ownerType"),
            "Use step ou exploratory.",
        ));
    }
    if meta.name.trim().is_empty()
        || meta.name.len() > 255
        || meta.name.chars().any(char::is_control)
    {
        return Err(issue(
            &format!("evidence.{index}.meta.name"),
            "Nome de evidência inválido.",
        ));
    }
    if meta.created_at.trim().is_empty() || meta.created_at.len() > 64 {
        return Err(issue(
            &format!("evidence.{index}.meta.createdAt"),
            "Data de criação inválida.",
        ));
    }
    if meta.sha256 != "unavailable"
        && (meta.sha256.len() != 64
            || !meta
                .sha256
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()))
    {
        return Err(issue(
            &format!("evidence.{index}.meta.sha256"),
            "SHA-256 hexadecimal esperado.",
        ));
    }
    Ok(())
}

fn write_entities(
    directory: &Path,
    kind: &str,
    values: &Value,
    manifest: &mut Value,
    revisioned: bool,
) -> DesktopResult<()> {
    let mut entities = values.as_array().cloned().unwrap_or_default();
    entities.sort_by(|left, right| left["id"].as_str().cmp(&right["id"].as_str()));
    for entity in entities {
        let id = entity["id"].as_str().expect("validated entity id");
        let entity_bytes = pretty_json_bytes(&entity)?;
        let content_hash = hex_sha256(&entity_bytes);
        let content_suffix = &content_hash[..12];
        let file = if revisioned {
            format!(
                "{}.r{}.{}.json",
                file_stem(id),
                entity["revision"].as_u64().expect("validated revision"),
                content_suffix,
            )
        } else if kind == "demandColumns" {
            format!("column-{}.{}.json", file_stem(id), content_suffix)
        } else {
            format!("{}.{}.json", file_stem(id), content_suffix)
        };
        write_atomic(&directory.join(&file), &entity_bytes)?;
        let mut entry = json!({ "id": id, "file": file });
        entry["sha256"] = Value::String(content_hash);
        if revisioned {
            entry["revision"] = entity["revision"].clone();
        }
        manifest[kind]
            .as_array_mut()
            .expect("manifest entity array")
            .push(entry);
    }
    Ok(())
}

fn read_entities(
    directory: &Path,
    manifest: &Map<String, Value>,
    kind: &str,
    bundle: &mut Value,
) -> DesktopResult<()> {
    for (index, entry) in optional_array(manifest, kind, MAX_ENTITY_COUNT)?
        .iter()
        .enumerate()
    {
        let entry = entry
            .as_object()
            .ok_or_else(|| issue(kind, "Entrada inválida."))?;
        let file = safe_manifest_file(entry, index)?;
        let bytes = read_file_bytes(&directory.join(file), MAX_BUNDLE_BYTES)?;
        verify_manifest_checksum(entry, &bytes, &format!("{kind}.{index}.sha256"))?;
        bundle[kind]
            .as_array_mut()
            .expect("bundle entity array")
            .push(serde_json::from_slice(&bytes).map_err(|_| issue("file", "JSON inválido."))?);
    }
    Ok(())
}

fn safe_manifest_file(entry: &Map<String, Value>, index: usize) -> DesktopResult<&str> {
    let file = entry
        .get("file")
        .and_then(Value::as_str)
        .ok_or_else(|| issue(&format!("manifest.{index}.file"), "Arquivo ausente."))?;
    if file.is_empty()
        || file.len() > 220
        || Path::new(file).file_name().and_then(|name| name.to_str()) != Some(file)
        || !file
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(issue(
            &format!("manifest.{index}.file"),
            "Nome de arquivo inseguro.",
        ));
    }
    Ok(file)
}

fn read_json_file(path: &Path) -> DesktopResult<Value> {
    let bytes = read_file_bytes(path, MAX_BUNDLE_BYTES)?;
    serde_json::from_slice(&bytes).map_err(|_| issue("file", "JSON inválido."))
}

fn read_file_bytes(path: &Path, max_bytes: u64) -> DesktopResult<Vec<u8>> {
    let metadata = fs::metadata(path)?;
    if metadata.len() == 0 || metadata.len() > max_bytes {
        return Err(issue("file", "Arquivo vazio ou grande demais."));
    }
    Ok(fs::read(path)?)
}

fn verify_manifest_checksum(
    entry: &Map<String, Value>,
    bytes: &[u8],
    path: &str,
) -> DesktopResult<()> {
    let Some(expected) = entry.get("sha256") else {
        return Ok(());
    };
    let expected = expected.as_str().filter(|value| {
        value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    });
    if expected.is_none_or(|expected| expected != hex_sha256(bytes)) {
        return Err(issue(path, "O checksum do arquivo não confere."));
    }
    Ok(())
}

fn pretty_json_bytes(value: &Value) -> DesktopResult<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn required_array<'a>(
    object: &'a Map<String, Value>,
    field: &str,
    max: usize,
) -> DesktopResult<&'a Vec<Value>> {
    object
        .get(field)
        .and_then(Value::as_array)
        .filter(|values| values.len() <= max)
        .ok_or_else(|| issue(field, "Array ausente, inválido ou acima do limite."))
}

fn optional_array<'a>(
    object: &'a Map<String, Value>,
    field: &str,
    max: usize,
) -> DesktopResult<&'a Vec<Value>> {
    static EMPTY: Vec<Value> = Vec::new();
    match object.get(field) {
        None => Ok(&EMPTY),
        Some(value) => value
            .as_array()
            .filter(|values| values.len() <= max)
            .ok_or_else(|| issue(field, "Array inválido ou acima do limite.")),
    }
}

fn ensure_unique_ids(name: &str, values: &[Value]) -> DesktopResult<()> {
    let mut ids = HashSet::new();
    for (index, value) in values.iter().enumerate() {
        let id = value["id"]
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= 128)
            .ok_or_else(|| issue(&format!("{name}.{index}.id"), "Identificador inválido."))?;
        if !ids.insert(id) {
            return Err(issue(
                &format!("{name}.{index}.id"),
                "Identificador duplicado.",
            ));
        }
    }
    Ok(())
}

fn required_string(object: &Map<String, Value>, field: &str, max: usize) -> DesktopResult<()> {
    if object
        .get(field)
        .and_then(Value::as_str)
        .is_none_or(|value| value.is_empty() || value.len() > max)
    {
        return Err(issue(field, "Texto obrigatório inválido."));
    }
    Ok(())
}

fn issue(path: &str, message: &str) -> DesktopError {
    DesktopError::validation("O bundle não passou na validação.", path, message)
}

fn safe_name(id: &str) -> String {
    id.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn file_stem(id: &str) -> String {
    format!("{}-{}", safe_name(id), &hex_sha256(id.as_bytes())[..12])
}

fn safe_identifier(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b':'))
}

fn extension_for_mime(mime_type: &str) -> &'static str {
    match mime_type {
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "png",
    }
}

pub fn repository_display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("workspace")
        .to_owned()
}

pub fn selected_path(value: tauri_plugin_dialog::FilePath) -> DesktopResult<PathBuf> {
    value.into_path().map_err(|_| {
        DesktopError::new(
            DesktopErrorCode::PermissionDenied,
            "O item selecionado não pode ser acessado pelo aplicativo.",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_bundle() -> Value {
        json!({
            "schemaVersion": 2,
            "exportedAt": "2026-08-31T12:00:00.000Z",
            "cases": [], "plans": [], "runs": [], "reports": [],
            "demandColumns": [], "demands": [], "evidence": [],
            "settings": {
                "mode": "browser", "name": "QA", "repositoryPath": ".qaflow",
                "compactEvidence": true
            }
        })
    }

    #[test]
    fn backup_and_repository_round_trip_use_the_same_bundle() {
        let bundle = ValidatedBundle::parse(minimal_bundle()).expect("valid bundle");
        let directory = tempfile::tempdir().expect("temp repository");
        write_repository(directory.path(), &bundle).expect("write repository");
        let restored = read_repository(directory.path()).expect("read repository");
        assert_eq!(restored.value, bundle.value);
    }

    #[test]
    fn repository_manifest_rejects_path_traversal() {
        let directory = tempfile::tempdir().expect("temp repository");
        let qaflow = directory.path().join(".qaflow");
        fs::create_dir_all(&qaflow).expect("qaflow directory");
        let mut manifest = minimal_bundle();
        manifest["cases"] = json!([{ "id": "CASE-1", "revision": 1, "file": "../secret.json" }]);
        write_atomic(
            &qaflow.join("workspace.json"),
            &pretty_json_bytes(&manifest).unwrap(),
        )
        .expect("manifest fixture");
        assert_eq!(
            read_repository(directory.path())
                .expect_err("path traversal rejected")
                .code,
            DesktopErrorCode::Validation
        );
    }

    #[test]
    fn repository_manifest_detects_a_changed_entity_file() {
        let directory = tempfile::tempdir().expect("temp repository");
        let mut value = minimal_bundle();
        value["reports"] = json!([{ "id": "REPORT-1" }]);
        let bundle = ValidatedBundle::parse(value).expect("valid bundle envelope");
        write_repository(directory.path(), &bundle).expect("write repository");
        let qaflow = directory.path().join(".qaflow");
        let manifest = read_json_file(&qaflow.join("workspace.json")).expect("manifest");
        let file = manifest["reports"][0]["file"]
            .as_str()
            .expect("report file");
        write_atomic(&qaflow.join("reports").join(file), b"{}\n").expect("change entity");

        assert_eq!(
            read_repository(directory.path())
                .expect_err("checksum mismatch rejected")
                .code,
            DesktopErrorCode::Validation
        );
    }

    #[test]
    fn recovery_retention_only_removes_managed_excess_and_keeps_a_valid_copy() {
        let directory = tempfile::tempdir().expect("temp recovery");
        let bundle = ValidatedBundle::parse(minimal_bundle()).expect("valid bundle");
        let bytes = bundle.to_pretty_bytes().expect("backup bytes");
        for index in 0..4 {
            write_atomic(
                &directory
                    .path()
                    .join(format!("before-backup-import-r{index}-{index:012}.json")),
                &bytes,
            )
            .expect("recovery fixture");
        }
        write_atomic(&directory.path().join("manual-backup.json"), &bytes)
            .expect("unmanaged fixture");

        let report = prune_recovery_backups(
            directory.path(),
            RecoveryRetentionPolicy {
                max_backups: 2,
                max_age_days: 90,
            },
        )
        .expect("prune recovery");

        assert_eq!(report.inspected, 4);
        assert_eq!(report.removed, 2);
        assert_eq!(report.retained, 2);
        assert!(directory.path().join("manual-backup.json").is_file());
        let remaining_valid = fs::read_dir(directory.path())
            .expect("remaining files")
            .filter_map(Result::ok)
            .filter(|entry| is_managed_recovery_name(&entry.file_name().to_string_lossy()))
            .filter(|entry| ValidatedBundle::from_file(&entry.path()).is_ok())
            .count();
        assert_eq!(remaining_valid, 2);
    }

    #[test]
    fn recovery_retention_does_nothing_without_a_valid_recovery() {
        let directory = tempfile::tempdir().expect("temp recovery");
        for index in 0..3 {
            write_atomic(
                &directory
                    .path()
                    .join(format!("before-repository-pull-r{index}-{index:012}.json")),
                b"not-json",
            )
            .expect("corrupt recovery fixture");
        }
        let report = prune_recovery_backups(
            directory.path(),
            RecoveryRetentionPolicy {
                max_backups: 1,
                max_age_days: 1,
            },
        )
        .expect("safe no-op");
        assert_eq!(report.removed, 0);
        assert_eq!(report.retained, 3);
    }
}
