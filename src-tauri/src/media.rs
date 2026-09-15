use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use walkdir::WalkDir;

type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub size: u64,
    #[serde(skip)]
    pub path: PathBuf,
}
#[derive(Serialize)]
pub struct Library {
    pub root: String,
    pub clips: Vec<Clip>,
}
pub struct Media {
    pub config: PathBuf,
    pub root: Mutex<PathBuf>,
    pub clips: Mutex<HashMap<String, Clip>>,
    pub generation: AtomicU64,
    pub worker: Mutex<()>,
}
fn io(error: std::io::Error) -> String {
    format!("Could not access the recording: {error}")
}
fn identity(path: &Path) -> Result<(String, u64)> {
    let stat = fs::metadata(path).map_err(io)?;
    let modified = stat
        .modified()
        .map_err(io)?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    Ok((
        format!(
            "{:x}",
            Sha256::digest(format!("{}\0{}\0{}", path.display(), stat.len(), modified))
        ),
        stat.len(),
    ))
}
impl Media {
    pub fn cancel(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }
    pub fn discover(&self, root: PathBuf) -> Result<Library> {
        let root = root.canonicalize().map_err(io)?;
        if !root.is_dir() {
            return Err("Choose a folder containing your original COMTEC recordings.".into());
        }
        let mut clips = Vec::new();
        for entry in WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| {
                e.depth() == 0
                    || (!e.file_name().to_string_lossy().starts_with('.')
                        && !e
                            .file_name()
                            .to_string_lossy()
                            .eq_ignore_ascii_case("preview"))
            })
        {
            let entry = entry.map_err(|e| format!("Could not read the selected folder: {e}"))?;
            if !entry.file_type().is_file()
                || !entry
                    .path()
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("mp4"))
            {
                continue;
            }
            let path = entry.path().canonicalize().map_err(io)?;
            if !path.starts_with(&root) {
                continue;
            }
            let (id, size) = identity(&path)?;
            clips.push(Clip {
                id,
                size,
                name: entry.file_name().to_string_lossy().into(),
                folder: path
                    .parent()
                    .unwrap()
                    .strip_prefix(&root)
                    .unwrap()
                    .to_string_lossy()
                    .into(),
                path,
            });
        }
        clips.sort_by_key(|c| format!("{}/{}", c.folder, c.name).to_lowercase());
        *self.clips.lock().unwrap() = clips.iter().map(|c| (c.id.clone(), c.clone())).collect();
        *self.root.lock().unwrap() = root.clone();
        if let Some(parent) = self.config.parent() {
            fs::create_dir_all(parent).map_err(io)?;
        }
        fs::write(&self.config, root.to_string_lossy().as_bytes()).map_err(io)?;
        Ok(Library {
            root: root.to_string_lossy().into(),
            clips,
        })
    }
    pub(crate) fn unchanged(&self, clip: &Clip) -> Result<()> {
        let path = clip.path.canonicalize().map_err(io)?;
        if path != clip.path
            || !path.starts_with(&*self.root.lock().unwrap())
            || identity(&path)?.0 != clip.id
        {
            return Err("The original recording changed. Refresh the library.".into());
        }
        Ok(())
    }
}
#[cfg(test)]
mod integration {
    use super::*;
    fn media(root: PathBuf, cache: PathBuf) -> Media {
        Media {
            root: Mutex::new(root),
            config: cache.join("folder"),
            clips: Mutex::new(HashMap::new()),
            generation: AtomicU64::new(0),
            worker: Mutex::new(()),
        }
    }
    #[test]
    fn discovery_excludes_previews_hidden_and_symlinks() {
        let root = std::env::temp_dir().join(format!("comtec-discovery-{}", std::process::id()));
        let input = root.join("originals");
        fs::create_dir_all(input.join("Preview")).unwrap();
        fs::create_dir_all(input.join(".hidden")).unwrap();
        for p in [
            "good.MP4",
            "Preview/export.mp4",
            ".hidden/private.mp4",
            ".secret.mp4",
        ] {
            fs::write(input.join(p), b"fixture").unwrap();
        }
        std::os::unix::fs::symlink(input.join("good.MP4"), input.join("link.mp4")).unwrap();
        let m = media(input.clone(), root.join("cache"));
        let result = m.discover(input.clone()).unwrap();
        assert_eq!(result.clips.len(), 1);
        let id = result.clips[0].id.clone();
        fs::write(input.join("good.MP4"), b"changed fixture").unwrap();
        assert_ne!(m.discover(input).unwrap().clips[0].id, id);
        fs::remove_dir_all(root).unwrap();
    }
}
