import { memo, useMemo, useState, lazy, Suspense } from "react";
import { X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Telemetry } from "@/lib/types";
const RouteMap = lazy(() =>
  import("./RouteMap").then((module) => ({ default: module.RouteMap })),
);
const axes = [
  { name: "Forward / back", axis: "X", color: "#4b9359" },
  { name: "Left / right", axis: "Y", color: "#cd625d" },
  { name: "Up / down", axis: "Z", color: "#8c73c8" },
];
interface Props {
  data: Telemetry;
  time: number;
  duration: number;
  seek: (time: number) => void;
  showMap: boolean;
  showMotion: boolean;
  onCloseMap: () => void;
  onCloseMotion: () => void;
}
export const TelemetryPanel = memo(function TelemetryPanel({
  data,
  time,
  duration,
  seek,
  showMap,
  showMotion,
  onCloseMap,
  onCloseMotion,
}: Props) {
  const [raw, setRaw] = useState(false),
    [enabled, setEnabled] = useState([true, true, true]);
  const index = Math.max(
      0,
      Math.min(data.samples.length - 1, Math.floor(time * 10)),
    ),
    sample = data.samples[index];
  const traces = useMemo(() => {
    const values = data.samples.map((s, i) =>
      s.acceleration.map((v, a) =>
        raw ? v : v - data.samples[Math.max(0, i - 1)].acceleration[a],
      ),
    );
    const scale = Math.max(
      raw ? 1.5 : 0.25,
      ...values.flatMap((v) => v.map(Math.abs)),
    );
    return axes.map((_, a) =>
      values
        .map(
          (v, i) =>
            `${(data.samples[i].time / Math.max(1, duration)) * 1000},${25 + a * 40 - (v[a] / scale) * 16}`,
        )
        .join(" "),
    );
  }, [data.samples, duration, raw]);
  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-[8px] border border-border"
      id="telemetry-panel"
      aria-label="Speed, GPS route and acceleration"
    >
      <div
        className={cn(
          "grid min-h-0 flex-1",
          !showMap || !showMotion
            ? "grid-cols-[minmax(0,1fr)]"
            : "grid-cols-[minmax(180px,34%)_minmax(0,1fr)]",
        )}
      >
        {showMap && (
          <div
            className={cn(
              "relative min-h-0",
              showMotion && "border-r border-border",
            )}
          >
            <header className="pointer-events-none absolute top-8 right-8 left-8 z-[500] flex items-center justify-start gap-5 rounded-[4px] text-[9px]">
              <MapPin size={13} className="hidden" />
              <span className="rounded-[4px] bg-background px-7 py-4">Map</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="pointer-events-auto ml-auto h-24 w-24 bg-background hover:bg-background dark:hover:bg-background"
                aria-label="Close map"
                onClick={onCloseMap}
              >
                <X className="size-13" />
              </Button>
            </header>
            <Suspense
              fallback={
                <div className="grid h-full place-content-center text-[11px] text-muted-foreground">
                  Loading map…
                </div>
              }
            >
              <RouteMap samples={data.samples} sample={sample} />
            </Suspense>
          </div>
        )}
        {showMotion && (
          <div
            data-testid="graph-panel"
            className="flex min-h-0 flex-col px-13 pt-10 pb-7"
          >
            <div className="flex shrink-0 items-center gap-10 text-[9px]">
              <span className="tracking-[0.06em] text-muted-foreground">
                ACCELERATION
              </span>
              <select
                id="sensor-mode"
                className="ml-auto max-w-190 rounded-[4px] border border-border bg-secondary px-3 py-2 text-[9px]"
                aria-label="G-sensor display"
                value={raw ? "raw" : "change"}
                onChange={(e) => setRaw(e.target.value === "raw")}
              >
                <option value="change">Acceleration change (Δg)</option>
                <option value="raw">Raw acceleration (g)</option>
              </select>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-24 w-24"
                aria-label="Close acceleration"
                onClick={onCloseMotion}
              >
                <X className="size-13" />
              </Button>
            </div>
            <div className="flex shrink-0 gap-14 pt-9 pb-2 [@media(max-width:1180px)]:gap-8">
              {axes.map((a, i) => (
                <label
                  key={a.axis}
                  className="grid grid-cols-[10px_auto] items-center gap-x-5 text-[9px] [@media(max-width:1180px)]:text-[8px]"
                  style={{ color: a.color }}
                >
                  <input
                    type="checkbox"
                    className="size-9 accent-current"
                    checked={enabled[i]}
                    onChange={(e) =>
                      setEnabled((v) =>
                        v.map((value, j) =>
                          i === j ? e.target.checked : value,
                        ),
                      )
                    }
                  />
                  {a.name}
                  <b
                    id={`g-${a.axis.toLowerCase()}`}
                    className="col-start-2 text-[11px] font-medium tabular-nums"
                  >
                    {sample
                      ? `${(raw ? sample.acceleration[i] : sample.acceleration[i] - data.samples[Math.max(0, index - 1)].acceleration[i]).toFixed(2)} ${raw ? "g" : "Δg"}`
                      : "—"}
                  </b>
                </label>
              ))}
            </div>
            <svg
              id="sensor-graph"
              className="min-h-25 w-full flex-1 cursor-crosshair"
              viewBox="0 0 1000 130"
              preserveAspectRatio="none"
              role="img"
              tabIndex={0}
              aria-label="G-sensor graph. Click to seek, or use arrow keys."
              onClick={(e) => {
                const b = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - b.left) / b.width) * duration);
              }}
              onKeyDown={(e) => {
                if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
                  e.preventDefault();
                  e.stopPropagation();
                  seek(time + (e.key === "ArrowLeft" ? -1 : 1));
                }
              }}
            >
              {axes.map((a, i) => (
                <g key={a.axis}>
                  <line
                    x1="0"
                    x2="1000"
                    y1={25 + i * 40}
                    y2={25 + i * 40}
                    stroke="currentColor"
                    opacity=".12"
                  />
                  {enabled[i] && (
                    <polyline
                      points={traces[i]}
                      fill="none"
                      stroke={a.color}
                      strokeWidth="1.1"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              ))}
              <line
                x1={(time / Math.max(1, duration)) * 1000}
                x2={(time / Math.max(1, duration)) * 1000}
                y1="0"
                y2="130"
                stroke="#cc9145"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {!data.samples.length && (
              <small className="mt-3 text-[8px] text-muted-foreground">
                {data.message ?? "No sensor data"}
              </small>
            )}
          </div>
        )}
      </div>
    </section>
  );
});
