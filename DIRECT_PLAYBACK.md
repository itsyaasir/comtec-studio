# On-demand camera playback

Branch: `chore/on-demand-tracks`. Direct playback is the only playback implementation.

## Behavior

Opening a supported recording reads its MP4 index in Rust and creates two virtual MP4 views in memory. The main view exposes the first video track and its AAC audio. The rear view exposes the second video track. Both preserve the original movie timeline and encoded samples.

The `track://localhost/<recording-id>/<camera>.mp4` protocol is handled inside Tauri. It is not an HTTP server. It accepts only the currently opened recording ID and the two camera names. Each request checks that the discovered original is unchanged and still accessible.

## Virtual file layout

The reader scans top-level box headers using positional reads, skipping the large video and telemetry payloads. It retains `ftyp` and `moov` in memory. Within each movie index, unused tracks become same-sized `free` boxes. Selected tracks retain their sample descriptions, timing tables, keyframe tables, and other playback metadata. Their `stco` or `co64` offsets are adjusted for the virtual layout:

`ftyp + modified moov + original mdat`

No media data is copied to disk. Range requests that cross the index/data boundary combine in-memory index bytes with positional reads from the original. Each response is bounded to 2 MiB. The indexes are shared between requests; only one recording's pair is retained.

This version retains the interleaved `mdat` layout, so a requested range may include unused camera bytes between selected samples. That can cost extra reads, but does not create duplicate video files. The original volume must remain connected throughout playback.

## Compatibility boundary

Direct playback currently accepts one nonfragmented `mdat`, exactly two `avc1` camera tracks, optional one `mp4a` audio track, local data references, and unedited track timelines. Index allocation is bounded to 16 MiB per header and box traversal is bounded. Malformed offsets, edited tracks, fragmented recordings, unsupported codecs, and other unsupported layouts return explicit errors. Native player errors are shown directly; no conversion fallback exists.

FFmpeg, FFprobe, the remux fallback, helper build scripts, and playback-cache commands/UI have been removed. Old installed apps and their existing caches are not modified by this source cleanup. Standard MP4 box parsing and serialization use `mp4-atom`; source-range mapping remains application code.

## Validation

- Five new Rust tests cover byte ranges, malformed box sizes, 32/64-bit offset rewriting, reads across the virtual-header boundary, and real recording indexes/sample bytes.
- Garage, night, and short recording indexes opened in approximately 1–3 ms in one local run. Indexes occupied approximately 132 KiB, 132 KiB, and 11 KiB per camera. These are observations on this Mac with warm filesystem caches.
- The packaged WKWebView smoke suite passed 39 checks. All three recordings explicitly reported direct delivery, The post-crate run opened the three fixtures in 639 ms, 667 ms, and 1,495 ms respectively, including a deliberate 250 ms settling wait. Playback, pause, seek, 2× speed, ending/replay, selection races, maps, and camera modes passed.
- No original recordings are edited, exported, or bundled. The original source checksum checks remain part of acceptance.

## References

- [Tauri asynchronous custom protocols](https://docs.rs/tauri/latest/x86_64-apple-darwin/tauri/struct.Builder.html#method.register_asynchronous_uri_scheme_protocol)
- Tauri's installed `protocol/asset.rs` implementation informed bounded byte-range responses.

- [mp4-atom crate](https://docs.rs/mp4-atom/latest/mp4_atom/): low-level MP4 decoding and encoding. It does not provide a ready-made virtual-file playback protocol.
