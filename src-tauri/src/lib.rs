mod map;
mod media;
mod telemetry;
mod tracks;
use media::{Library, Media};
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Playback {
    duration: f64,
    start: f64,
    main_path: String,
    rear_path: String,
}
use std::{
    path::PathBuf,
    sync::{atomic::AtomicU64, Arc, Mutex},
};
use tauri::{Manager, State};
#[derive(Default)]
struct DirectPlayback(Mutex<Option<(String, tracks::Tracks)>>);

#[tauri::command]
async fn open_recording(
    app: tauri::AppHandle,
    state: State<'_, Arc<Media>>,
    id: String,
) -> Result<Playback, String> {
    let media = state.inner().clone();
    let ticket = media.cancel();
    tauri::async_runtime::spawn_blocking(move || {
        let _worker = media.worker.lock().unwrap();
        let clip = media
            .clips
            .lock()
            .unwrap()
            .get(&id)
            .cloned()
            .ok_or("Recording unavailable")?;
        media.unchanged(&clip)?;
        let tracks = tracks::Tracks::open(&clip.path)?;
        media.unchanged(&clip)?;
        if media.generation.load(std::sync::atomic::Ordering::SeqCst) != ticket {
            return Err("Opening cancelled".into());
        }
        let playback = Playback {
            duration: tracks.duration,
            start: 0.0,
            main_path: format!("track://localhost/{id}/main.mp4?generation={ticket}"),
            rear_path: format!("track://localhost/{id}/rear.mp4?generation={ticket}"),
        };
        *app.state::<DirectPlayback>().0.lock().unwrap() = Some((id, tracks));
        Ok(playback)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn track_response(
    app: &tauri::AppHandle,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    use tauri::http::{Response, StatusCode};
    let error = |status| Response::builder().status(status).body(Vec::new()).unwrap();
    if request.method() != "GET" && request.method() != "HEAD" {
        return error(StatusCode::METHOD_NOT_ALLOWED);
    }
    if request.uri().host() != Some("localhost") {
        return error(StatusCode::FORBIDDEN);
    }
    let Some((id, camera)) = request
        .uri()
        .path()
        .strip_prefix('/')
        .and_then(|v| v.split_once('/'))
    else {
        return error(StatusCode::NOT_FOUND);
    };
    let index = match camera {
        "main.mp4" => 0,
        "rear.mp4" => 1,
        _ => return error(StatusCode::NOT_FOUND),
    };
    let state = app.state::<DirectPlayback>();
    let track = {
        let active = state.0.lock().unwrap();
        match active.as_ref() {
            Some((active_id, tracks)) if active_id == id => tracks.cameras[index].clone(),
            _ => return error(StatusCode::NOT_FOUND),
        }
    };
    let media = app.state::<Arc<Media>>();
    let clip = media.clips.lock().unwrap().get(id).cloned();
    if !clip.is_some_and(|clip| media.unchanged(&clip).is_ok()) {
        return error(StatusCode::GONE);
    }
    let header = request.headers().get("Range");
    let range = match header.map(|h| h.to_str()).transpose() {
        Ok(value) => tracks::range(value, track.size),
        Err(_) => Err("Invalid range".into()),
    };
    let Ok((start, end)) = range else {
        return Response::builder()
            .status(416)
            .header("Content-Range", format!("bytes */{}", track.size))
            .body(Vec::new())
            .unwrap();
    };
    let body = if request.method() == "HEAD" {
        Vec::new()
    } else {
        match track.read(start, end - start + 1) {
            Ok(b) => b,
            Err(_) => return error(StatusCode::GONE),
        }
    };
    let partial = header.is_some() || end + 1 < track.size;
    let mut response = Response::builder()
        .status(if partial { 206 } else { 200 })
        .header("Content-Type", "video/mp4")
        .header("Accept-Ranges", "bytes")
        .header("Access-Control-Allow-Origin", "tauri://localhost")
        .header("Cache-Control", "no-store")
        .header("Content-Length", end - start + 1);
    if partial {
        response = response.header(
            "Content-Range",
            format!("bytes {start}-{end}/{}", track.size),
        );
    }
    response.body(body).unwrap()
}
#[tauri::command]
async fn library(
    app: tauri::AppHandle,
    state: State<'_, Arc<Media>>,
    choose: bool,
) -> Result<Option<Library>, String> {
    let media = state.inner().clone();
    let root = if choose {
        let picked = rfd::AsyncFileDialog::new()
            .set_title("Open Comtec recordings")
            .pick_folder()
            .await;
        match picked {
            Some(folder) => folder.path().to_path_buf(),
            None => return Ok(None),
        }
    } else {
        media.root.lock().unwrap().clone()
    };
    media.cancel();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _lock = media.worker.lock().unwrap();
        media.discover(root)
    })
    .await
    .map_err(|e| e.to_string())??;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("Dashreel");
    }
    Ok(Some(result))
}
#[tauri::command]
async fn telemetry(
    state: State<'_, Arc<Media>>,
    id: String,
) -> Result<telemetry::Telemetry, String> {
    let media = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let clip = media
            .clips
            .lock()
            .unwrap()
            .get(&id)
            .cloned()
            .ok_or("Recording unavailable")?;
        media.unchanged(&clip)?;
        telemetry::read(&clip.path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel(state: State<'_, Arc<Media>>) {
    state.cancel();
}
#[cfg(debug_assertions)]
#[tauri::command]
fn test_report(app: tauri::AppHandle, report: String) -> Result<(), String> {
    if std::env::var_os("DASHREEL_SMOKE_TEST").is_none() {
        return Err("Test mode is disabled".into());
    }
    std::fs::write(
        app.path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("native-smoke.json"),
        report,
    )
    .map_err(|e| e.to_string())
}
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(DirectPlayback::default())
        .register_asynchronous_uri_scheme_protocol("track", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(track_response(&app, request))
            });
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<Arc<Media>>().cancel();
            }
        });
    #[cfg(debug_assertions)]
    let builder = builder
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
                && std::env::var_os("DASHREEL_SMOKE_TEST").is_some()
            {
                let _ = webview
                    .window()
                    .set_title("Dashreel — automated playback checks");
                let _ = webview.eval(include_str!("../../tests/native-smoke.js"));
            }
        })
        .invoke_handler(tauri::generate_handler![
            library,
            open_recording,
            cancel,
            telemetry,
            map::map_tile,
            test_report
        ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        library,
        open_recording,
        cancel,
        telemetry,
        map::map_tile
    ]);
    builder
        .setup(|app| {
            app.manage(
                reqwest::Client::builder()
                    .user_agent("Dashreel/0.1 (personal macOS recording viewer)")
                    .timeout(std::time::Duration::from_secs(12))
                    .build()?,
            );
            let config = app.path().app_config_dir()?.join("recording-folder");
            #[cfg(debug_assertions)]
            let config = if std::env::var_os("DASHREEL_SMOKE_TEST").is_some() {
                app.path().app_config_dir()?.join("smoke-recording-folder")
            } else {
                config
            };
            let root = std::fs::read_to_string(&config)
                .map(PathBuf::from)
                .unwrap_or(app.path().document_dir()?.join("Dashcam"));
            #[cfg(debug_assertions)]
            let root = if std::env::var_os("DASHREEL_SMOKE_TEST").is_some() {
                std::env::var("DASHREEL_TEST_ROOT")
                    .map(PathBuf::from)
                    .unwrap_or(root)
            } else {
                root
            };

            app.manage(Arc::new(Media {
                config,
                root: Mutex::new(root),
                clips: Mutex::new(Default::default()),
                generation: AtomicU64::new(0),
                worker: Mutex::new(()),
            }));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Unable to launch Dashreel")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                app.state::<Arc<Media>>().cancel();
            }
        });
}
