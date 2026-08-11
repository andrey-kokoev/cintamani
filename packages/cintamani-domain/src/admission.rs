use crate::{
    AdmissionManifest, AdmissionV2, ManifestEntry, RegistryPaths, compute_entry_hash, inspect,
    rebuild, verify_chain,
};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;

#[derive(Clone, Debug)]
pub struct AdmissionAuthority<'a> {
    pub admitted_by: &'a str,
    pub authority_kind: &'a str,
    pub authority_ref: &'a str,
    pub expected_head: &'a str,
}

#[derive(Clone, Debug, Serialize)]
pub struct AdmissionPreview {
    pub current_head: String,
    pub proposed_generation: String,
    pub record_id: String,
    pub admission_sequence: u64,
    pub source_sha256: String,
    pub predecessor_entry_hash: String,
    pub entry_hash: String,
    pub relation_count_deltas: BTreeMap<String, i64>,
    pub projection_valid: bool,
    pub mutates_governed_head: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct AdmissionReceipt {
    pub schema: String,
    pub record_id: String,
    pub admission_sequence: u64,
    pub generation: String,
    pub entry_hash: String,
    pub content_sha256: String,
    pub predecessor_entry_hash: String,
    pub admitted_by: String,
    pub authority_kind: String,
    pub authority_ref: String,
    pub prior_head: String,
    pub projection_schema_version: String,
}

pub fn draft_admission(path: &Path, record: &AdmissionV2) -> Result<PathBuf> {
    validate_record(record)?;
    if path.exists() {
        bail!(
            "refusing to overwrite existing admission draft {}",
            path.display()
        );
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut bytes = serde_json::to_vec_pretty(record)?;
    bytes.push(b'\n');
    write_new(path, &bytes)?;
    Ok(path.to_path_buf())
}

pub fn validate_admission(path: &Path) -> Result<AdmissionV2> {
    let bytes = fs::read(path)
        .with_context(|| format!("failed to read admission draft {}", path.display()))?;
    let record: AdmissionV2 = serde_json::from_slice(&bytes).with_context(|| {
        format!(
            "failed to parse typed v2 admission draft {}",
            path.display()
        )
    })?;
    validate_record(&record)?;
    Ok(record)
}

pub fn preview_admission(
    paths: &RegistryPaths,
    draft: &Path,
    authority: &AdmissionAuthority<'_>,
) -> Result<AdmissionPreview> {
    validate_authority(authority)?;
    let record = validate_admission(draft)?;
    let bytes = fs::read(draft)?;
    let active = verify_chain(&paths.workspace_root, &paths.chain_root)?;
    if active.generation != authority.expected_head {
        bail!(
            "stale admission preview: expected HEAD {}, observed {}",
            authority.expected_head,
            active.generation
        );
    }
    if active
        .entries
        .iter()
        .any(|entry| entry.entry.record_id == record.record_id)
    {
        bail!("admission identity {} already exists", record.record_id);
    }
    let proposal = proposal(&active, &record, &bytes, authority)?;
    let mut guard = PreviewGuard::stage(paths, &proposal, &bytes)?;
    let current_counts = inspect(paths)
        .map(|report| report.relation_counts)
        .unwrap_or_default();
    let preview_paths = RegistryPaths::for_workspace(&paths.workspace_root)
        .with_database(&guard.database)
        .with_chain(&guard.preview_chain);
    let rebuilt = rebuild(&preview_paths)?;
    let mut deltas = BTreeMap::new();
    for (table, proposed) in &rebuilt.relation_counts {
        let current = current_counts.get(table).copied().unwrap_or_default();
        deltas.insert(table.clone(), *proposed as i64 - current as i64);
    }
    guard.cleanup()?;
    Ok(AdmissionPreview {
        current_head: active.generation,
        proposed_generation: proposal.manifest.generation,
        record_id: record.record_id,
        admission_sequence: proposal.entry.sequence,
        source_sha256: proposal.entry.content_sha256,
        predecessor_entry_hash: proposal.entry.predecessor_entry_hash,
        entry_hash: proposal.entry.entry_hash,
        relation_count_deltas: deltas,
        projection_valid: true,
        mutates_governed_head: false,
    })
}

pub fn promote_admission(
    paths: &RegistryPaths,
    draft: &Path,
    authority: &AdmissionAuthority<'_>,
) -> Result<AdmissionReceipt> {
    let preview = preview_admission(paths, draft, authority)?;
    let _lock = AdmissionLock::acquire(&paths.chain_root)?;
    let active = verify_chain(&paths.workspace_root, &paths.chain_root)?;
    if active.generation != authority.expected_head || active.generation != preview.current_head {
        bail!("admission HEAD changed after preview; retry with the new expected HEAD");
    }
    let record = validate_admission(draft)?;
    let bytes = fs::read(draft)?;
    let proposal = proposal(&active, &record, &bytes, authority)?;
    if proposal.manifest.generation != preview.proposed_generation
        || proposal.entry.entry_hash != preview.entry_hash
    {
        bail!("admission proposal changed between preview and promotion");
    }

    let generations = paths.chain_root.join("generations");
    let final_directory = generations.join(&proposal.manifest.generation);
    if final_directory.exists() {
        bail!(
            "proposed admission generation already exists: {}",
            final_directory.display()
        );
    }
    let staging_directory = generations.join(format!(".stage-{}", proposal.manifest.generation));
    if staging_directory.exists() {
        bail!(
            "admission staging directory already exists: {}",
            staging_directory.display()
        );
    }
    fs::create_dir(&staging_directory)?;
    let stage_result = (|| -> Result<()> {
        write_new(&staging_directory.join("admission.json"), &bytes)?;
        write_json_new(&staging_directory.join("manifest.json"), &proposal.manifest)?;
        fs::rename(&staging_directory, &final_directory)?;
        let next_head = paths
            .chain_root
            .join(format!(".HEAD-next-{}", std::process::id()));
        write_new(
            &next_head,
            format!("{}\n", proposal.manifest.generation).as_bytes(),
        )?;
        atomic_replace(&next_head, &paths.chain_root.join("HEAD"))?;
        Ok(())
    })();
    if let Err(error) = stage_result {
        if staging_directory.exists() {
            let _ = fs::remove_dir_all(&staging_directory);
        }
        return Err(error).context("failed to atomically promote governed admission generation");
    }

    let projection = rebuild(paths).context(
        "admission generation was promoted, but projection replacement failed; rerun rebuild before querying",
    )?;
    Ok(AdmissionReceipt {
        schema: "cintamani.admission-receipt.v1".to_owned(),
        record_id: record.record_id,
        admission_sequence: proposal.entry.sequence,
        generation: proposal.manifest.generation,
        entry_hash: proposal.entry.entry_hash,
        content_sha256: proposal.entry.content_sha256,
        predecessor_entry_hash: proposal.entry.predecessor_entry_hash,
        admitted_by: authority.admitted_by.to_owned(),
        authority_kind: authority.authority_kind.to_owned(),
        authority_ref: authority.authority_ref.to_owned(),
        prior_head: active.generation,
        projection_schema_version: projection.schema_version,
    })
}

struct Proposal {
    manifest: AdmissionManifest,
    entry: ManifestEntry,
}

fn proposal(
    active: &crate::VerifiedChain,
    record: &AdmissionV2,
    bytes: &[u8],
    authority: &AdmissionAuthority<'_>,
) -> Result<Proposal> {
    let sequence = active.entries.len() as u64 + 1;
    let content_sha256 = sha256(bytes);
    let generation = format!("g{sequence:06}-{}", &content_sha256[..12]);
    let path = format!(".narada/kb/cintamani-domain/chain/generations/{generation}/admission.json");
    let predecessor_entry_hash = active
        .entries
        .last()
        .context("admission chain unexpectedly empty")?
        .entry
        .entry_hash
        .clone();
    let mut entry = ManifestEntry {
        sequence,
        path,
        content_sha256,
        predecessor_entry_hash,
        record_id: record.record_id.clone(),
        admitted_at: record.admitted_at.clone(),
        admitted_by: authority.admitted_by.to_owned(),
        authority_kind: authority.authority_kind.to_owned(),
        authority_ref: authority.authority_ref.to_owned(),
        entry_hash: String::new(),
    };
    entry.entry_hash = compute_entry_hash(&entry);
    let mut entries = active
        .entries
        .iter()
        .map(|admission| admission.entry.clone())
        .collect::<Vec<_>>();
    entries.push(entry.clone());
    let manifest = AdmissionManifest {
        schema: crate::CHAIN_SCHEMA.to_owned(),
        generation,
        previous_generation: Some(active.generation.clone()),
        entries,
    };
    Ok(Proposal { manifest, entry })
}

struct PreviewGuard {
    candidate_directory: PathBuf,
    preview_root: PathBuf,
    preview_chain: PathBuf,
    database: PathBuf,
    cleaned: bool,
}

impl PreviewGuard {
    fn stage(paths: &RegistryPaths, proposal: &Proposal, bytes: &[u8]) -> Result<Self> {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
        let preview_root = paths.workspace_root.join(".narada/db").join(format!(
            ".cintamani-admission-preview-{}-{nonce}",
            std::process::id()
        ));
        let preview_chain = preview_root.join("chain");
        let database = preview_root.join("projection.sqlite");
        let candidate_directory = paths
            .chain_root
            .join("generations")
            .join(&proposal.manifest.generation);
        if candidate_directory.exists() {
            bail!(
                "proposed generation already exists: {}",
                candidate_directory.display()
            );
        }
        fs::create_dir_all(&candidate_directory)?;
        let stage_result = (|| -> Result<()> {
            write_new(&candidate_directory.join("admission.json"), bytes)?;
            write_json_new(
                &candidate_directory.join("manifest.json"),
                &proposal.manifest,
            )?;
            copy_directory(&paths.chain_root, &preview_chain)?;
            fs::write(
                preview_chain.join("HEAD"),
                format!("{}\n", proposal.manifest.generation),
            )?;
            Ok(())
        })();
        if let Err(error) = stage_result {
            let _ = fs::remove_dir_all(&candidate_directory);
            let _ = fs::remove_dir_all(&preview_root);
            return Err(error);
        }
        Ok(Self {
            candidate_directory,
            preview_root,
            preview_chain,
            database,
            cleaned: false,
        })
    }

    fn cleanup(&mut self) -> Result<()> {
        if self.cleaned {
            return Ok(());
        }
        if self.candidate_directory.exists() {
            fs::remove_dir_all(&self.candidate_directory)?;
        }
        if self.preview_root.exists() {
            fs::remove_dir_all(&self.preview_root)?;
        }
        self.cleaned = true;
        Ok(())
    }
}

impl Drop for PreviewGuard {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}

struct AdmissionLock {
    path: PathBuf,
}

impl AdmissionLock {
    fn acquire(chain_root: &Path) -> Result<Self> {
        let path = chain_root.join("LOCK");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .context("another governed admission promotion holds the chain lock")?;
        writeln!(file, "pid={}", std::process::id())?;
        Ok(Self { path })
    }
}

impl Drop for AdmissionLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn validate_record(record: &AdmissionV2) -> Result<()> {
    if record.schema_version != 2 {
        bail!("governed admission drafts must use schema_version 2");
    }
    for (label, value) in [
        ("record_id", record.record_id.as_str()),
        ("admitted_at", record.admitted_at.as_str()),
        ("description", record.description.as_str()),
    ] {
        if value.trim().is_empty() {
            bail!("admission {label} must not be blank");
        }
    }
    if record.changes.is_empty() {
        bail!("governed admission must contain at least one typed change");
    }
    Ok(())
}

fn validate_authority(authority: &AdmissionAuthority<'_>) -> Result<()> {
    for (label, value) in [
        ("admitted_by", authority.admitted_by),
        ("authority_kind", authority.authority_kind),
        ("authority_ref", authority.authority_ref),
        ("expected_head", authority.expected_head),
    ] {
        let normalized = value.trim().to_ascii_lowercase();
        if normalized.is_empty()
            || ["placeholder", "todo", "tbd", "unknown", "none"]
                .iter()
                .any(|marker| normalized.contains(marker))
        {
            bail!("admission {label} is blank or placeholder-like");
        }
    }
    Ok(())
}

fn copy_directory(source: &Path, target: &Path) -> Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_directory(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path)?;
        }
    }
    Ok(())
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn write_json_new(path: &Path, value: &impl Serialize) -> Result<()> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    write_new(path, &bytes)
}

#[cfg(windows)]
fn atomic_replace(stage: &Path, target: &Path) -> Result<()> {
    let mut target_wide = target.as_os_str().encode_wide().collect::<Vec<_>>();
    target_wide.push(0);
    let mut stage_wide = stage.as_os_str().encode_wide().collect::<Vec<_>>();
    stage_wide.push(0);
    let success = unsafe {
        ReplaceFileW(
            target_wide.as_ptr(),
            stage_wide.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if success == 0 {
        bail!(
            "atomic HEAD replacement failed: {}",
            std::io::Error::last_os_error()
        );
    }
    Ok(())
}

#[cfg(not(windows))]
fn atomic_replace(stage: &Path, target: &Path) -> Result<()> {
    fs::rename(stage, target).context("atomic HEAD replacement failed")
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
