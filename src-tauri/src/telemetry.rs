//! Read COMTEC CSODAT trailers without touching encoded video or the source file.
use serde::Serialize;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub time: f64,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub speed_kmh: Option<f64>,
    pub recorded_at: String,
    pub acceleration: [f64; 3],
}

#[derive(Debug, Serialize)]
pub struct Telemetry {
    pub samples: Vec<Sample>,
    pub message: Option<String>,
}

fn field(bytes: &[u8]) -> Option<f64> {
    std::str::from_utf8(bytes)
        .ok()?
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|n| n.is_finite())
}

fn coordinate(bytes: &[u8], hemisphere: u8, latitude: bool) -> Option<f64> {
    let value = field(bytes)?;
    let degrees = (value / 100.).floor();
    let minutes = value - degrees * 100.;
    let max = if latitude { 90. } else { 180. };
    if !(0.0..60.).contains(&minutes) || degrees > max {
        return None;
    }
    let sign = match (latitude, hemisphere) {
        (true, b'N') | (false, b'E') => 1.,
        (true, b'S') | (false, b'W') => -1.,
        _ => return None,
    };
    let result = degrees + minutes / 60.;
    (result <= max).then_some(sign * result)
}

fn parse(bytes: &[u8]) -> Result<Telemetry, String> {
    if !bytes.ends_with(b"CSOEND") {
        return Ok(Telemetry {
            samples: vec![],
            message: Some("No supported Comtec telemetry trailer was found.".into()),
        });
    }
    let Some(start) = bytes.windows(6).rposition(|b| b == b"CSODAT") else {
        return Ok(Telemetry {
            samples: vec![],
            message: Some("This recording has no supported GPS or G-sensor data.".into()),
        });
    };
    let data = &bytes[start..];
    if data.len() < 34 || &data[6..12] != b"010001" {
        return Err("Unsupported Comtec telemetry version.".into());
    }
    let mut samples = Vec::new();
    for (index, r) in data[34..].as_chunks::<79>().0.iter().take(3000).enumerate() {
        if r.iter().all(|b| *b == b' ') {
            break;
        }
        if r[78] != b'R'
            || r[4] != b' '
            || r[56] != b' '
            || field(&r[..4]) != Some((index + 1) as f64)
            || field(&r[52..56]) != Some((index + 1) as f64)
        {
            return Err(
                "The telemetry samples are incomplete or use an unsupported format.".into(),
            );
        }
        let acceleration = [field(&r[57..62]), field(&r[62..67]), field(&r[67..72])];
        if acceleration.iter().any(|v| v.is_none()) {
            return Err("Invalid G-sensor sample.".into());
        }
        let fix = r[5] == b'A';
        let latitude = if fix {
            coordinate(&r[6..15], r[15], true)
        } else {
            None
        };
        let longitude = if fix {
            coordinate(&r[16..26], r[26], false)
        } else {
            None
        };
        let speed = if latitude.is_some() && longitude.is_some() {
            field(&r[27..31]).filter(|v| *v >= 0. && *v < 1000.)
        } else {
            None
        };
        let date = std::str::from_utf8(&r[31..43]).map_err(|_| "Invalid recording timestamp")?;
        if !date.bytes().all(|b| b.is_ascii_digit()) {
            return Err("Invalid recording timestamp.".into());
        }
        samples.push(Sample {
            time: index as f64 / 10.,
            latitude,
            longitude,
            speed_kmh: speed,
            recorded_at: format!(
                "20{}-{}-{} {}:{}:{}",
                &date[..2],
                &date[2..4],
                &date[4..6],
                &date[6..8],
                &date[8..10],
                &date[10..12]
            ),
            acceleration: acceleration.map(|v| v.unwrap() / 1000.),
        });
    }
    let message = if samples.is_empty() {
        Some("No telemetry samples were recorded.".into())
    } else {
        None
    };
    Ok(Telemetry { samples, message })
}

pub fn read(path: &Path) -> Result<Telemetry, String> {
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let length = file
        .metadata()
        .map_err(|e| e.to_string())?
        .len()
        .min(512 * 1024);
    file.seek(SeekFrom::End(-(length as i64)))
        .map_err(|e| e.to_string())?;
    let mut bytes = vec![0; length as usize];
    file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    parse(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(fix: bool) -> Vec<u8> {
        let mut b = b"CSODAT010001053205320532N2C FHNN\x02X".to_vec();
        let r = format!(
            "0001 {}0119.0000S03649.0000E0049260913162121         0001 0000300800-0600NNN   R",
            if fix { "A" } else { "V" }
        );
        assert_eq!(r.len(), 79);
        b.extend_from_slice(r.as_bytes());
        b.extend_from_slice(b"CSOEND");
        b
    }
    #[test]
    fn reads_recorded_position_speed_and_sensor() {
        let t = parse(&fixture(true)).unwrap();
        let s = &t.samples[0];
        assert!((s.latitude.unwrap() + 1.3166666667).abs() < 1e-8);
        assert!((s.longitude.unwrap() - 36.8166666667).abs() < 1e-8);
        assert_eq!(s.speed_kmh, Some(49.));
        assert_eq!(s.acceleration, [0.003, 0.8, -0.6]);
        assert_eq!(s.recorded_at, "2026-09-13 16:21:21");
    }
    #[test]
    fn no_fix_never_reports_position_or_zero_speed() {
        let t = parse(&fixture(false)).unwrap();
        assert!(t.samples[0].latitude.is_none());
        assert!(t.samples[0].speed_kmh.is_none());
        assert_eq!(t.samples[0].acceleration[1], 0.8);
    }
    #[test]
    fn malformed_sequence_fails() {
        let mut b = fixture(true);
        b[34] = b'9';
        assert!(parse(&b).is_err());
    }
    #[test]
    fn invalid_coordinate_rejected() {
        assert!(coordinate(b"9160.0000", b'N', true).is_none());
        assert!(coordinate(b"3600.0000", b'S', false).is_none());
    }
    #[test]
    fn unrelated_trailer_is_unavailable() {
        assert!(parse(b"not telemetry").unwrap().samples.is_empty());
    }
    #[test]
    #[ignore = "requires the user's real fixtures"]
    fn real_telemetry() {
        let root = std::env::var("DASHREEL_TEST_ROOT").unwrap();
        for file in [
            "20260915_002/000_023859_A.mp4",
            "20260915_004/000_025643_A.mp4",
            "20260915_002/015_025359_A.mp4",
        ] {
            let t = read(&Path::new(&root).join(file)).unwrap();
            assert!(!t.samples.is_empty());
            assert!(t.samples.iter().all(|s| s
                .acceleration
                .iter()
                .all(|v| v.is_finite() && v.abs() < 20.)));
            println!(
                "{file}: {} telemetry samples, {} GPS fixes",
                t.samples.len(),
                t.samples.iter().filter(|s| s.latitude.is_some()).count()
            );
        }
    }
}
