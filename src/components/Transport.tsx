import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/types";
import type { usePlayback } from "@/hooks/use-playback";
export function Transport({
  player: p,
  adjacent,
}: {
  player: Omit<ReturnType<typeof usePlayback>, "source" | "rear">;
  adjacent: (delta: number) => void;
}) {
  return (
    <div className="playback">
      <div className="timeline">
        <span id="elapsed">{formatTime(p.time - (p.media?.start ?? 0))}</span>
        <input
          id="seek"
          aria-label="Playback position"
          type="range"
          min={p.media?.start ?? 0}
          max={p.media?.duration ?? 1}
          step="0.01"
          value={p.time}
          disabled={!p.media}
          onInput={(e) => p.jump(Number(e.currentTarget.value))}
        />
        <span id="duration">
          {formatTime((p.media?.duration ?? 0) - (p.media?.start ?? 0))}
        </span>
      </div>
      <div className="transport">
        <div className="transport-info">
          <span className="status-dot" data-playing={p.playing} />
          <span id="status-text" role="status">
            {p.status}
          </span>
        </div>
        <div className="transport-buttons">
          <Button
            id="previous"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous recording"
            onClick={() => adjacent(-1)}
          >
            <SkipBack />
          </Button>
          <Button
            id="back"
            variant="ghost"
            size="icon"
            aria-label="Back 5 seconds"
            onClick={() => p.jump(p.time - 5)}
          >
            <RotateCcw />
            <small>5</small>
          </Button>
          <Button
            id="play"
            size="icon-lg"
            className="play-button"
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
            aria-label="Forward 5 seconds"
            onClick={() => p.jump(p.time + 5)}
          >
            <RotateCw />
            <small>5</small>
          </Button>
          <Button
            id="next"
            variant="ghost"
            size="icon-sm"
            aria-label="Next recording"
            onClick={() => adjacent(1)}
          >
            <SkipForward />
          </Button>
          <select
            id="speed"
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
        <div className="audio">
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
