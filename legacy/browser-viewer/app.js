import { FisheyeView } from '/renderer.js';

const byId = (id) => document.getElementById(id);
const main = byId('main-video');
const rear = byId('rear-video');
const videos = [main, rear];
const lifetime = new AbortController();
const ui = Object.fromEntries(['clip-count', 'filter', 'clip-list', 'library-status', 'source-root', 'clip-name', 'clip-folder', 'prep-status', 'retry', 'stage', 'stage-message', 'stage-message-text', 'elapsed', 'duration', 'seek', 'play', 'previous', 'next', 'back', 'forward', 'speed', 'mute', 'volume', 'fullscreen', 'refresh'].map((id) => [id, byId(id)]));
const defaults = { front: { yaw: 0, pitch: 70, fov: 100 }, cabin: { yaw: 0, pitch: -45, fov: 110 } };
let clips = [];
let selected = null;
let selection = 0;
let clipRequest = null;
let libraryRequest = null;
let loaded = false;
let intendedPlaying = false;
let duration = 0;
let serverDuration = 0;
let playAttempt = null;
let views = [];
let retryAction = null;
let readyLabel = '';
let frame = 0;
let drawingFailed = false;

function listen(target, event, fn, signal = lifetime.signal) {
  target.addEventListener(event, fn, { signal });
}
function setStatus(message, error = false) {
  ui['prep-status'].textContent = message;
  ui['prep-status'].parentElement.classList.toggle('is-error', error);
}
function showMessage(message) {
  ui['stage-message-text'].textContent = message;
  ui['stage-message'].hidden = false;
}
function updateControls() {
  for (const key of ['play', 'back', 'forward', 'seek']) ui[key].disabled = !loaded;
  const index = clips.findIndex((clip) => clip.id === selected?.id);
  ui.previous.disabled = index <= 0;
  ui.next.disabled = index < 0 || index >= clips.length - 1;
  ui.play.textContent = intendedPlaying ? 'Pause' : 'Play';
  ui.play.setAttribute('aria-label', intendedPlaying ? 'Pause recording' : 'Play recording');
  for (const name of ['front', 'cabin']) {
    byId(`${name}-zoom`).disabled = !loaded || !views.length;
    byId(`${name}-reset`).disabled = !loaded || !views.length;
  }
}
function pauseBoth() {
  for (const video of videos) video.pause();
}
function fail(message, retry = () => selected && selectClip(selected)) {
  intendedPlaying = false;
  loaded = false;
  pauseBoth();
  setStatus(message, true);
  showMessage(message);
  retryAction = retry;
  ui.retry.hidden = false;
  updateControls();
}
function timeLabel(seconds) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
function updateTime() {
  const current = Math.min(main.currentTime || 0, duration);
  ui.elapsed.textContent = timeLabel(current);
  ui.duration.textContent = timeLabel(duration);
  ui.seek.max = String(duration);
  ui.seek.value = String(current);
  ui.seek.setAttribute('aria-valuetext', `${timeLabel(current)} of ${timeLabel(duration)}`);
}
function updateDuration() {
  const values = [serverDuration, ...videos.map((video) => video.duration)].filter((value) => Number.isFinite(value) && value > 0);
  duration = values.length ? Math.min(...values) : 0;
  updateTime();
}
function bothReady() {
  return videos.every((video) => video.readyState >= 3 && !video.seeking && !video.error);
}
function holdPlayback() {
  if (!loaded) return;
  pauseBoth();
  if (intendedPlaying) setStatus('Waiting for both cameras…');
}
function maybeResume() {
  if (!loaded || !intendedPlaying || !bothReady() || playAttempt) return;
  if (videos.every((video) => !video.paused)) return;
  const token = selection;
  const attempt = {};
  playAttempt = attempt;
  // Invoke both in the same user gesture; only the main track is audible.
  Promise.all(videos.map((video) => video.play())).then(() => {
    if (token !== selection) return;
    if (!intendedPlaying || !bothReady()) pauseBoth();
    else setStatus(readyLabel);
  }).catch((error) => {
    if (token !== selection || !intendedPlaying) return;
    if (error.name === 'AbortError') return;
    intendedPlaying = false;
    pauseBoth();
    setStatus(error.name === 'NotAllowedError' ? 'Playback was blocked by the browser. Press Play to try again.' : `Playback could not start: ${error.message}`, true);
    updateControls();
  }).finally(() => {
    if (playAttempt !== attempt) return;
    playAttempt = null;
    if (token === selection && loaded && intendedPlaying && bothReady() && videos.some((video) => video.paused)) maybeResume();
  });
}
function seekTo(seconds) {
  if (!loaded) return;
  const target = Math.max(0, Math.min(duration, seconds));
  pauseBoth();
  if (target >= duration) intendedPlaying = false;
  for (const video of videos) video.currentTime = target;
  updateTime();
  updateControls();
  drawViews();
  maybeResume();
}
function togglePlayback() {
  if (!loaded) return;
  intendedPlaying = !intendedPlaying;
  if (!intendedPlaying) {
    pauseBoth();
    setStatus(readyLabel);
  } else {
    if (main.currentTime >= duration - 0.04) seekTo(0);
    maybeResume();
    if (!bothReady()) setStatus('Waiting for both cameras…');
  }
  updateControls();
}
function drawViews() {
  if (!loaded || drawingFailed || main.readyState < 2) return;
  try {
    for (const view of views) view.draw();
  } catch (error) {
    drawingFailed = true;
    fail(`The camera view could not be drawn: ${error.message}`);
  }
}
function animate() {
  if (loaded) {
    if (!main.paused || main.seeking) {
      drawViews();
      updateTime();
    }
    if (intendedPlaying && main.currentTime >= duration - 0.025) {
      intendedPlaying = false;
      pauseBoth();
      setStatus('End of recording. Replay, or choose the next clip.');
      updateControls();
    } else if (intendedPlaying && !main.paused && !rear.paused && !rear.seeking && Math.abs(main.currentTime - rear.currentTime) > 0.12) {
      pauseBoth();
      rear.currentTime = main.currentTime;
      maybeResume();
    }
  }
  frame = requestAnimationFrame(animate);
}
function destroyViews() {
  for (const view of views) view.destroy();
  views = [];
}
function ensureViews() {
  if (drawingFailed) destroyViews();
  drawingFailed = false;
  if (views.length) return;
  try {
    for (const name of ['front', 'cabin']) {
      const zoom = byId(`${name}-zoom`);
      const view = new FisheyeView(byId(`${name}-canvas`), main, {
        ...defaults[name],
        onChange: ({ fov }) => { zoom.value = String(170 - fov); },
      });
      views.push(view);
    }
  } catch (error) {
    destroyViews();
    throw new Error(`Interactive views need WebGL. ${error.message} Try a current Safari or Chrome with hardware acceleration enabled.`);
  }
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { cache: 'no-store', ...options });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the local viewer. Keep its launcher open, then try again.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Local server returned ${response.status}.`);
  if (!data) throw new Error('The local server returned an unreadable response.');
  return data;
}
function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    function abort() { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); }
    signal.addEventListener('abort', abort, { once: true });
  });
}
function mediaError(video) {
  const camera = video === main ? 'Main' : 'Rear';
  if (video.error?.code === 3 || video.error?.code === 4) return `${camera} camera cannot be decoded by this browser. Try a current Safari or Chrome; the source recording is unchanged.`;
  return `${camera} camera could not be loaded from the local server. Try this recording again.`;
}
function waitForMedia(video, signal) {
  return new Promise((resolve, reject) => {
    const events = new AbortController();
    const finish = (error) => {
      clearTimeout(timer);
      events.abort();
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const ready = () => { if (video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) finish(); };
    const timer = setTimeout(() => finish(new Error('The recording is taking too long to load. Check that the local viewer is still running, then try again.')), 45000);
    for (const event of ['loadeddata', 'canplay', 'durationchange']) listen(video, event, ready, events.signal);
    listen(video, 'error', () => finish(new Error(mediaError(video))), events.signal);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    else ready();
  });
}
function attachMediaEvents(token, signal) {
  for (const video of videos) {
    const current = (fn) => () => { if (token === selection) fn(); };
    for (const event of ['waiting', 'seeking']) listen(video, event, current(holdPlayback), signal);
    for (const event of ['canplay', 'seeked']) listen(video, event, current(() => { drawViews(); maybeResume(); }), signal);
    listen(video, 'durationchange', current(updateDuration), signal);
    listen(video, 'error', current(() => { if (loaded) fail(mediaError(video)); }), signal);
    listen(video, 'ended', current(() => {
      intendedPlaying = false;
      pauseBoth();
      updateTime();
      setStatus('End of recording. Replay, or choose the next clip.');
      updateControls();
    }), signal);
  }
}
async function selectClip(clip) {
  const token = ++selection;
  clipRequest?.abort();
  clipRequest = new AbortController();
  const { signal } = clipRequest;
  intendedPlaying = false;
  loaded = false;
  playAttempt = null;
  pauseBoth();
  for (const video of videos) {
    video.removeAttribute('src');
    video.load();
  }
  selected = clip;
  duration = 0;
  serverDuration = 0;
  ui['clip-name'].textContent = clip.name;
  ui['clip-folder'].textContent = clip.folder || 'RECORDINGS';
  ui.retry.hidden = true;
  retryAction = null;
  setStatus('Checking local playback tracks…');
  showMessage('Opening your recording…');
  updateControls();
  updateTime();
  markSelection();
  try {
    ensureViews();
    const path = `/api/clips/${encodeURIComponent(clip.id)}`;
    let status = await api(`${path}/prepare`, { method: 'POST', signal });
    const cached = status.state === 'ready';
    while (status.state !== 'ready') {
      if (status.state === 'error') throw new Error(status.error || 'This recording could not be prepared.');
      if (!['idle', 'preparing'].includes(status.state)) throw new Error('The local server returned an unknown preparation state.');
      setStatus('First load: preparing lossless camera tracks. No re-encoding; originals stay untouched.');
      showMessage('Preparing this recording for your browser. This happens once per clip.');
      await delay(650, signal);
      status = await api(path, { signal });
    }
    if (token !== selection || signal.aborted) return;
    if (!status.mainUrl || !status.rearUrl) throw new Error('The recording is missing one of its camera tracks.');
    serverDuration = Number(status.duration) || 0;
    setStatus(cached ? 'Opening cached camera tracks…' : 'Lossless tracks prepared. Opening both cameras…');
    showMessage('Loading both camera views…');
    attachMediaEvents(token, signal);
    main.src = status.mainUrl;
    rear.src = status.rearUrl;
    rear.muted = true;
    for (const video of videos) {
      video.playbackRate = Number(ui.speed.value);
      video.load();
    }
    await Promise.all(videos.map((video) => waitForMedia(video, signal)));
    if (token !== selection || signal.aborted) return;
    updateDuration();
    if (!duration) throw new Error('This recording has no playable camera duration.');
    loaded = true;
    readyLabel = `${cached ? 'Cached tracks' : 'Lossless tracks ready'} · Both cameras synchronized`;
    ui['stage-message'].hidden = true;
    setStatus(`${readyLabel} · Paused`);
    updateControls();
    drawViews();
  } catch (error) {
    if (token !== selection || signal.aborted || error.name === 'AbortError') return;
    fail(error.message);
  }
}
function clipDate(clip) {
  const match = `${clip.folder} ${clip.name}`.match(/(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}
function markSelection() {
  for (const button of ui['clip-list'].querySelectorAll('button[data-clip-id]')) {
    const active = button.dataset.clipId === selected?.id;
    button.setAttribute('aria-current', String(active));
  }
}
function renderClips() {
  const query = ui.filter.value.trim().toLocaleLowerCase();
  const visible = clips.filter((clip) => `${clip.name} ${clip.folder}`.toLocaleLowerCase().includes(query));
  ui['clip-list'].replaceChildren();
  ui['clip-count'].textContent = String(clips.length);
  ui['library-status'].textContent = clips.length ? (visible.length ? `${visible.length} ${visible.length === 1 ? 'recording' : 'recordings'}${query ? ' found' : ' · oldest first'}` : 'No matching recordings. Try another filename or folder.') : 'No recordings found. Add original dashcam clips to the source folder, then refresh.';
  const groups = new Map();
  for (const clip of visible) {
    const date = clipDate(clip);
    const folder = clip.folder || 'Recordings';
    const groupName = date && !folder.includes(date) ? `${folder} / ${date}` : folder;
    if (!groups.has(groupName)) {
      const section = document.createElement('section');
      section.className = 'clip-group';
      const heading = document.createElement('h2');
      heading.textContent = groupName;
      section.append(heading);
      ui['clip-list'].append(section);
      groups.set(groupName, section);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clip-button';
    button.dataset.clipId = clip.id;
    const name = document.createElement('strong');
    name.textContent = clip.name;
    const detail = document.createElement('small');
    detail.textContent = `${Math.round(clip.size / (1024 * 1024))} MB · Original recording`;
    button.append(name, detail);
    groups.get(groupName).append(button);
  }
  markSelection();
}
async function refreshLibrary() {
  libraryRequest?.abort();
  libraryRequest = new AbortController();
  const { signal } = libraryRequest;
  ui.refresh.disabled = true;
  ui['library-status'].textContent = 'Reading your local folder…';
  try {
    const data = await api('/api/clips', { signal });
    if (signal.aborted) return;
    if (!Array.isArray(data.clips)) throw new Error('The local server did not return a recording list.');
    clips = data.clips;
    ui['source-root'].textContent = data.root;
    renderClips();
    updateControls();
    if (!selected && clips.length) selectClip(clips[0]);
    else if (!selected) {
      setStatus('Your recording folder is empty.');
      showMessage('Add original recordings to the source folder, then choose Refresh.');
      ui.retry.hidden = true;
    }
  } catch (error) {
    if (signal.aborted || error.name === 'AbortError') return;
    ui['library-status'].textContent = error.message;
    if (!loaded) fail(error.message, refreshLibrary);
  } finally {
    if (!signal.aborted) ui.refresh.disabled = false;
  }
}

listen(ui['clip-list'], 'click', (event) => {
  const button = event.target.closest('button[data-clip-id]');
  const clip = button && clips.find((item) => item.id === button.dataset.clipId);
  if (clip) selectClip(clip);
});
listen(ui.filter, 'input', renderClips);
listen(ui.refresh, 'click', refreshLibrary);
listen(ui.retry, 'click', () => retryAction?.());
listen(ui.play, 'click', togglePlayback);
listen(ui.back, 'click', () => seekTo(main.currentTime - 5));
listen(ui.forward, 'click', () => seekTo(main.currentTime + 5));
listen(ui.seek, 'input', () => seekTo(Number(ui.seek.value)));
for (const [id, offset] of [['previous', -1], ['next', 1]]) {
  listen(ui[id], 'click', () => {
    const index = clips.findIndex((clip) => clip.id === selected?.id);
    if (clips[index + offset]) selectClip(clips[index + offset]);
  });
}
listen(ui.speed, 'change', () => {
  for (const video of videos) video.playbackRate = Number(ui.speed.value);
});
function updateAudio() {
  const muted = main.muted || main.volume === 0;
  ui.mute.textContent = muted ? 'Unmute' : 'Mute';
  ui.mute.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
  ui.mute.setAttribute('aria-pressed', String(muted));
  ui.volume.value = String(main.volume);
}
listen(ui.volume, 'input', () => {
  main.volume = Number(ui.volume.value);
  main.muted = main.volume === 0;
  updateAudio();
});
listen(ui.mute, 'click', () => {
  if (main.volume === 0) { main.volume = 0.5; main.muted = false; }
  else main.muted = !main.muted;
  updateAudio();
});
for (const [index, name] of ['front', 'cabin'].entries()) {
  listen(byId(`${name}-zoom`), 'input', (event) => { views[index]?.setView({ fov: 170 - Number(event.target.value) }); drawViews(); });
  listen(byId(`${name}-reset`), 'click', () => { views[index]?.setView(defaults[name]); drawViews(); });
}
listen(document, 'keydown', (event) => {
  const target = event.target;
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || target.isContentEditable || target.closest('input, select, textarea, button, a')) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); seekTo(main.currentTime + (event.key === 'ArrowLeft' ? -5 : 5)); }
});
if (!ui.stage.requestFullscreen) ui.fullscreen.hidden = true;
listen(ui.fullscreen, 'click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await ui.stage.closest('.review').requestFullscreen();
  } catch (error) { setStatus(`Could not expand the views: ${error.message}`, true); }
});
listen(document, 'fullscreenchange', () => {
  ui.fullscreen.textContent = document.fullscreenElement ? 'Exit expanded view' : 'Expand views';
  drawViews();
});
listen(ui.stage, 'viewerror', (event) => {
  drawingFailed = true;
  fail(`Interactive camera view unavailable: ${event.detail || 'WebGL context lost.'}`);
});
listen(ui.stage, 'viewrestored', () => {
  if (selected && drawingFailed) setStatus('Graphics recovered. Choose Try again to reopen the recording.');
});
listen(window, 'pagehide', () => {
  selection++;
  intendedPlaying = false;
  pauseBoth();
  clipRequest?.abort();
  libraryRequest?.abort();
  cancelAnimationFrame(frame);
  destroyViews();
  lifetime.abort();
});
updateControls();
updateAudio();
frame = requestAnimationFrame(animate);
refreshLibrary();
