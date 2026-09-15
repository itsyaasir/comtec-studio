use std::{
    path::PathBuf,
    time::{Duration, SystemTime},
};
use tauri::Manager;
/// Fetch only visible OSM tiles. Cache for seven days; never prefetch offline areas.
#[tauri::command]
pub async fn map_tile(app: tauri::AppHandle, z: u32, x: u32, y: u32) -> Result<String, String> {
    if z > 19 || x >= (1u32 << z) || y >= (1u32 << z) {
        return Err("Invalid map tile".into());
    }
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("map-tiles");
    let path = directory.join(format!("{z}-{x}-{y}.png"));
    let check = path.clone();
    let cached = tauri::async_runtime::spawn_blocking(move || {
        std::fs::metadata(check)
            .ok()
            .and_then(|m| m.modified().ok())
            .is_some_and(|t| {
                SystemTime::now().duration_since(t).unwrap_or_default()
                    < Duration::from_secs(7 * 86400)
            })
    })
    .await
    .map_err(|e| e.to_string())?;
    if cached {
        return Ok(path.to_string_lossy().into());
    }
    let response = app
        .state::<reqwest::Client>()
        .get(format!("https://tile.openstreetmap.org/{z}/{x}/{y}.png"))
        .send()
        .await
        .map_err(|_| "Street map unavailable. Your recorded route is still visible.")?
        .error_for_status()
        .map_err(|_| "The map service is unavailable.")?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Invalid map image".into());
    }
    let output: PathBuf = path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
        std::fs::write(output, bytes).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(path.to_string_lossy().into())
}
