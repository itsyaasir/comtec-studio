use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
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
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prepared {
    pub duration: f64,
    pub start: f64,
    pub main_path: String,
    pub rear_path: String,
    pub sizes: [u64; 2],
    pub version: u32,
}
pub struct Media {
    pub cache: PathBuf,
    pub helpers: PathBuf,
    pub config: PathBuf,
    pub root: Mutex<PathBuf>,
    pub clips: Mutex<HashMap<String, Clip>>,
    pub generation: AtomicU64,
    pub worker: Mutex<()>,
    pub child: Mutex<Option<Child>>,
}
fn io(error: std::io::Error) -> String {
    format!("Could not access the recording or playback cache: {error}")
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
        let mut slot = self.child.lock().unwrap();
        let ticket = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        ticket
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
    fn check(&self, ticket: u64) -> Result<()> {
        if self.generation.load(Ordering::SeqCst) != ticket {
            Err("Preparation cancelled.".into())
        } else {
            Ok(())
        }
    }
    fn process(&self, helper: &str, args: &[String], ticket: u64) -> Result<Vec<u8>> {
        self.check(ticket)?;
        let output_path = self.cache.join("helper-output.tmp");
        let output = fs::File::create(&output_path).map_err(io)?;
        let mut slot = self.child.lock().unwrap();
        self.check(ticket)?;
        *slot = Some(
            Command::new(self.helpers.join(helper))
                .args(args)
                .env_clear()
                .stdin(Stdio::null())
                .stdout(output)
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("The bundled media helper could not start: {e}"))?,
        );
        drop(slot);
        let begin = Instant::now();
        loop {
            let mut slot = self.child.lock().unwrap();
            let child = slot.as_mut().ok_or("Media preparation was interrupted.")?;
            if self.check(ticket).is_err() || begin.elapsed() > Duration::from_secs(180) {
                let _ = child.kill();
                let _ = child.wait();
                *slot = None;
                return Err(
                    "Preparation cancelled or timed out. Select the recording to retry.".into(),
                );
            }
            if let Some(status) = child.try_wait().map_err(io)? {
                *slot = None;
                if !status.success() {
                    return Err(
                        "This recording could not be prepared. It may be incomplete or damaged."
                            .into(),
                    );
                }
                break;
            }
            drop(slot);
            std::thread::sleep(Duration::from_millis(30));
        }
        let bytes = fs::read(&output_path).map_err(io)?;
        let _ = fs::remove_file(output_path);
        Ok(bytes)
    }
    fn probe(&self, path: &Path, ticket: u64) -> Result<Value> {
        let args = [
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
        ]
        .map(String::from)
        .into_iter()
        .chain([path.to_string_lossy().into()])
        .collect::<Vec<_>>();
        serde_json::from_slice(&self.process("ffprobe", &args, ticket)?)
            .map_err(|_| "The camera information is unreadable.".into())
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
    pub fn prepare(&self, id: &str, ticket: u64) -> Result<Prepared> {
        let _worker = self.worker.lock().unwrap();
        self.check(ticket)?;
        let clip = self
            .clips
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or("Recording unavailable. Refresh the library.")?;
        self.unchanged(&clip)?;
        fs::create_dir_all(&self.cache).map_err(io)?;
        let directory = self.cache.join(id);
        if let Ok(bytes) = fs::read(directory.join("ready.json")) {
            if let Ok(mut ready) = serde_json::from_slice::<Prepared>(&bytes) {
                if ready.version == 1
                    && ready.duration.is_finite()
                    && ready.start >= 0.0
                    && ready.duration > ready.start
                    && ["main", "rear"].iter().enumerate().all(|(i, name)| {
                        fs::symlink_metadata(directory.join(format!("{name}.mp4")))
                            .is_ok_and(|s| s.is_file() && s.len() > 0 && s.len() == ready.sizes[i])
                    })
                {
                    ready.main_path = directory.join("main.mp4").to_string_lossy().into();
                    ready.rear_path = directory.join("rear.mp4").to_string_lossy().into();
                    return Ok(ready);
                }
            }
        }
        let probe = self.probe(&clip.path, ticket)?;
        let streams = probe["streams"]
            .as_array()
            .ok_or("No camera tracks were found.")?;
        let videos: Vec<_> = streams
            .iter()
            .filter(|s| s["codec_type"] == "video")
            .collect();
        if videos.len() < 2 {
            return Err(
                "No rear-camera track. Choose an original two-camera COMTEC recording.".into(),
            );
        }
        if streams
            .iter()
            .any(|s| s["codec_type"] == "audio" && s["codec_name"] != "aac")
        {
            return Err("This recording uses unsupported audio. AAC is required.".into());
        }
        let times = [
            video_time(videos[0], &probe)?,
            video_time(videos[1], &probe)?,
        ];
        let epoch = times[0].0.min(times[1].0);
        let start = times[0].0.max(times[1].0) - epoch;
        let mut end = (times[0].0 + times[0].1).min(times[1].0 + times[1].1) - epoch;
        if end <= start {
            return Err("The camera tracks have no overlapping playback time.".into());
        }
        let staging = self.cache.join(format!("staging-{id}"));
        if staging.exists() {
            fs::remove_dir_all(&staging).map_err(io)?;
        }
        fs::create_dir_all(&staging).map_err(io)?;
        let result = (|| {
            let mut sizes = [0; 2];
            for (index, camera) in ["main", "rear"].iter().enumerate() {
                let output = staging.join(format!("{camera}.mp4"));
                let mut args: Vec<String> = [
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-nostdin",
                    "-y",
                    "-copyts",
                    "-itsoffset",
                ]
                .map(String::from)
                .into();
                args.extend([
                    format!("{:.9}", -epoch),
                    "-i".into(),
                    clip.path.to_string_lossy().into(),
                    "-map".into(),
                    format!("0:v:{index}"),
                ]);
                if index == 0 {
                    args.extend(["-map".into(), "0:a:0?".into()]);
                } else {
                    args.push("-an".into());
                }
                args.extend(
                    [
                        "-c",
                        "copy",
                        "-map_metadata",
                        "-1",
                        "-map_chapters",
                        "-1",
                        "-avoid_negative_ts",
                        "disabled",
                        "-use_editlist",
                        "1",
                        "-movflags",
                        "+faststart",
                    ]
                    .map(String::from),
                );
                args.push(output.to_string_lossy().into());
                self.process("ffmpeg", &args, ticket)?;
                let prepared = self.probe(&output, ticket)?;
                let track = prepared["streams"]
                    .as_array()
                    .and_then(|s| s.iter().find(|s| s["codec_type"] == "video"))
                    .ok_or("Prepared video is missing.")?;
                let (offset, duration) = video_time(track, &prepared)?;
                end = end.min(offset + duration);
                sizes[index] = fs::metadata(output).map_err(io)?.len();
            }
            self.check(ticket)?;
            self.unchanged(&clip)?;
            if end <= start {
                return Err("The prepared camera tracks do not overlap.".into());
            }
            let ready = Prepared {
                duration: end,
                start,
                main_path: directory.join("main.mp4").to_string_lossy().into(),
                rear_path: directory.join("rear.mp4").to_string_lossy().into(),
                sizes,
                version: 1,
            };
            fs::write(
                staging.join("ready.json"),
                serde_json::to_vec(&ready).unwrap(),
            )
            .map_err(io)?;
            if directory.exists() {
                fs::remove_dir_all(&directory).map_err(io)?;
            }
            fs::rename(&staging, &directory).map_err(io)?;
            Ok(ready)
        })();
        if staging.exists() {
            let _ = fs::remove_dir_all(staging);
        }
        result
    }
    pub fn clear(&self) -> Result<()> {
        let _worker = self.worker.lock().unwrap();
        if self.cache.exists() {
            fs::remove_dir_all(&self.cache).map_err(io)?;
        }
        fs::create_dir_all(&self.cache).map_err(io)
    }
}
fn number(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str()?.parse().ok())
        .filter(|n| n.is_finite())
}
fn video_time(stream: &Value, probe: &Value) -> Result<(f64, f64)> {
    if stream["codec_name"] != "h264" {
        return Err("Both camera tracks must use H.264 video.".into());
    }
    let format_start = number(&probe["format"]["start_time"]).unwrap_or(0.0);
    let start = number(&stream["start_time"]).unwrap_or(format_start);
    let length = number(&stream["duration"])
        .or_else(|| number(&probe["format"]["duration"]).map(|d| format_start + d - start))
        .filter(|n| *n > 0.0)
        .ok_or("A camera track has no usable duration.")?;
    Ok((start, length))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timing_fallback_preserves_offset() {
        let p = serde_json::json!({"format":{"start_time":"3", "duration":"10"}});
        let s = serde_json::json!({"codec_name":"h264","start_time":"5"});
        assert_eq!(video_time(&s, &p).unwrap(), (5.0, 8.0));
    }
    #[test]
    fn invalid_duration_rejected() {
        assert!(video_time(
            &serde_json::json!({"codec_name":"h264","duration":"NaN"}),
            &Value::Null
        )
        .is_err());
    }
    #[test]
    fn wrong_codec_rejected() {
        assert!(video_time(
            &serde_json::json!({"codec_name":"hevc","duration":"60"}),
            &Value::Null
        )
        .is_err());
    }
}
#[cfg(test)]
mod integration {
    use super::*;
    fn media(root: PathBuf, cache: PathBuf) -> Media {
        Media {
            root: Mutex::new(root),
            cache: cache.join("media"),
            config: cache.join("folder"),
            helpers: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/media"),
            clips: Mutex::new(HashMap::new()),
            generation: AtomicU64::new(0),
            worker: Mutex::new(()),
            child: Mutex::new(None),
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
    #[test]
    #[ignore = "requires explicitly selected real recordings"]
    fn real_recordings_remux_and_cache() {
        let root = PathBuf::from(std::env::var("COMTEC_TEST_ROOT").expect("set COMTEC_TEST_ROOT"));
        let cache = std::env::temp_dir().join(format!("comtec-real-{}", std::process::id()));
        let m = media(root.clone(), cache.clone());
        let library = m.discover(root).unwrap();
        for name in ["000_023859_A.mp4", "000_025643_A.mp4", "015_025359_A.mp4"] {
            let clip = library.clips.iter().find(|c| c.name == name).unwrap();
            let before = identity(&clip.path).unwrap();
            let prepared = m.prepare(&clip.id, 0).unwrap();
            assert!(prepared.duration > prepared.start);
            assert!(prepared.sizes.iter().all(|s| *s > 1000));
            assert_eq!(m.prepare(&clip.id, 0).unwrap().duration, prepared.duration);
            assert_eq!(identity(&clip.path).unwrap(), before);
            println!(
                "{}: {:.3}s, camera bytes {:?}",
                name, prepared.duration, prepared.sizes
            );
        }
        m.clear().unwrap();
        fs::remove_dir_all(cache).unwrap();
    }
}
#[cfg(test)]
mod lifecycle {
    use super::*;
    #[test]
    fn cancellation_reaps_active_helper() {
        let temp = std::env::temp_dir().join(format!("comtec-cancel-{}", std::process::id()));
        fs::create_dir_all(&temp).unwrap();
        let m = std::sync::Arc::new(Media {
            cache: temp.clone(),
            config: temp.join("settings"),
            helpers: PathBuf::from("/bin"),
            root: Mutex::new(temp.clone()),
            clips: Mutex::new(HashMap::new()),
            generation: AtomicU64::new(0),
            worker: Mutex::new(()),
            child: Mutex::new(None),
        });
        let worker = m.clone();
        let thread = std::thread::spawn(move || worker.process("sleep", &["30".into()], 0));
        let start = Instant::now();
        while m.child.lock().unwrap().is_none() {
            assert!(start.elapsed() < Duration::from_secs(3));
            std::thread::sleep(Duration::from_millis(5));
        }
        let ticket = m.cancel();
        assert_eq!(ticket, 1);
        assert!(thread.join().unwrap().is_err());
        assert!(m.child.lock().unwrap().is_none());
        assert!(start.elapsed() < Duration::from_secs(3));
        fs::remove_dir_all(temp).unwrap();
    }
}
