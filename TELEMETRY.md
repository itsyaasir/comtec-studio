# COMTEC telemetry and camera verification

## Local data format

This implementation reads the user's original files, not the vendor's software. The tail of the tested HDR361 recordings contains a fixed-width `CSODAT010001` record block ending in `CSOEND`. The parser reads at most the last 512 KiB, chooses the last block marker, validates its version and sequence numbers, and parses at most 3,000 79-byte records after the 34-byte header.

Each record includes two copies of its sequence number, a GPS validity indicator, latitude/longitude in degrees and decimal minutes, hemisphere letters, integer km/h, a local camera timestamp, and three signed acceleration values. The sample interval observed in these fixtures is 100 ms. Missing GPS fix means unavailable location and speed; acceleration remains usable.

| Record offsets | Field |
| --- | --- |
| 0–3, 52–55 | Sequential sample number, starting at 1 |
| 5 | GPS fix (`A` valid, `V` unavailable in tested files) |
| 6–15 | Latitude and N/S hemisphere |
| 16–26 | Longitude and E/W hemisphere |
| 27–30 | Recorded speed, km/h |
| 31–42 | YYMMDDhhmmss camera timestamp |
| 57–61, 62–66, 67–71 | Signed X/Y/Z readings, scaled by 1,000 |
| 78 | Record terminator `R` |

The three sensor readings include gravity. Their scale is consistent with approximately 1 g while stationary in the garage. The UI provides raw g and consecutive-sample changes in Δg. The latter resembles the reference's acceleration-change display, but the vendor's exact smoothing and calibration are not claimed or reproduced. The reference recording `20260913_002/013_162121_G.mp4` reports 49 km/h initially and 46 km/h near 16:21:34, matching the supplied screenshot at that timestamp.

The unit fixtures use invented coordinates and values. Real-file tests keep footage and extracted locations outside Git. The parser fails with an unavailable/error message for unsupported telemetry instead of guessing another vendor's format.

## Camera orientation

The lower hemisphere of the original circular image contains inverted occupants. The cabin camera uses an independent 180° roll. The shared CPU-generated camera basis is consumed directly by the shader, and a regression test verifies that screen-up samples toward the occupants' heads in the lower image hemisphere. The front remains unrotated. Both views retain independent drag/zoom controls and reset to their presets.

## Maps

OpenStreetMap was selected by the user, who explicitly approved live tile requests for the recorded areas. Only visible tiles are requested; the app sends an identifying User-Agent and retains tiles for seven days. It does not bulk-download map regions. Without tiles, the recorded route and moving position remain visible. Map tiles are cached separately from prepared video, under the app's `map-tiles` cache folder.

## References

- [COMTEC HDR361 viewer manual](https://www.e-comtec.co.jp/0_recorder/viewer/HDRviewer361W/viewer.html): camera modes, colored axes, recording types, speed and GPS display.
- [COMTEC recording naming conventions](https://www.e-comtec.co.jp/manual/drive_recorder/hdr360gw_gs.pdf): A driving, G impact, M manual, P parking, S parking impact.
- [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/): attribution, identifying requests, caching, no offline bulk download.
