import { useEffect, useRef, useState, useCallback } from "react";
import { PlaybackSync } from "@/playback-sync";
import { invoke } from "@tauri-apps/api/core";
import type { Playback, Recording, Telemetry } from "@/lib/types";

function loaded(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", success);
      video.removeEventListener("error", failure);
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const success = () => finish(),
      failure = () => finish(Error("macOS could not play this recording.")),
      abort = () => finish(new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          Error(
            "The recording did not load. Check that its drive is connected.",
          ),
        ),
      20000,
    );
    video.addEventListener("loadeddata", success);
    video.addEventListener("error", failure);
    signal.addEventListener("abort", abort);
    if (signal.aborted) abort();
  });
}
export function usePlayback() {
  const source = useRef<HTMLVideoElement>(null),
    rear = useRef<HTMLVideoElement>(null);
  const [selected, setSelected] = useState<Recording>(),
    [media, setMedia] = useState<Playback>(),
    [loading, setLoading] = useState(false),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [status, setStatus] = useState("Ready"),
    [error, setError] = useState(""),
    [telemetry, setTelemetry] = useState<Telemetry>({
      samples: [],
      message: null,
    });
  const [rate, setRate] = useState(1),
    [volume, setVolume] = useState(0.7),
    [muted, setMuted] = useState(false);
  const sync = useRef<PlaybackSync | null>(null);
  const endedListeners = useRef(new Set<() => void>());
  const subscribeEnded = useCallback((listener: () => void) => {
    endedListeners.current.add(listener);
    return () => {
      endedListeners.current.delete(listener);
    };
  }, []);
  const session = useRef({
    generation: 0,
    media: undefined as Playback | undefined,
    abort: new AbortController(),
    disposed: false,
    ended: false,
  });
  const pause = useCallback(() => sync.current?.pause(), []);
  const jump = useCallback((position: number) => {
    const m = session.current.media;
    if (!m || !source.current || !rear.current) return;
    const t = Math.max(m.start, Math.min(m.duration, position));
    source.current.currentTime = rear.current.currentTime = t;
    setTime(t);
  }, []);
  const toggle = useCallback(() => {
    const s = session.current;
    if (!s.media) return;
    if ((source.current?.currentTime ?? 0) >= s.media.duration - 0.08) {
      s.ended = false;
      jump(s.media.start);
    }
    sync.current?.toggle();
  }, [jump]);
  const reset = useCallback(() => {
    const s = session.current;
    s.generation++;

    s.abort.abort();
    s.abort = new AbortController();
    sync.current?.setActive(false);
    s.media = undefined;
    s.ended = false;
    setLoading(false);
    setStatus("Ready");
    setMedia(undefined);
    setSelected(undefined);
    setTime(0);
    setError("");
    setTelemetry({ samples: [], message: null });
    for (const v of [source.current, rear.current]) {
      v?.removeAttribute("src");
      v?.load();
    }
  }, []);
  const select = useCallback(
    async (clip: Recording, autoplay = false) => {
      reset();
      const s = session.current,
        n = s.generation;
      setSelected(clip);

      setLoading(true);
      setStatus("Opening recording…");
      const data = invoke<Telemetry>("telemetry", { id: clip.id }).catch(
        (e) => ({ samples: [], message: String(e) }),
      );
      try {
        const result = await invoke<Playback>("open_recording", {
          id: clip.id,
        });
        if (n !== s.generation) return;
        const main = source.current!,
          back = rear.current!;
        const ready = [
          loaded(main, s.abort.signal),
          loaded(back, s.abort.signal),
        ];
        main.src = result.mainPath;
        back.src = result.rearPath;
        main.load();
        back.load();
        await Promise.all(ready);
        if (n !== s.generation) return;
        s.media = result;
        setMedia(result);
        sync.current?.setActive(true);
        jump(result.start);
        setStatus("Ready");
        if (autoplay) sync.current?.play();
        void data.then((t) => {
          if (n === s.generation) setTelemetry(t);
        });
      } catch (e) {
        if (n === s.generation) {
          s.abort.abort();
          setError(String(e));
          setStatus("Unable to open recording");
        }
      } finally {
        if (n === s.generation) {
          setLoading(false);
        }
      }
    },
    [jump, reset],
  );
  useEffect(() => {
    const main = source.current!,
      back = rear.current!,
      s = session.current;
    s.disposed = false;
    let frame = 0,
      last = 0;
    const controller = new PlaybackSync(main, back, setPlaying, (error) => {
      setError(String(error));
      setStatus("Playback interrupted");
    });
    sync.current = controller;
    const fail = () => {
      if (s.media) {
        controller.pause();
        setError("Camera playback failed. Select the recording to retry.");
      }
    };
    const end = () => {
      if (
        !s.media ||
        s.ended ||
        !controller.wanted ||
        main.currentTime < s.media.duration - 0.08
      )
        return;
      s.ended = true;
      controller.pause();
      setStatus("End of recording");
      for (const listener of endedListeners.current) listener();
    };
    main.addEventListener("ended", end);
    main.addEventListener("error", fail);
    back.addEventListener("error", fail);
    const tick = (now: number) => {
      if (s.media) {
        if (
          controller.wanted &&
          main.currentTime >= s.media.duration - 0.04 &&
          !main.seeking
        )
          end();
        void controller.reconcile();
        if (now - last > 90) {
          setTime(main.currentTime);
          last = now;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      s.disposed = true;
      s.generation++;
      s.abort.abort();
      controller.dispose();
      sync.current = null;
      cancelAnimationFrame(frame);
      main.removeEventListener("ended", end);
      main.removeEventListener("error", fail);
      back.removeEventListener("error", fail);
      void invoke("cancel").catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (source.current && rear.current)
      source.current.playbackRate = rear.current.playbackRate = rate;
  }, [rate, media]);
  useEffect(() => {
    if (source.current) {
      source.current.volume = volume;
      source.current.muted = muted;
    }
    if (rear.current) rear.current.muted = true;
  }, [volume, muted, media]);
  return {
    source,
    rear,
    selected,
    media,
    loading,
    playing,
    time,
    status,
    error,
    telemetry,
    rate,
    setRate,
    volume,
    setVolume,
    muted,
    setMuted,
    pause,
    jump,
    toggle,
    select,
    reset,
    subscribeEnded,
  };
}
