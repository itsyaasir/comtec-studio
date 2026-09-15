#!/usr/bin/env python3
"""Offline COMTEC viewer: originals are read-only; browser media is cached remuxes."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import hashlib
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
from urllib.parse import urlsplit
import webbrowser


APP = "comtec-local-viewer"
APP_DIR = Path(__file__).resolve().parent
FFMPEG = "/opt/homebrew/bin/ffmpeg"
FFPROBE = "/opt/homebrew/bin/ffprobe"
CACHE_VERSION = 1
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/renderer.js": ("renderer.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}
CLIP_ROUTE = re.compile(r"/api/clips/([0-9a-f]{32})(/prepare)?")
MEDIA_ROUTE = re.compile(r"/media/([0-9a-f]{32})/(main|rear)\.mp4")


class PreparationError(Exception):
    pass


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class Clip:
    id: str
    path: Path
    relative: str
    size: int
    mtime_ns: int

    def public(self):
        folder = str(Path(self.relative).parent)
        return {"id": self.id, "name": self.path.name,
                "folder": "" if folder == "." else folder, "size": self.size}


class Library:
    def __init__(self, root):
        self.root = root
        self.cache = Path.home() / "Library" / "Caches" / "COMTEC Viewer"
        self.cache.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = threading.RLock()
        self.worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="remux")
        self.clips = {}
        self.states = {}

    def discover(self):
        found = {}
        for directory, dirs, files in os.walk(self.root, followlinks=False):
            dirs[:] = sorted(d for d in dirs if not d.startswith(".")
                             and d.casefold() != "preview"
                             and not (Path(directory) / d).is_symlink())
            for name in files:
                if name.startswith(".") or Path(name).suffix.lower() != ".mp4":
                    continue
                candidate = Path(directory) / name
                try:
                    path = candidate.resolve(strict=True)
                    resolved_relative = path.relative_to(self.root)
                    if any(part.startswith(".") or part.casefold() == "preview"
                           for part in resolved_relative.parts) or not path.is_file():
                        continue
                    stat = path.stat()
                    relative = str(candidate.relative_to(self.root))
                    key = f"{path}\0{stat.st_size}\0{stat.st_mtime_ns}"
                    clip_id = hashlib.sha256(key.encode()).hexdigest()[:32]
                    found[clip_id] = Clip(clip_id, path, relative, stat.st_size,
                                          stat.st_mtime_ns)
                except (OSError, ValueError):
                    continue
        with self.lock:
            self.clips = found
        # COMTEC folder and file names encode recording order, unlike copy mtimes.
        return [clip.public() for clip in sorted(found.values(),
                                                key=lambda clip: clip.relative.casefold())]

    def unchanged(self, clip):
        try:
            path = clip.path.resolve(strict=True)
            path.relative_to(self.root)
            stat = path.stat()
            return path == clip.path and stat.st_size == clip.size and stat.st_mtime_ns == clip.mtime_ns
        except (OSError, ValueError):
            return False

    def cached(self, clip):
        directory = self.cache / clip.id
        try:
            meta = json.loads((directory / "ready.json").read_text())
            if not isinstance(meta, dict) or meta.get("version") != CACHE_VERSION or meta.get("id") != clip.id:
                return None
            duration = number(meta.get("duration"))
            if duration is None or duration <= 0:
                return None
            for camera in ("main", "rear"):
                path = directory / f"{camera}.mp4"
                size = path.stat().st_size
                if path.is_symlink() or size != meta["sizes"][camera] or size <= 0:
                    return None
            return {"state": "ready", "duration": duration,
                    "mainUrl": f"/media/{clip.id}/main.mp4",
                    "rearUrl": f"/media/{clip.id}/rear.mp4"}
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def status(self, clip_id):
        with self.lock:
            clip = self.clips.get(clip_id)
            if clip is None:
                return None
            state = self.states.get(clip_id)
            if state and state["state"] == "preparing":
                return dict(state)
            if not self.unchanged(clip):
                return {"state": "error", "error": "This recording changed or is unavailable. Refresh the recording list."}
            cached = self.cached(clip)
            if cached:
                return cached
            return dict(state) if state and state["state"] == "error" else {"state": "idle"}

    def prepare(self, clip_id):
        with self.lock:
            status = self.status(clip_id)
            if status is None or status["state"] in ("preparing", "ready"):
                return status
            clip = self.clips[clip_id]
            if not self.unchanged(clip):
                return status
            self.states[clip_id] = {"state": "preparing"}
            self.worker.submit(self._prepare, clip)
            return {"state": "preparing"}

    def probe(self, path):
        try:
            result = subprocess.run(
                [FFPROBE, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                timeout=45, check=False)
        except FileNotFoundError:
            raise PreparationError("ffprobe is missing. Install FFmpeg with Homebrew.") from None
        except subprocess.TimeoutExpired:
            raise PreparationError("Inspecting this recording timed out.") from None
        if result.returncode:
            raise PreparationError("The recording could not be inspected. It may be incomplete or damaged.")
        try:
            return json.loads(result.stdout)
        except (ValueError, UnicodeError):
            raise PreparationError("ffprobe returned unreadable recording information.") from None

    def video_times(self, probe):
        videos = [stream for stream in probe.get("streams", []) if stream.get("codec_type") == "video"]
        if not videos:
            raise PreparationError("This recording has no playable camera video.")
        times = []
        for stream in videos:
            if stream.get("codec_name") != "h264":
                raise PreparationError("Both camera tracks must use H.264 video.")
            start = number(stream.get("start_time"))
            if start is None:
                start = number(probe.get("format", {}).get("start_time")) or 0.0
            duration = number(stream.get("duration"))
            if duration is None:
                format_duration = number(probe.get("format", {}).get("duration"))
                format_start = number(probe.get("format", {}).get("start_time")) or 0.0
                if format_duration is not None:
                    duration = format_start + format_duration - start
            if duration is None or duration <= 0:
                raise PreparationError("A camera track has no usable duration.")
            times.append((start, duration))
        return times

    def remux(self, source, output, camera, epoch):
        # Both independent MP4s retain one common source clock. Empty edit lists
        # represent any camera start offset instead of shifting each track to zero.
        command = [FFMPEG, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
                   "-copyts", "-itsoffset", f"{-epoch:.9f}", "-i", str(source),
                   "-map", "0:v:0" if camera == "main" else "0:v:1"]
        command += ["-map", "0:a:0?"] if camera == "main" else ["-an"]
        command += ["-c", "copy", "-map_metadata", "-1", "-map_chapters", "-1",
                    "-avoid_negative_ts", "disabled", "-use_editlist", "1",
                    "-movflags", "+faststart", str(output)]
        try:
            result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.PIPE, timeout=300, check=False)
        except FileNotFoundError:
            raise PreparationError("ffmpeg is missing. Install FFmpeg with Homebrew.") from None
        except subprocess.TimeoutExpired:
            raise PreparationError("Preparing this recording timed out. You can try again.") from None
        if result.returncode or not output.is_file() or output.stat().st_size == 0:
            raise PreparationError(f"The {camera} camera could not be prepared. The recording may be incomplete or damaged.")

    def _prepare(self, clip):
        try:
            if not self.unchanged(clip):
                raise PreparationError("This recording changed. Refresh the recording list.")
            probe = self.probe(clip.path)
            videos = [s for s in probe.get("streams", []) if s.get("codec_type") == "video"]
            if len(videos) < 2:
                raise PreparationError("This recording has no rear-camera track. Select an original two-camera COMTEC recording.")
            times = self.video_times({**probe, "streams": videos[:2]})
            audio = next((s for s in probe.get("streams", []) if s.get("codec_type") == "audio"), None)
            if audio and audio.get("codec_name") != "aac":
                raise PreparationError("This recording's audio is not AAC and cannot be copied into browser playback.")
            epoch = min(start for start, _ in times)
            duration = min(start + length for start, length in times) - epoch
            if duration <= max(start for start, _ in times) - epoch:
                raise PreparationError("The two camera tracks have no overlapping playback time.")
            directory = self.cache / clip.id
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            with tempfile.TemporaryDirectory(prefix="preparing-", dir=directory) as temporary:
                staging = Path(temporary)
                for camera in ("main", "rear"):
                    output = staging / f"{camera}.mp4"
                    self.remux(clip.path, output, camera, epoch)
                    playable = self.video_times(self.probe(output))
                    if len(playable) != 1:
                        raise PreparationError("A prepared camera file is not playable.")
                    start, length = playable[0]
                    duration = min(duration, start + length)
                if duration <= 0 or not self.unchanged(clip):
                    raise PreparationError("This recording changed while preparing. Refresh the recording list.")
                metadata = {"version": CACHE_VERSION, "id": clip.id, "duration": duration,
                            "sizes": {camera: (staging / f"{camera}.mp4").stat().st_size
                                      for camera in ("main", "rear")}}
                marker = staging / "ready.json"
                marker.write_text(json.dumps(metadata), encoding="utf-8")
                # The marker is the commit point: unfinished or crashed jobs are
                # never ready, even if one of their media files reached the cache.
                (directory / "ready.json").unlink(missing_ok=True)
                for camera in ("main", "rear"):
                    os.replace(staging / f"{camera}.mp4", directory / f"{camera}.mp4")
                os.replace(marker, directory / "ready.json")
            with self.lock:
                self.states.pop(clip.id, None)
        except PreparationError as error:
            with self.lock:
                self.states[clip.id] = {"state": "error", "error": str(error)}
        except OSError:
            with self.lock:
                self.states[clip.id] = {"state": "error", "error": "The recording or playback cache could not be accessed. Check disk space and folder permissions, then try again."}
        except Exception:
            with self.lock:
                self.states[clip.id] = {"state": "error", "error": "The recording could not be prepared. Try again or choose another recording."}


class ViewerServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, library):
        self.library = library
        super().__init__(address, ViewerHandler)
        self.origin = f"http://127.0.0.1:{self.server_port}"


class ViewerHandler(BaseHTTPRequestHandler):
    server_version = "COMTECViewer"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, format, *args):
        pass

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        super().end_headers()

    def json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_error(self, code, message=None, explain=None):
        try:
            self.json_response(code, {"error": message or self.responses.get(code, ("Request failed",))[0]})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def authorized(self):
        expected_host = f"127.0.0.1:{self.server.server_port}"
        hosts = self.headers.get_all("Host", [])
        if hosts != [expected_host]:
            self.json_response(403, {"error": "Only this viewer's loopback address is allowed."})
            return False
        if self.headers.get("Sec-Fetch-Site", "none") not in ("same-origin", "none"):
            self.json_response(403, {"error": "Cross-site requests are not allowed."})
            return False
        origins = self.headers.get_all("Origin", [])
        if origins and origins != [self.server.origin]:
            self.json_response(403, {"error": "Cross-origin requests are not allowed."})
            return False
        referer = self.headers.get("Referer")
        if referer:
            parsed = urlsplit(referer)
            if f"{parsed.scheme}://{parsed.netloc}" != self.server.origin:
                self.json_response(403, {"error": "Cross-origin requests are not allowed."})
                return False
        return True

    def do_GET(self):
        self.dispatch()

    def do_HEAD(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_OPTIONS(self):
        self.dispatch()

    def dispatch(self):
        try:
            if not self.authorized():
                return
            path = urlsplit(self.path).path
            if not self.path.startswith("/") or self.path.startswith("//"):
                self.json_response(400, {"error": "Invalid request path."})
                return
            library = self.server.library
            if self.command == "POST":
                # Preparation has no request body; closing avoids ever treating
                # an unread payload as another request.
                self.close_connection = True
                match = CLIP_ROUTE.fullmatch(path)
                if not match or not match.group(2):
                    self.json_response(404, {"error": "Not found."})
                    return
                state = library.prepare(match.group(1))
                self.json_response(202 if state and state["state"] == "preparing" else 200 if state else 404,
                                   state or {"error": "Recording not found. Refresh the recording list."})
                return
            if self.command not in ("GET", "HEAD"):
                self.json_response(405, {"error": "Method not allowed."})
                return
            if path == "/api/health":
                self.json_response(200, {"app": APP})
            elif path == "/api/clips":
                self.json_response(200, {"root": str(library.root), "clips": library.discover()})
            elif path in STATIC:
                filename, content_type = STATIC[path]
                self.serve_file(APP_DIR / filename, content_type, media=False)
            else:
                clip_match = CLIP_ROUTE.fullmatch(path)
                media_match = MEDIA_ROUTE.fullmatch(path)
                if clip_match and not clip_match.group(2):
                    state = library.status(clip_match.group(1))
                    self.json_response(200 if state else 404, state or {"error": "Recording not found. Refresh the recording list."})
                elif media_match:
                    clip_id, camera = media_match.groups()
                    state = library.status(clip_id)
                    if not state or state["state"] != "ready":
                        self.json_response(404, {"error": "Recording playback is not ready."})
                    else:
                        self.serve_file(library.cache / clip_id / f"{camera}.mp4", "video/mp4", media=True)
                else:
                    self.json_response(404, {"error": "Not found."})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        except (ValueError, OverflowError):
            self.send_error(400, "Invalid request.")
        except OSError:
            self.send_error(500, "A local file could not be accessed.")

    def serve_file(self, path, content_type, media):
        try:
            file = path.open("rb")
        except (FileNotFoundError, IsADirectoryError):
            self.json_response(404, {"error": "File not found."})
            return
        with file:
            size = os.fstat(file.fileno()).st_size
            start, end = 0, size - 1
            partial = False
            range_header = self.headers.get("Range") if media else None
            # No validators are issued: an If-Range condition cannot match, so
            # serve the entire representation in that case.
            if range_header and not self.headers.get("If-Range"):
                match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
                valid = bool(match and (match.group(1) or match.group(2)) and size)
                if valid:
                    first, last = match.groups()
                    try:
                        if first:
                            start = int(first)
                            end = min(int(last), size - 1) if last else size - 1
                        else:
                            suffix = int(last)
                            valid = suffix > 0
                            start = max(0, size - suffix)
                        valid = valid and start < size and start <= end
                    except ValueError:
                        valid = False
                if not valid:
                    self.send_response(416)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Accept-Ranges", "bytes")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                partial = True
            length = end - start + 1
            self.send_response(206 if partial else 200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(length))
            self.send_header("Cache-Control", "private, max-age=31536000, immutable" if media else "no-cache")
            if media:
                self.send_header("Accept-Ranges", "bytes")
            if partial:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            if self.command == "HEAD":
                return
            file.seek(start)
            remaining = length
            while remaining:
                chunk = file.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)


def existing_viewer(url):
    connection = HTTPConnection("127.0.0.1", urlsplit(url).port, timeout=1.5)
    try:
        # No proxies or redirects: the readiness check never leaves loopback.
        connection.request("GET", "/api/health")
        response = connection.getresponse()
        return response.status == 200 and json.loads(response.read(4096)) == {"app": APP}
    except Exception:
        return False
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description="View local COMTEC recordings without modifying originals.")
    parser.add_argument("--root", type=Path, default=Path.home() / "Documents" / "Dashcam",
                        help="Recording folder (default: ~/Documents/Dashcam)")
    parser.add_argument("--port", type=int, default=47731, help="Loopback port (default: 47731)")
    parser.add_argument("--open", action="store_true", help="Open the browser; reuse an already-running viewer")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    url = f"http://127.0.0.1:{args.port}"
    if args.open and existing_viewer(url):
        webbrowser.open(url)
        return 0
    root = args.root.expanduser().resolve()
    if not root.is_dir():
        print(f"Recording folder does not exist: {root}\nUse --root to choose a recording folder.", file=sys.stderr)
        return 1
    library = None
    try:
        library = Library(root)
        library.discover()
        server = ViewerServer(("127.0.0.1", args.port), library)
    except OSError as error:
        if library:
            library.worker.shutdown(wait=False, cancel_futures=True)
        if args.open and existing_viewer(url):
            webbrowser.open(url)
            return 0
        print(f"Could not start COMTEC Viewer: {error.strerror or 'local folder or port unavailable'}.\n"
              f"Check folder permissions and whether port {args.port} is in use; choose another with --port.", file=sys.stderr)
        return 1
    print(f"COMTEC Viewer ready at {url}", flush=True)
    if args.open:
        timer = threading.Timer(0.25, webbrowser.open, args=(url,))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        library.worker.shutdown(wait=True, cancel_futures=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
