import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  createIcons,
  FolderOpen,
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Grid2X2,
  PanelLeftClose,
  Film,
  ChevronLeft,
  ChevronRight,
  Settings2,
  X,
  Check,
  HardDrive,
  CircleHelp,
} from "lucide";
import { Lens } from "./projection";
import { presets } from "./camera-model";
import { recordingKind, recordingCode, folderLabel } from "./library-model";
import { TelemetryPanel, type Telemetry } from "./telemetry";
import "./style.css";
interface Clip {
  id: string;
  name: string;
  folder: string;
  size: number;
}
interface Library {
  root: string;
  clips: Clip[];
}
interface Prepared {
  duration: number;
  start: number;
  mainPath: string;
  rearPath: string;
}
const icon = (name: string) => `<i data-lucide="${name}"></i>`;
const icons = () =>
  createIcons({
    icons: {
      FolderOpen,
      Search,
      Play,
      Pause,
      SkipBack,
      SkipForward,
      RotateCcw,
      Volume2,
      VolumeX,
      Maximize2,
      Grid2X2,
      PanelLeftClose,
      Film,
      ChevronLeft,
      ChevronRight,
      Settings2,
      X,
      Check,
      HardDrive,
      CircleHelp,
    },
    attrs: { "stroke-width": 1.7 },
  });
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
$("app").innerHTML = `
<header data-tauri-drag-region><div class="app-name" data-tauri-drag-region><b>COMTEC</b><span>STUDIO</span></div><span class="window-caption" data-tauri-drag-region>Recording workspace</span><button id="settings" aria-label="Settings">${icon("settings-2")}</button></header>
<div class="workspace"><aside id="sidebar"><div class="library-top"><h1>Recordings <span id="count">0</span></h1><button id="refresh" title="Refresh recordings" aria-label="Refresh recordings">${icon("rotate-ccw")}</button></div><button id="open" class="open-folder">${icon("folder-open")}Open recordings folder</button><label class="search">${icon("search")}<input id="search" type="search" placeholder="Search recordings" aria-label="Search recordings"></label><div class="filters" role="group" aria-label="Recording type"><button data-filter="all" aria-pressed="true">All clips</button><button data-filter="A" aria-pressed="false">Driving</button><button data-filter="P" aria-pressed="false">Parking</button><button data-filter="events" aria-pressed="false">Events</button></div><div class="library-browser"><div id="folders" class="folder-list" aria-label="Recording folders"></div><div class="recording-column"><div id="session-heading"></div><div id="list" class="clip-list" aria-label="Recordings"></div></div></div><div class="library-bottom">${icon("hard-drive")}<div><strong id="folder-name">No folder selected</strong><small id="library-status">Open a folder to get started</small></div></div></aside>
<main><div class="review-toolbar"><div class="title"><span id="clip-kind" class="eyebrow">YOUR RECORDING WORKSPACE</span><h2 id="clip-title">Every angle. One timeline.</h2></div><div class="view-actions"><div class="segmented" aria-label="Camera layout"><button data-layout="all" aria-pressed="true" title="All cameras">${icon("grid-2x2")}All views</button><button data-layout="front" aria-pressed="false">Front</button><button data-layout="split" aria-pressed="false">Split</button><button data-layout="panorama" aria-pressed="false">Panorama</button><button data-layout="round" aria-pressed="false">Round</button><button data-layout="cabin" aria-pressed="false">Cabin</button><button data-layout="rear" aria-pressed="false">Rear</button></div><button id="fullscreen" aria-label="Toggle fullscreen" title="Fullscreen (F)">${icon("maximize-2")}</button></div></div>
<section id="stage" class="stage" data-layout="all" aria-label="Camera views">
<article class="camera front"><div class="camera-label"><span><b>01</b> FRONT</span><span class="view-badge">360° perspective</span></div><canvas id="front" tabindex="0" aria-label="Front camera. Drag to look, scroll to zoom, arrow keys to pan."></canvas><div class="lens-tools"><span>Drag to look · Scroll to zoom</span><label>Zoom <input id="front-zoom" type="range" min="35" max="130" value="100" aria-label="Front field of view"></label><button id="front-reset" title="Reset front view" aria-label="Reset front view">${icon("rotate-ccw")}</button></div></article>
<article class="camera cabin"><div class="camera-label"><span><b>02</b> CABIN</span><button id="cabin-rotate" title="Rotate cabin 180°" aria-label="Rotate cabin 180 degrees">180°</button><button id="cabin-reset" title="Reset cabin view" aria-label="Reset cabin view">${icon("rotate-ccw")}</button></div><canvas id="cabin" tabindex="0" aria-label="Cabin camera. Drag to look and scroll to zoom."></canvas></article>
<article class="camera rear"><div class="camera-label"><span><b>03</b> REAR</span><span class="view-badge">Full HD</span></div><video id="rear" playsinline muted preload="auto" crossorigin="anonymous"></video></article>
<div id="empty" class="stage-empty">${icon("film")}<h3>A clearer view of your journey</h3><p>Select a recording to explore the front, cabin and rear cameras together.</p><span>Local playback · Original recordings stay untouched</span></div></section>
<section id="telemetry-panel" aria-label="Speed, GPS route and acceleration"></section>
<div class="playback"><div class="timeline"><span id="elapsed">00:00</span><input id="seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Playback position" disabled><span id="duration">00:00</span></div><div class="transport"><div class="transport-left"><button id="previous" aria-label="Previous recording" title="Previous recording">${icon("skip-back")}</button><button id="back" aria-label="Back 5 seconds" title="Back 5 seconds">${icon("chevron-left")}<small>5s</small></button><button id="play" class="play" aria-label="Play" title="Play / Pause (Space)" disabled>${icon("play")}</button><button id="forward" aria-label="Forward 5 seconds" title="Forward 5 seconds"><small>5s</small>${icon("chevron-right")}</button><button id="next" aria-label="Next recording" title="Next recording">${icon("skip-forward")}</button><span class="divider"></span><select id="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div><div class="audio"><button id="mute" aria-label="Mute audio">${icon("volume-2")}</button><input id="volume" type="range" min="0" max="1" step="0.05" value="0.7" aria-label="Volume"></div></div></div>
<footer><div id="status" role="status" aria-live="polite"><span class="dot"></span><span id="status-text">Ready to explore</span></div><span id="technical">COMTEC multi-camera playback</span></footer></main></div>
<dialog id="preferences"><div class="dialog-title"><h2>Workspace settings</h2><button id="close-settings" aria-label="Close settings">${icon("x")}</button></div><section><h3>Playback cache</h3><p>Prepared camera tracks make repeat playback faster. Clearing them does not affect your recordings.</p><div class="cache-row"><span id="cache-size">Calculating…</span><button id="clear-cache">Clear playback cache</button></div></section><section><h3>Keyboard shortcuts</h3><dl><dt>Play / pause</dt><dd>Space</dd><dt>Seek 5 seconds</dt><dd>← / →</dd><dt>Fullscreen</dt><dd>F</dd><dt>Pan a focused camera</dt><dd>Arrow keys</dd><dt>Zoom a focused camera</dt><dd>+ / −</dd></dl></section><p class="about">COMTEC Studio 0.1 · Independent viewer<br>Approximate 240° lens correction. Uses FFmpeg 8.0.1 under LGPL 2.1 or later; source, license and build instructions are included in the app bundle.</p></dialog>
<video id="source" playsinline preload="auto" crossorigin="anonymous" class="decoder"></video>`;
icons();
const source = $<HTMLVideoElement>("source"),
  rear = $<HTMLVideoElement>("rear"),
  seek = $<HTMLInputElement>("seek");
