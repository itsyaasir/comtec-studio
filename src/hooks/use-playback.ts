import { useEffect, useRef, useState, useCallback } from "react";
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
  const session = useRef({
    generation: 0,
    intent: 0,
    wanted: false,
    starting: false,
    loading: false,
    media: undefined as Playback | undefined,
    abort: new AbortController(),
    disposed: false,
    retry: undefined as ReturnType<typeof setTimeout> | undefined,
  });
  const pause = useCallback(() => {
    const s = session.current;
    s.intent++;
    s.wanted = false;
    source.current?.pause();
    rear.current?.pause();
    setPlaying(false);
  }, []);
  const jump = useCallback((position: number) => {
    const m = session.current.media;
    if (!m || !source.current || !rear.current) return;
    const t = Math.max(m.start, Math.min(m.duration, position));
    source.current.currentTime = rear.current.currentTime = t;
    setTime(t);
  }, []);
  const resume = useCallback(
    async function resume() {
      const s = session.current,
        main = source.current,
        back = rear.current;
      if (
        !main ||
        !back ||
        !s.wanted ||
        !s.media ||
        s.starting ||
        s.loading ||
        (!main.paused && !back.paused)
      )
        return;
      s.starting = true;
      const generation = s.generation,
        intent = s.intent;
      try {
        if (
          Math.abs(main.currentTime - back.currentTime) > 0.1 &&
          !back.seeking
        )
          back.currentTime = main.currentTime;
        await Promise.all([main.play(), back.play()]);
        if (generation === s.generation && s.wanted) setStatus("Playing");
        if (generation === s.generation && !s.wanted) {
          main.pause();
          back.pause();
        }
      } catch (e) {
        if (
          generation === s.generation &&
          intent === s.intent &&
          s.wanted &&
          !(e instanceof DOMException && e.name === "AbortError")
        ) {
          pause();
          setError(String(e));
          setStatus("Playback interrupted");
        }
      } finally {
        s.starting = false;
        if (
          !s.disposed &&
          generation === s.generation &&
          s.wanted &&
          main.readyState >= 3 &&
          back.readyState >= 3 &&
          (main.paused || back.paused)
        )
          s.retry = setTimeout(() => {
            if (generation === s.generation && !s.disposed) void resume();
          }, 50);
      }
    },
    [pause],
  );
  const toggle = useCallback(async () => {
    const s = session.current;
    if (!s.media) return;
    if (s.wanted) {
      pause();
      setStatus("Paused");
      return;
    }
    if ((source.current?.currentTime ?? 0) >= s.media.duration - 0.08)
      jump(s.media.start);
    s.intent++;
    s.wanted = true;
    setPlaying(true);
    setStatus("Playing");
    await resume();
  }, [jump, pause, resume]);
  const reset = useCallback(() => {
    const s = session.current;
    s.generation++;
    clearTimeout(s.retry);
    s.abort.abort();
    s.abort = new AbortController();
    pause();
    s.media = undefined;
    s.loading = false;
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
  }, [pause]);
  const select = useCallback(
    async (clip: Recording) => {
      reset();
      const s = session.current,
        n = s.generation;
      setSelected(clip);
      s.loading = true;
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
        jump(result.start);
        setStatus("Ready");
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
          s.loading = false;
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
    const wait = () => {
      if (s.wanted) {
        main.pause();
        back.pause();
        setStatus("Buffering…");
      }
    };
    const canplay = () => {
      if (s.wanted && main.readyState >= 3 && back.readyState >= 3)
        void resume();
    };
    const fail = () => {
      if (s.media) {
        pause();
        setError(
          "Camera playback failed. Check the recording drive and select the clip to retry.",
        );
      }
    };
    const end = () => {
      pause();
      setStatus("End of recording");
    };
    for (const video of [main, back]) {
      video.addEventListener("waiting", wait);
      video.addEventListener("canplay", canplay);
      video.addEventListener("error", fail);
    }
    main.addEventListener("ended", end);
    const tick = (now: number) => {
      if (s.media) {
        if (s.wanted && main.currentTime >= s.media.duration - 0.04) {
          end();
          jump(s.media.duration);
        }
        if (
          s.wanted &&
          !main.paused &&
          !main.seeking &&
          !back.seeking &&
          Math.abs(main.currentTime - back.currentTime) > 0.1
        )
          back.currentTime = main.currentTime;
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
      clearTimeout(s.retry);
      s.generation++;
      s.abort.abort();
      s.wanted = false;
      main.pause();
      back.pause();
      cancelAnimationFrame(frame);
      for (const video of [main, back]) {
        video.removeEventListener("waiting", wait);
        video.removeEventListener("canplay", canplay);
        video.removeEventListener("error", fail);
      }
      main.removeEventListener("ended", end);
      void invoke("cancel").catch(() => {});
    };
  }, [jump, pause, resume]);
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
  };
}
