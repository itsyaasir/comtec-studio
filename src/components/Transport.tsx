import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Map,
  Activity,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/types";
import type { usePlayback } from "@/hooks/use-playback";
export function Transport({
  player: p,
  adjacent,
  showMap,
  showMotion,
  onShowMap,
  onShowMotion,
}: {
  player: Omit<ReturnType<typeof usePlayback>, "source" | "rear">;
  adjacent: (delta: number) => void;
  showMap: boolean;
  showMotion: boolean;
  onShowMap: () => void;
  onShowMotion: () => void;
}) {
  const sample =
    p.telemetry.samples[
      Math.min(
        p.telemetry.samples.length - 1,
        Math.max(0, Math.floor(p.time * 10)),
      )
    ];
  return (
    <div className="shrink-0 px-20 pt-9 pb-5">
      <div className="flex items-center gap-10">
        <span
          id="elapsed"
          className="min-w-32 text-[10px] text-muted-foreground tabular-nums"
        >
          {formatTime(p.time - (p.media?.start ?? 0))}
        </span>
        <input
          id="seek"
          className="h-12 min-w-0 flex-1 cursor-pointer accent-primary focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
          aria-label="Playback position"
          type="range"
          min={p.media?.start ?? 0}
          max={p.media?.duration ?? 1}
          step="0.01"
          value={p.time}
          disabled={!p.media}
          onInput={(e) => p.jump(Number(e.currentTarget.value))}
        />
        <span
          id="duration"
          className="min-w-32 text-[10px] text-muted-foreground tabular-nums"
        >
          {formatTime((p.media?.duration ?? 0) - (p.media?.start ?? 0))}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(90px,1fr)] items-center pt-8 pb-4">
        <div className="flex min-w-0 flex-nowrap items-center gap-6 pr-12 text-[10px] text-muted-foreground">
          <div className="flex shrink-0 items-center gap-12">
            <div className="flex items-baseline gap-5 whitespace-nowrap text-foreground">
              <Navigation
                size={16}
                className="mr-4 self-center text-muted-foreground"
              />
              <strong
                id="car-speed"
                className="text-[23px] leading-none font-[550] tracking-[-0.05em] tabular-nums"
              >
                {sample?.speedKmh == null ? "—" : Math.round(sample.speedKmh)}
              </strong>
              <span className="text-[10px] text-muted-foreground">km/h</span>
            </div>
            <time
              className="flex flex-col justify-center gap-3 border-l border-border pl-12 text-[10px] leading-none whitespace-nowrap text-muted-foreground tabular-nums"
              aria-label={sample?.recordedAt ?? "Recording time unavailable"}
            >
              <span>{sample?.recordedAt?.split(" ")[0] ?? "—"}</span>
              <strong className="text-[12px] font-medium text-foreground">
                {sample?.recordedAt?.split(" ")[1] ?? "—"}
              </strong>
            </time>
          </div>
          <span id="status-text" className="sr-only" role="status">
            {p.status}
          </span>
        </div>
        <div className="flex items-center gap-6 max-[1180px]:gap-2">
          <Button
            id="previous"
            variant="ghost"
            size="icon-sm"
            className="relative size-40 [&_svg:not([class*='size-'])]:size-19"
            aria-label="Previous recording"
            onClick={() => adjacent(-1)}
          >
            <SkipBack />
          </Button>
          <Button
            id="back"
            variant="ghost"
            size="icon"
            className="relative size-40 [&_svg:not([class*='size-'])]:size-19"
            aria-label="Back 5 seconds"
            onClick={() => p.jump(p.time - 5)}
          >
            <RotateCcw />
            <small className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px]">
              5
            </small>
          </Button>
          <Button
            id="play"
            size="icon-lg"
            className="relative mx-5 size-50 rounded-full [&_svg:not([class*='size-'])]:size-22"
            aria-label={p.playing ? "Pause" : "Play"}
            disabled={!p.media}
            onClick={() => void p.toggle()}
          >
            {p.playing ? (
              <Pause fill="currentColor" />
            ) : (
              <Play fill="currentColor" />
            )}
          </Button>
          <Button
            id="forward"
            variant="ghost"
            size="icon"
            className="relative size-40 [&_svg:not([class*='size-'])]:size-19"
            aria-label="Forward 5 seconds"
            onClick={() => p.jump(p.time + 5)}
          >
            <RotateCw />
            <small className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px]">
              5
            </small>
          </Button>
          <Button
            id="next"
            variant="ghost"
            size="icon-sm"
            className="relative size-40 [&_svg:not([class*='size-'])]:size-19"
            aria-label="Next recording"
            onClick={() => adjacent(1)}
          >
            <SkipForward />
          </Button>
          <select
            id="speed"
            className="focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none ml-8 bg-transparent p-3 text-[11px] text-muted-foreground"
            aria-label="Playback speed"
            value={p.rate}
            onChange={(e) => p.setRate(Number(e.target.value))}
          >
            {[0.5, 1, 1.5, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-end gap-5">
          {!showMap && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Show map"
              onClick={onShowMap}
            >
              <Map />
            </Button>
          )}
          {!showMotion && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Show acceleration"
              onClick={onShowMotion}
            >
              <Activity />
            </Button>
          )}

          <Button
            id="mute"
            variant="ghost"
            size="icon-sm"
            aria-label={p.muted ? "Unmute audio" : "Mute audio"}
            onClick={() => p.setMuted(!p.muted)}
          >
            {p.muted || p.volume === 0 ? <VolumeX /> : <Volume2 />}
          </Button>
          <input
            id="volume"
            className="h-12 w-75 cursor-pointer accent-primary max-[1180px]:w-50 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step=".05"
            value={p.volume}
            onInput={(e) => {
              p.setVolume(Number(e.currentTarget.value));
              p.setMuted(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}