let clips: Clip[] = [],
  selected: Clip | undefined,
  current: Prepared | undefined,
  generation = 0,
  loading = false,
  wanted = false,
  starting = false,
  playIntent = 0,
  filter = "all",
  selectedFolder = "",
  loadAbort = new AbortController();
function status(message: string, error = false) {
  $("status-text").textContent = message;
  $("status").classList.toggle("error", error);
}
function overlay(title?: string, detail?: string) {
  $("empty").hidden = !title;
  if (title) {
    $("empty").innerHTML =
      `${icon("film")}<h3></h3><p></p><span>Original recordings stay untouched</span>`;
    $("empty").querySelector("h3")!.textContent = title;
    $("empty").querySelector("p")!.textContent = detail ?? "";
    icons();
  }
}
const front = new Lens(
  $<HTMLCanvasElement>("front"),
  source,
  presets.front,
  (fov) => {
    $<HTMLInputElement>("front-zoom").value = String(fov);
  },
  (m) => status(m || "Camera views restored", !!m),
);
const cabin = new Lens(
  $<HTMLCanvasElement>("cabin"),
  source,
  presets.cabin,
  () => {},
  (m) => status(m || "Camera views restored", !!m),
);
const telemetryPanel = new TelemetryPanel($("telemetry-panel"), (position) =>
  jump(position),
);
function time(t: number) {
  const s = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
function displayName(clip: Clip) {
  const match = clip.name.match(/^\d+_(\d{2})(\d{2})(\d{2})_/);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : clip.name;
}
function kind(clip: Clip) {
  return recordingKind(clip.name);
}
function filteredClips() {
  const query = $<HTMLInputElement>("search").value.toLowerCase();
  return clips.filter((c) => {
    const code = recordingCode(c.name);
    const matches =
      filter === "all" ||
      (filter === "events"
        ? ["G", "M", "S"].includes(code)
        : filter === "P"
          ? ["P", "S"].includes(code)
          : code === filter);
    return matches && (c.name + " " + c.folder).toLowerCase().includes(query);
  });
}
function drawList() {
  const visible = filteredClips(),
    groups = [...new Set(visible.map((c) => c.folder))];
  if (!groups.includes(selectedFolder)) selectedFolder = groups[0] ?? "";
  const folders = $("folders");
  folders.replaceChildren();
  for (const folder of groups) {
    const group = visible.filter((c) => c.folder === folder),
      label = folderLabel(folder),
      button = document.createElement("button");
    button.className = "folder";
    button.dataset.folder = folder;
    button.setAttribute("aria-current", String(selectedFolder === folder));
    button.innerHTML = "<strong></strong><span></span><small></small>";
    button.querySelector("strong")!.textContent = label.date;
    button.querySelector("span")!.textContent = label.session;
    button.querySelector("small")!.textContent =
      group.length +
      " clips · " +
      [...new Set(group.map((c) => recordingKind(c.name)))].join(", ");
    button.title = folder;
    button.onclick = () => {
      selectedFolder = folder;
      drawList();
    };
    folders.append(button);
  }
  const list = $("list");
  list.replaceChildren();
  const items = visible.filter((c) => c.folder === selectedFolder);
  $("session-heading").textContent = selectedFolder
    ? folderLabel(selectedFolder).session
    : "Recordings";
  for (const clip of items) {
    const button = document.createElement("button");
    button.className = "clip";
    button.setAttribute("aria-current", String(selected?.id === clip.id));
    button.dataset.id = clip.id;
    button.innerHTML =
      '<span class="clip-copy"><strong></strong><small></small></span><span class="clip-type"></span>';
    button.querySelector("strong")!.textContent = displayName(clip);
    button.querySelector("small")!.textContent = clip.name;
    button.querySelector(".clip-type")!.textContent = recordingCode(clip.name);
    button
      .querySelector(".clip-type")!
      .setAttribute("title", recordingKind(clip.name));
    button.onclick = () => void select(clip);
    list.append(button);
  }
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = clips.length
      ? "No matching recordings."
      : "Open your recordings folder to get started.";
    list.append(empty);
  }
  icons();
}
function updatePlay() {
  const active = wanted;
  $("play").innerHTML = icon(active ? "pause" : "play");
  $("play").setAttribute("aria-label", active ? "Pause" : "Play");
  icons();
}
function pause() {
  ++playIntent;
  wanted = false;
  source.pause();
  rear.pause();
  updatePlay();
}
function resetMedia() {
  pause();
  current = undefined;
  telemetryPanel.set(undefined);
  for (const video of [source, rear]) {
    video.removeAttribute("src");
    video.load();
  }
  $<HTMLButtonElement>("play").disabled = true;
  seek.disabled = true;
  seek.value = "0";
  $("elapsed").textContent = "00:00";
  $("duration").textContent = "00:00";
  front.render(true);
  cabin.render(true);
}
async function openLibrary(choose = false) {
  const n = ++generation;
  loadAbort.abort();
  resetMedia();
  loading = true;
  status(choose ? "Choose a recordings folder…" : "Reading recordings…");
  try {
    const library = await invoke<Library | null>("library", { choose });
    if (n !== generation) return;
    if (!library) {
      status("Folder selection cancelled");
      overlay(
        "Select a recording",
        "Your existing library is still available.",
      );
      return;
    }
    clips = library.clips;
    selectedFolder = "";
    selected = undefined;
    $("count").textContent = String(clips.length);
    $("folder-name").textContent =
      library.root.split("/").pop() || library.root;
    $("folder-name").title = library.root;
    $("library-status").textContent =
      `${clips.length} recordings · Read-only originals`;
    drawList();
    overlay(
      "A clearer view of your journey",
      "Select a recording to explore all three cameras.",
    );
    status(
      clips.length ? "Library ready" : "No MP4 recordings found in this folder",
    );
  } catch (e) {
    if (n === generation) {
      status(String(e), true);
      overlay(
        "Open your recordings folder",
        "Choose the folder containing your original COMTEC MP4 files.",
      );
    }
  } finally {
    if (n === generation) loading = false;
  }
}
function loaded(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        done(Error("The camera did not load. Select the recording to retry.")),
      20000,
    );
    const success = () => done();
    const failure = () =>
      done(Error("macOS could not play this camera track."));
    const abort = () => done(new DOMException("Cancelled", "AbortError"));
    function done(error?: Error) {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", success);
      video.removeEventListener("error", failure);
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    }
    video.addEventListener("loadeddata", success, { once: true });
    video.addEventListener("error", failure, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
async function select(clip: Clip) {
  const n = ++generation;
  loadAbort.abort();
  loadAbort = new AbortController();
  resetMedia();
  selected = clip;
  selectedFolder = clip.folder;
  loading = true;
  drawList();
  $("clip-title").textContent = clip.name;
  $("clip-kind").textContent = `${kind(clip)} recording / ${clip.folder}`;
  status("Preparing camera tracks…");
  overlay(
    "Preparing your recording",
    "Separating camera tracks without changing video quality.",
  );
  const telemetryPromise = invoke<Telemetry>("telemetry", {
    id: clip.id,
  }).catch((e) => ({ samples: [], message: String(e) }));
  try {
    const result = await invoke<Prepared>("prepare", { id: clip.id });
    if (n !== generation) return;
    const mainReady = loaded(source, loadAbort.signal),
      rearReady = loaded(rear, loadAbort.signal);
    source.src = convertFileSrc(result.mainPath);
    rear.src = convertFileSrc(result.rearPath);
    source.load();
    rear.load();
    await Promise.all([mainReady, rearReady]);
    if (n !== generation) return;
    current = result;
    void telemetryPromise.then((data) => {
      if (n === generation) telemetryPanel.set(data, result.duration);
    });
    source.currentTime = result.start;
    rear.currentTime = result.start;
    seek.min = String(result.start);
    seek.max = String(result.duration);
    seek.value = String(result.start);
    seek.disabled = false;
    $("duration").textContent = time(result.duration - result.start);
    $<HTMLButtonElement>("play").disabled = false;
    overlay();
    status("Ready · All cameras synchronized");
    $("technical").textContent =
      `${source.videoWidth} × ${source.videoHeight} 360° · ${rear.videoWidth} × ${rear.videoHeight} rear`;
    front.render(true);
    cabin.render(true);
  } catch (e) {
    if (n !== generation) return;
    status(String(e), true);
    overlay("Could not open this recording", String(e));
  } finally {
    if (n === generation) loading = false;
  }
}
async function resume() {
  if (
    !wanted ||
    !current ||
    starting ||
    loading ||
    (!source.paused && !rear.paused)
  )
    return;
  starting = true;
  const n = generation,
    intent = playIntent;
  try {
    if (Math.abs(rear.currentTime - source.currentTime) > 0.1 && !rear.seeking)
      rear.currentTime = source.currentTime;
    await Promise.all([source.play(), rear.play()]);
    if (n === generation && !wanted) {
      source.pause();
      rear.pause();
    }
  } catch (e) {
    if (
      n === generation &&
      intent === playIntent &&
      wanted &&
      !(e instanceof DOMException && e.name === "AbortError")
    ) {
      pause();
      status("Playback paused: " + String(e), true);
    }
  } finally {
    starting = false;
    if (
      n === generation &&
      wanted &&
      source.readyState >= 3 &&
      rear.readyState >= 3 &&
      (source.paused || rear.paused)
    )
      setTimeout(() => {
        if (n === generation && wanted) void resume();
      }, 50);
  }
}
async function toggle() {
  if (!current) return;
  if (wanted) {
    pause();
    status("Paused");
    return;
  }
  if (source.currentTime >= current.duration - 0.08) jump(current.start);
  ++playIntent;
  wanted = true;
  updatePlay();
  status("Playing · All cameras synchronized");
  await resume();
}
function jump(position: number) {
  if (!current) return;
  const t = Math.max(current.start, Math.min(current.duration, position));
  source.currentTime = t;
  rear.currentTime = t;
  seek.value = String(t);
  $("elapsed").textContent = time(t - current.start);
}
for (const video of [source, rear]) {
  video.addEventListener("waiting", () => {
    if (wanted) {
      source.pause();
      rear.pause();
      status("Buffering camera tracks…");
    }
  });
  video.addEventListener("canplay", () => {
    if (wanted && source.readyState >= 3 && rear.readyState >= 3) void resume();
  });
  video.addEventListener("error", () => {
    if (current) {
      pause();
      status("Camera playback failed. Select this recording to retry.", true);
    }
  });
}
source.addEventListener("ended", () => {
  pause();
  status("End of recording");
});
function frame() {
  if (current) {
    if (wanted && source.currentTime >= current.duration - 0.04) {
      pause();
      jump(current.duration);
      status("End of recording");
    }
    if (
      wanted &&
      !source.paused &&
      !source.seeking &&
      !rear.seeking &&
      Math.abs(source.currentTime - rear.currentTime) > 0.1
    )
      rear.currentTime = source.currentTime;
    seek.value = String(source.currentTime);
    $("elapsed").textContent = time(source.currentTime - current.start);
    telemetryPanel.update(source.currentTime);
  }
  front.render();
  cabin.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
$("open").onclick = () => void openLibrary(true);
$("refresh").onclick = () => void openLibrary();
$("search").oninput = drawList;
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-filter]",
))
  button.onclick = () => {
    filter = button.dataset.filter!;
    document
      .querySelectorAll("[data-filter]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    drawList();
  };
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-layout]",
))
  if (button.tagName === "BUTTON")
    button.onclick = () => {
      const layout = button.dataset.layout!;
      $("stage").dataset.layout = layout;
      front.mode =
        layout === "round"
          ? "round"
          : layout === "panorama"
            ? "panorama"
            : "perspective";
      front.render(true);
      cabin.render(true);
      document
        .querySelectorAll("button[data-layout]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    };
$("play").onclick = () => void toggle();
$("back").onclick = () => jump(source.currentTime - 5);
$("forward").onclick = () => jump(source.currentTime + 5);
seek.oninput = () => jump(Number(seek.value));
function adjacent(delta: number) {
  if (!selected) return;
  const items = filteredClips();
  const next = items[items.findIndex((c) => c.id === selected?.id) + delta];
  if (next) void select(next);
}
$("previous").onclick = () => adjacent(-1);
$("next").onclick = () => adjacent(1);
$<HTMLSelectElement>("speed").onchange = (e) => {
  source.playbackRate = rear.playbackRate = Number(
    (e.target as HTMLSelectElement).value,
  );
};
source.volume = 0.7;
rear.muted = true;
function volumeIcon() {
  $("mute").innerHTML = icon(
    source.muted || source.volume === 0 ? "volume-x" : "volume-2",
  );
  $("mute").setAttribute(
    "aria-label",
    source.muted ? "Unmute audio" : "Mute audio",
  );
  icons();
}
$("mute").onclick = () => {
  source.muted = !source.muted;
  volumeIcon();
};
$("volume").oninput = (e) => {
  source.volume = Number((e.target as HTMLInputElement).value);
  source.muted = false;
  volumeIcon();
};
$("front-reset").onclick = () => front.reset();
$("cabin-reset").onclick = () => cabin.reset();
$("cabin-rotate").onclick = () => {
  cabin.roll = (cabin.roll + 180) % 360;
  cabin.update();
};
$("front-zoom").oninput = (e) => {
  front.fov = Number((e.target as HTMLInputElement).value);
  front.update();
};
async function fullscreen() {
  const window = getCurrentWindow();
  await window.setFullscreen(!(await window.isFullscreen()));
}
$("fullscreen").onclick = () => void fullscreen();
const preferences = $<HTMLDialogElement>("preferences");
$("settings").onclick = async () => {
  preferences.showModal();
  $("cache-size").textContent =
    `${((await invoke<number>("cache_size")) / 1024 / 1024).toFixed(0)} MB used`;
};
$("close-settings").onclick = () => preferences.close();
$("clear-cache").onclick = async () => {
  ++generation;
  loadAbort.abort();
  resetMedia();
  const button = $<HTMLButtonElement>("clear-cache");
  button.disabled = true;
  try {
    await invoke("clear_cache");
    $("cache-size").textContent = "0 MB used";
    status("Playback cache cleared");
    overlay(
      "Playback cache cleared",
      "Select a recording to prepare its camera tracks again.",
    );
  } catch (e) {
    status(String(e), true);
  } finally {
    button.disabled = false;
  }
};
document.addEventListener("keydown", (e) => {
  if (
    preferences.open ||
    ["INPUT", "SELECT", "BUTTON", "CANVAS"].includes(
      (e.target as HTMLElement).tagName,
    )
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    void toggle();
  }
  if (e.key === "ArrowLeft") jump(source.currentTime - 5);
  if (e.key === "ArrowRight") jump(source.currentTime + 5);
  if (e.key.toLowerCase() === "f") void fullscreen();
});
void openLibrary();
