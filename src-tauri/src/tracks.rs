//! Virtual progressive MP4s: rewrite only the movie index, read mdat from the original.
use std::{fs::File, os::unix::fs::FileExt, path::Path, sync::Arc};
type Result<T> = std::result::Result<T, String>;
const MAX_INDEX: u64 = 16 * 1024 * 1024;
pub const MAX_RANGE: u64 = 2 * 1024 * 1024;
#[derive(Clone)]
pub struct Track {
    source: Arc<File>,
    header: Arc<Vec<u8>>,
    mdat: u64,
    pub size: u64,
}
pub struct Tracks {
    pub cameras: [Track; 2],
    pub duration: f64,
}
#[derive(Clone, Copy)]
struct Atom {
    start: usize,
    end: usize,
    body: usize,
    kind: [u8; 4],
}
fn u32_at(b: &[u8], p: usize) -> Result<u32> {
    Ok(u32::from_be_bytes(
        b.get(p..p + 4)
            .ok_or("Truncated MP4 index")?
            .try_into()
            .unwrap(),
    ))
}
fn u64_at(b: &[u8], p: usize) -> Result<u64> {
    Ok(u64::from_be_bytes(
        b.get(p..p + 8)
            .ok_or("Truncated MP4 index")?
            .try_into()
            .unwrap(),
    ))
}
fn atoms(b: &[u8], start: usize, end: usize) -> Result<Vec<Atom>> {
    let mut p = start;
    let mut out = Vec::new();
    while p < end {
        if out.len() >= 4096 || end > b.len() || end - p < 8 {
            return Err("Invalid MP4 box list".into());
        }
        let mut n = u32_at(b, p)? as u64;
        let mut header = 8;
        if n == 1 {
            n = u64_at(b, p + 8)?;
            header = 16;
        }
        if n == 0 {
            n = (end - p) as u64;
        }
        if n < header as u64 || n > (end - p) as u64 {
            return Err("Invalid MP4 box size".into());
        }
        out.push(Atom {
            start: p,
            end: p + n as usize,
            body: p + header,
            kind: b[p + 4..p + 8].try_into().unwrap(),
        });
        p += n as usize;
    }
    Ok(out)
}
fn child(b: &[u8], a: Atom, kind: &[u8; 4]) -> Result<Atom> {
    let found: Vec<_> = atoms(b, a.body, a.end)?
        .into_iter()
        .filter(|a| &a.kind == kind)
        .collect();
    if found.len() != 1 {
        return Err("Missing or duplicate MP4 index box".into());
    }
    Ok(found[0])
}
fn read(file: &File, p: u64, n: usize) -> Result<Vec<u8>> {
    let mut b = vec![0; n];
    file.read_exact_at(&mut b, p)
        .map_err(|e| format!("Could not read original recording: {e}"))?;
    Ok(b)
}
impl Tracks {
    pub fn open(path: &Path) -> Result<Self> {
        let file = Arc::new(File::open(path).map_err(|e| e.to_string())?);
        let size = file.metadata().map_err(|e| e.to_string())?.len();
        let (mut ftyp, mut moov, mut mdat) = (None, None, None);
        let mut p = 0;
        let mut count = 0;
        while p < size {
            count += 1;
            if count > 4096 || size - p < 8 {
                return Err("Invalid MP4 structure".into());
            }
            let h = read(&file, p, 8)?;
            let kind = &h[4..8];
            let mut n = u32_at(&h, 0)? as u64;
            let mut hs = 8;
            if n == 1 {
                n = u64_at(&read(&file, p + 8, 8)?, 0)?;
                hs = 16;
            }
            if n == 0 {
                n = size - p;
            }
            if n < hs || n > size - p {
                return Err("Truncated MP4 recording".into());
            }
            match kind {
                b"ftyp" | b"moov" => {
                    if n > MAX_INDEX {
                        return Err("MP4 index exceeds limit".into());
                    }
                    let slot = if kind == b"ftyp" {
                        &mut ftyp
                    } else {
                        &mut moov
                    };
                    if slot.is_some() {
                        return Err("Duplicate MP4 header".into());
                    }
                    *slot = Some(read(&file, p, n as usize)?);
                }
                b"mdat" => {
                    if mdat.replace((p, n, hs)).is_some() {
                        return Err(
                            "Multiple media data boxes require compatibility playback".into()
                        );
                    }
                }
                b"moof" => return Err("Fragmented MP4 requires compatibility playback".into()),
                _ => {}
            }
            p += n;
        }
        let ftyp = ftyp.ok_or("Missing MP4 file type")?;
        let moov = moov.ok_or("Missing MP4 index")?;
        let (mdat, mdat_len, mdat_header) = mdat.ok_or("Missing camera data")?;
        let root = atoms(&moov, 0, moov.len())?[0];
        let children = atoms(&moov, root.body, root.end)?;
        if children.iter().any(|a| a.kind == *b"mvex") {
            return Err("Fragmented MP4 index".into());
        }
        let mvhd = child(&moov, root, b"mvhd")?;
        // Preserve the native movie timeline. Complex edits take the existing compatibility path.
        let movie_version = moov[mvhd.body];
        let ts = match movie_version {
            0 => u32_at(&moov, mvhd.body + 12)?,
            1 => u32_at(&moov, mvhd.body + 20)?,
            _ => return Err("Unsupported movie version".into()),
        };
        if ts == 0 {
            return Err("Invalid movie timescale".into());
        }
        let mut videos = Vec::new();
        let mut audio = None;
        for a in children.iter().filter(|a| a.kind == *b"trak") {
            if atoms(&moov, a.body, a.end)?
                .iter()
                .any(|a| matches!(&a.kind, b"edts" | b"tref"))
            {
                return Err("Edited tracks require compatibility playback".into());
            }
            let mdia = child(&moov, *a, b"mdia")?;
            let handler = child(&moov, mdia, b"hdlr")?;
            let kind = moov
                .get(handler.body + 8..handler.body + 12)
                .ok_or("Truncated handler")?;
            let minf = child(&moov, mdia, b"minf")?;
            let stbl = child(&moov, minf, b"stbl")?;
            let stsd = child(&moov, stbl, b"stsd")?;
            if u32_at(&moov, stsd.body + 4)? != 1 {
                return Err("Multiple sample descriptions".into());
            }
            let descriptions = atoms(&moov, stsd.body + 8, stsd.end)?;
            if descriptions.len() != 1 {
                return Err("Invalid sample description".into());
            }
            let codec = descriptions[0].kind;
            let dinf = child(&moov, minf, b"dinf")?;
            let dref = child(&moov, dinf, b"dref")?;
            let references = atoms(&moov, dref.body + 8, dref.end)?;
            if u32_at(&moov, dref.body + 4)? != 1
                || references.len() != 1
                || references[0].kind != *b"url "
                || u32_at(&moov, references[0].body)? != 1
            {
                return Err("External media references are not supported".into());
            }
            if kind == b"vide" && codec == *b"avc1" {
                let tkhd = child(&moov, *a, b"tkhd")?;
                let duration = match moov[tkhd.body] {
                    0 => u32_at(&moov, tkhd.body + 20)? as u64,
                    1 => u64_at(&moov, tkhd.body + 28)?,
                    _ => return Err("Unsupported track version".into()),
                };
                if duration == 0 {
                    return Err("Invalid track duration".into());
                }
                videos.push((*a, duration as f64 / ts as f64));
            } else if kind == b"soun" && codec == *b"mp4a" && audio.is_none() {
                audio = Some(*a);
            } else {
                return Err("Unsupported camera or audio format".into());
            }
        }
        if videos.len() != 2 {
            return Err("Expected two H.264 camera tracks".into());
        }
        let mut cameras = Vec::new();
        for (camera, _) in &videos {
            let mut index = moov.clone();
            for a in children.iter().filter(|a| a.kind == *b"trak") {
                let keep = a.start == camera.start
                    || (camera.start == videos[0].0.start
                        && audio.is_some_and(|v| v.start == a.start));
                if keep {
                    patch_offsets(
                        &mut index,
                        *a,
                        mdat,
                        mdat_len,
                        mdat_header,
                        (ftyp.len() + moov.len()) as u64,
                    )?;
                } else {
                    index[a.start + 4..a.start + 8].copy_from_slice(b"free");
                    index[a.body..a.end].fill(0);
                }
            }
            let mut header = ftyp.clone();
            header.extend(index);
            cameras.push(Track {
                source: file.clone(),
                size: header.len() as u64 + mdat_len,
                header: Arc::new(header),
                mdat,
            });
        }
        Ok(Self {
            cameras: cameras.try_into().map_err(|_| "Missing cameras")?,
            duration: videos[0].1.min(videos[1].1),
        })
    }
}
fn patch_offsets(b: &mut [u8], a: Atom, mdat: u64, len: u64, hs: u64, new_mdat: u64) -> Result<()> {
    patch_offsets_at_depth(b, a, mdat, len, hs, new_mdat, 0)
}
fn patch_offsets_at_depth(
    b: &mut [u8],
    a: Atom,
    mdat: u64,
    len: u64,
    hs: u64,
    new_mdat: u64,
    depth: u8,
) -> Result<()> {
    if depth > 4 {
        return Err("Unexpected MP4 index nesting".into());
    }
    for a in atoms(b, a.body, a.end)? {
        match &a.kind {
            b"mdia" | b"minf" | b"stbl" => {
                patch_offsets_at_depth(b, a, mdat, len, hs, new_mdat, depth + 1)?
            }
            b"stco" | b"co64" => {
                let width = if a.kind == *b"stco" { 4 } else { 8 };
                let count = u32_at(b, a.body + 4)? as usize;
                if count == 0 || a.body + 8 + count * width != a.end {
                    return Err("Invalid chunk offset table".into());
                }
                for p in (a.body + 8..a.end).step_by(width) {
                    let old = if width == 4 {
                        u32_at(b, p)? as u64
                    } else {
                        u64_at(b, p)?
                    };
                    if old < mdat + hs || old >= mdat + len {
                        return Err("Camera chunk lies outside media data".into());
                    }
                    let value = old - mdat + new_mdat;
                    if width == 4 {
                        b[p..p + 4].copy_from_slice(
                            &u32::try_from(value)
                                .map_err(|_| "Chunk offset overflow")?
                                .to_be_bytes(),
                        );
                    } else {
                        b[p..p + 8].copy_from_slice(&value.to_be_bytes());
                    }
                }
            }
            b"saio" => return Err("Auxiliary offsets require compatibility playback".into()),
            _ => {}
        }
    }
    Ok(())
}
impl Track {
    pub fn read(&self, start: u64, length: u64) -> Result<Vec<u8>> {
        if length > MAX_RANGE || start > self.size || length > self.size - start {
            return Err("Invalid camera byte range".into());
        }
        let mut out = vec![0; length as usize];
        let header_len = self.header.len() as u64;
        let prefix = if start < header_len {
            (header_len - start).min(length)
        } else {
            0
        };
        if prefix > 0 {
            out[..prefix as usize]
                .copy_from_slice(&self.header[start as usize..(start + prefix) as usize]);
        }
        if prefix < length {
            self.source
                .read_exact_at(
                    &mut out[prefix as usize..],
                    self.mdat + start + prefix - header_len,
                )
                .map_err(|e| format!("Recording unavailable: {e}"))?;
        }
        Ok(out)
    }
}
/// Inclusive single byte range, capped just like Tauri's asset protocol.
pub fn range(value: Option<&str>, size: u64) -> Result<(u64, u64)> {
    if size == 0 {
        return Err("Empty media".into());
    }
    let (start, end) = match value {
        None => (0, size - 1),
        Some(v) => {
            let (a, b) = v
                .strip_prefix("bytes=")
                .and_then(|v| v.split_once('-'))
                .ok_or("Invalid range")?;
            if a.is_empty() {
                let n = b.parse::<u64>().map_err(|_| "Invalid suffix")?;
                if n == 0 {
                    return Err("Empty suffix".into());
                }
                (size.saturating_sub(n), size - 1)
            } else {
                let start = a.parse::<u64>().map_err(|_| "Invalid start")?;
                let end = if b.is_empty() {
                    size - 1
                } else {
                    b.parse::<u64>().map_err(|_| "Invalid end")?.min(size - 1)
                };
                (start, end)
            }
        }
    };
    if start >= size || end < start {
        return Err("Unsatisfiable range".into());
    }
    Ok((start, end.min(start.saturating_add(MAX_RANGE - 1))))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn atom(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut b = ((body.len() + 8) as u32).to_be_bytes().to_vec();
        b.extend(kind);
        b.extend(body);
        b
    }
    #[test]
    fn range_requests_cover_seeking_suffixes_and_bounds() {
        assert_eq!(range(Some("bytes=0-1"), 100).unwrap(), (0, 1));
        assert_eq!(range(Some("bytes=40-"), 100).unwrap(), (40, 99));
        assert_eq!(range(Some("bytes=-10"), 100).unwrap(), (90, 99));
        assert_eq!(range(Some("bytes=-200"), 100).unwrap(), (0, 99));
        assert_eq!(range(Some("bytes=90-200"), 100).unwrap(), (90, 99));
        assert_eq!(
            range(Some("bytes=5-"), u64::MAX).unwrap(),
            (5, 5 + MAX_RANGE - 1)
        );
        for v in [
            "bytes=100-",
            "bytes=10-9",
            "bytes=-0",
            "bytes=0-1,4-5",
            "bytes=x-2",
            "items=0-1",
        ] {
            assert!(range(Some(v), 100).is_err(), "{v}");
        }
    }
    #[test]
    fn malformed_box_sizes_are_rejected() {
        for b in [
            vec![0; 4],
            vec![0, 0, 0, 7, b'm', b'o', b'o', b'v'],
            vec![0, 0, 0, 100, b'm', b'o', b'o', b'v'],
        ] {
            assert!(atoms(&b, 0, b.len()).is_err());
        }
    }
    #[test]
    fn relocates_both_offset_widths_and_rejects_outside_mdat() {
        for width in [4, 8] {
            let mut payload = vec![0, 0, 0, 0, 0, 0, 0, 2];
            for offset in [32u64, 100] {
                if width == 4 {
                    payload.extend((offset as u32).to_be_bytes());
                } else {
                    payload.extend(offset.to_be_bytes());
                }
            }
            let table = atom(if width == 4 { b"stco" } else { b"co64" }, &payload);
            let mut index = atom(b"stbl", &table);
            let root = atoms(&index, 0, index.len()).unwrap()[0];
            patch_offsets(&mut index, root, 24, 200, 8, 500).unwrap();
            let value = if width == 4 {
                u32_at(&index, 24).unwrap() as u64
            } else {
                u64_at(&index, 24).unwrap()
            };
            assert_eq!(value, 508);
            assert!(patch_offsets(&mut index, root, 24, 200, 8, 500).is_err());
        }
    }
    #[test]
    fn reads_across_virtual_header_boundary_and_at_eof() {
        let path =
            std::env::temp_dir().join(format!("comtec-virtual-range-{}", std::process::id()));
        std::fs::write(&path, b"skippayload").unwrap();
        let t = Track {
            source: Arc::new(File::open(&path).unwrap()),
            header: Arc::new(b"index".to_vec()),
            mdat: 4,
            size: 12,
        };
        assert_eq!(t.read(3, 6).unwrap(), b"expayl");
        assert_eq!(t.read(10, 2).unwrap(), b"ad");
        assert!(t.read(11, 2).is_err());
        assert!(t.read(0, MAX_RANGE + 1).is_err());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    #[ignore = "requires explicitly selected real recordings"]
    fn real_recordings_use_small_indexes_and_unchanged_source_bytes() {
        let root = std::path::PathBuf::from(
            std::env::var("COMTEC_TEST_ROOT").expect("set COMTEC_TEST_ROOT"),
        );
        for suffix in [
            "20260915_002/000_023859_A.mp4",
            "20260915_004/000_025643_A.mp4",
            "20260915_002/015_025359_A.mp4",
        ] {
            let path = root.join(suffix);
            let before = std::fs::metadata(&path).unwrap();
            let begin = std::time::Instant::now();
            let tracks = Tracks::open(&path).unwrap();
            assert!(tracks.duration > 6. && tracks.duration < 61.);
            for (camera, t) in tracks.cameras.iter().enumerate() {
                assert!(t.header.len() < 256 * 1024);
                let top = atoms(&t.header, 0, t.header.len()).unwrap();
                let moov = top.iter().find(|a| a.kind == *b"moov").unwrap();
                let traks: Vec<_> = atoms(&t.header, moov.body, moov.end)
                    .unwrap()
                    .into_iter()
                    .filter(|a| a.kind == *b"trak")
                    .collect();
                assert_eq!(traks.len(), if camera == 0 { 2 } else { 1 });
                for trak in traks {
                    let mdia = child(&t.header, trak, b"mdia").unwrap();
                    let minf = child(&t.header, mdia, b"minf").unwrap();
                    let stbl = child(&t.header, minf, b"stbl").unwrap();
                    let table = child(&t.header, stbl, b"stco").unwrap();
                    let count = u32_at(&t.header, table.body + 4).unwrap() as usize;
                    for i in [0, count / 2, count - 1] {
                        let position = u32_at(&t.header, table.body + 8 + i * 4).unwrap() as u64;
                        let original = t.mdat + position - t.header.len() as u64;
                        assert_eq!(
                            t.read(position, 32).unwrap(),
                            read(&t.source, original, 32).unwrap()
                        );
                    }
                }
            }
            assert_eq!(
                before.modified().unwrap(),
                std::fs::metadata(&path).unwrap().modified().unwrap()
            );
            println!(
                "{suffix}: index opened in {:?}, {} index bytes per camera",
                begin.elapsed(),
                tracks.cameras[0].header.len()
            );
        }
    }
}
