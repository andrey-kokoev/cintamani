use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashSet},
    fs,
    path::{Component, Path, PathBuf},
};

pub const CHAIN_SCHEMA: &str = "cintamani.admission-manifest.v1";
pub const DEFAULT_CHAIN_ROOT: &str = ".narada/kb/cintamani-domain/chain";
const LEGACY_RECORD_ROOT: &str = ".narada/kb/cintamani-domain/admissions";
const LEGACY: [(&str, &str, &str); 4] = [
    (
        ".narada/kb/cintamani-domain/admissions/0001-taxonomy.json",
        "1542f65cfeaab46383f309a1e3246346c3182d724194c57f3151752aeb65bb20",
        "admission-domain-taxonomy-v1",
    ),
    (
        ".narada/kb/cintamani-domain/admissions/0002-ledger12.json",
        "18f30d6a0bf371e43e08813426b918156782de79de46a9c7d397dd87706d5f27",
        "admission-ledger-12",
    ),
    (
        ".narada/kb/cintamani-domain/admissions/0003-ledger13.json",
        "ea54001407e6a50ed3d6af577ea3652ca7b501d6162b3221b2cb015116524c37",
        "admission-ledger-13",
    ),
    (
        ".narada/kb/cintamani-domain/admissions/0004-ledger14.json",
        "0ccd170a7f6a346e2d510b1bdb596078395742cd2e11a7e7d9e30eac688448b9",
        "admission-ledger-14",
    ),
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AdmissionManifest {
    pub schema: String,
    pub generation: String,
    pub previous_generation: Option<String>,
    pub entries: Vec<ManifestEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ManifestEntry {
    pub sequence: u64,
    pub path: String,
    pub content_sha256: String,
    pub predecessor_entry_hash: String,
    pub record_id: String,
    pub admitted_at: String,
    pub admitted_by: String,
    pub authority_kind: String,
    pub authority_ref: String,
    pub entry_hash: String,
}

#[derive(Clone, Debug)]
pub struct VerifiedAdmission {
    pub entry: ManifestEntry,
    pub absolute_path: PathBuf,
    pub bytes: Vec<u8>,
    pub record_schema_version: u32,
}

#[derive(Clone, Debug)]
pub struct VerifiedChain {
    pub generation: String,
    pub entries: Vec<VerifiedAdmission>,
}

#[derive(Deserialize)]
struct RecordHeader {
    record_id: String,
    schema_version: u32,
    admitted_at: String,
}

pub fn verify_chain(workspace_root: &Path, chain_root: &Path) -> Result<VerifiedChain> {
    let head = fs::read_to_string(chain_root.join("HEAD")).with_context(|| {
        format!(
            "failed to read admission-chain HEAD in {}",
            chain_root.display()
        )
    })?;
    let generation = head.trim();
    validate_segment(generation, "chain generation")?;
    if generation.is_empty() || head.split_whitespace().count() != 1 {
        bail!("admission-chain HEAD must contain exactly one generation identifier");
    }

    verify_legacy_directory(workspace_root)?;
    let mut visiting = HashSet::new();
    let manifest = verify_generation(chain_root, generation, &mut visiting)?;
    let mut paths = BTreeSet::new();
    let mut record_ids = BTreeSet::new();
    let mut entry_hashes = BTreeSet::new();
    let mut verified = Vec::with_capacity(manifest.entries.len());
    let mut predecessor = "GENESIS".to_owned();

    for (index, entry) in manifest.entries.iter().enumerate() {
        let expected_sequence = index as u64 + 1;
        if entry.sequence != expected_sequence {
            bail!(
                "admission sequence is not contiguous: expected {expected_sequence}, found {}",
                entry.sequence
            );
        }
        if !paths.insert(entry.path.clone())
            || !record_ids.insert(entry.record_id.clone())
            || !entry_hashes.insert(entry.entry_hash.clone())
        {
            bail!("admission manifest contains a duplicate path, identity, or entry hash");
        }
        if entry.predecessor_entry_hash != predecessor {
            bail!("admission {} has a stale predecessor", entry.record_id);
        }
        validate_receipt(entry)?;
        let expected_entry_hash = compute_entry_hash(entry);
        if !expected_entry_hash.eq_ignore_ascii_case(&entry.entry_hash) {
            bail!("admission {} entry hash is invalid", entry.record_id);
        }
        let relative = validated_relative_path(&entry.path)?;
        let absolute_path = workspace_root.join(relative);
        let bytes = fs::read(&absolute_path).with_context(|| {
            format!(
                "failed to read governed admission {}",
                absolute_path.display()
            )
        })?;
        let observed = sha256_bytes(&bytes);
        if !observed.eq_ignore_ascii_case(&entry.content_sha256) {
            bail!(
                "governed admission {} content hash mismatch",
                entry.record_id
            );
        }
        let header: RecordHeader = serde_json::from_slice(&bytes)
            .with_context(|| format!("failed to parse governed admission {}", entry.record_id))?;
        if header.record_id != entry.record_id || header.admitted_at != entry.admitted_at {
            bail!(
                "governed admission {} identity/time differs from its manifest",
                entry.record_id
            );
        }
        if expected_sequence <= LEGACY.len() as u64 {
            let (legacy_path, legacy_hash, legacy_id) = LEGACY[index];
            if entry.path != legacy_path
                || !entry.content_sha256.eq_ignore_ascii_case(legacy_hash)
                || entry.record_id != legacy_id
                || header.schema_version != 1
            {
                bail!("the frozen v1 admission prefix was altered or downgraded");
            }
        } else {
            if header.schema_version != 2 {
                bail!(
                    "post-v1 admission {} must use record schema 2",
                    entry.record_id
                );
            }
            if !entry
                .path
                .starts_with(".narada/kb/cintamani-domain/chain/generations/")
                || !entry.path.ends_with("/admission.json")
            {
                bail!("post-v1 admission must be owned by an immutable chain generation");
            }
        }
        predecessor = entry.entry_hash.to_ascii_lowercase();
        verified.push(VerifiedAdmission {
            entry: entry.clone(),
            absolute_path,
            bytes,
            record_schema_version: header.schema_version,
        });
    }
    if verified.len() < LEGACY.len() {
        bail!("admission chain deleted one or more frozen v1 admissions");
    }
    Ok(VerifiedChain {
        generation: generation.to_owned(),
        entries: verified,
    })
}

fn verify_generation(
    chain_root: &Path,
    generation: &str,
    visiting: &mut HashSet<String>,
) -> Result<AdmissionManifest> {
    validate_segment(generation, "chain generation")?;
    if !visiting.insert(generation.to_owned()) {
        bail!("admission generation ancestry contains a cycle");
    }
    let path = chain_root
        .join("generations")
        .join(generation)
        .join("manifest.json");
    let bytes = fs::read(&path)
        .with_context(|| format!("failed to read admission manifest {}", path.display()))?;
    let manifest: AdmissionManifest = serde_json::from_slice(&bytes)
        .with_context(|| format!("failed to parse admission manifest {}", path.display()))?;
    if manifest.schema != CHAIN_SCHEMA || manifest.generation != generation {
        bail!("admission manifest schema or generation identity mismatch");
    }
    if let Some(previous) = &manifest.previous_generation {
        let prior = verify_generation(chain_root, previous, visiting)?;
        if manifest.entries.len() != prior.entries.len() + 1
            || manifest.entries[..prior.entries.len()] != prior.entries
        {
            bail!("admission generation does not append exactly one entry to its predecessor");
        }
        let expected_path =
            format!(".narada/kb/cintamani-domain/chain/generations/{generation}/admission.json");
        if manifest.entries.last().map(|entry| entry.path.as_str()) != Some(expected_path.as_str())
        {
            bail!("admission generation does not own the record it introduced");
        }
    } else if manifest.entries.len() != LEGACY.len() {
        bail!("root admission generation must be the exact four-record v1 bootstrap");
    }
    visiting.remove(generation);
    Ok(manifest)
}

fn verify_legacy_directory(workspace_root: &Path) -> Result<()> {
    let root = workspace_root.join(LEGACY_RECORD_ROOT);
    let mut json_paths = fs::read_dir(&root)
        .with_context(|| {
            format!(
                "failed to inspect frozen v1 admission directory {}",
                root.display()
            )
        })?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect::<Vec<_>>();
    json_paths.sort();
    let expected = LEGACY
        .iter()
        .map(|(path, _, _)| workspace_root.join(path))
        .collect::<Vec<_>>();
    if json_paths != expected {
        bail!("frozen v1 admission directory has an insertion, deletion, or reorder");
    }
    Ok(())
}

pub fn compute_entry_hash(entry: &ManifestEntry) -> String {
    let body = format!(
        "cintamani-admission-chain-v1\nsequence={}\npath={}\ncontent_sha256={}\npredecessor={}\nrecord_id={}\nadmitted_at={}\nadmitted_by={}\nauthority_kind={}\nauthority_ref={}\n",
        entry.sequence,
        entry.path,
        entry.content_sha256.to_ascii_lowercase(),
        entry.predecessor_entry_hash,
        entry.record_id,
        entry.admitted_at,
        entry.admitted_by,
        entry.authority_kind,
        entry.authority_ref
    );
    sha256_bytes(body.as_bytes())
}

fn validate_receipt(entry: &ManifestEntry) -> Result<()> {
    for (label, value) in [
        ("admitted_by", entry.admitted_by.as_str()),
        ("authority_kind", entry.authority_kind.as_str()),
        ("authority_ref", entry.authority_ref.as_str()),
    ] {
        let normalized = value.trim().to_ascii_lowercase();
        if normalized.is_empty()
            || ["placeholder", "todo", "tbd", "unknown", "none"]
                .iter()
                .any(|marker| normalized.contains(marker))
        {
            bail!("admission {} has an invalid {label}", entry.record_id);
        }
    }
    Ok(())
}

fn validate_segment(value: &str, label: &str) -> Result<()> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        bail!("invalid {label}: {value}");
    }
    Ok(())
}

fn validated_relative_path(value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        bail!("admission path must be a normalized workspace-relative path: {value}");
    }
    Ok(path.to_path_buf())
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_hash_is_stable() {
        let manifest: AdmissionManifest = serde_json::from_str(include_str!(
            "../../../.narada/kb/cintamani-domain/chain/generations/bootstrap-0004-0e32d9248223/manifest.json"
        ))
        .unwrap();
        for entry in manifest.entries {
            assert_eq!(compute_entry_hash(&entry), entry.entry_hash);
        }
    }
}
