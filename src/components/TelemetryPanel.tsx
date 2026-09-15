import { memo, useMemo, useState, lazy, Suspense } from "react";
import { X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      className="telemetry"
      id="telemetry-panel"
      aria-label="Speed, GPS route and acceleration"
    >
      <div
        className={`telemetry-body ${!showMap || !showMotion ? "single-panel" : ""}`}
      >
        {showMap && (
          <div className="map-section">
            <header>
              <MapPin size={13} />
              <span>Map</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close map"
                onClick={onCloseMap}
              >
                <X />
              </Button>
            </header>
            <Suspense
              fallback={<div className="map-loading">Loading map…</div>}
            >
              <RouteMap samples={data.samples} sample={sample} />
            </Suspense>
          </div>
        )}
        {showMotion && (
          <div className="graph-panel">
            <div className="graph-heading">
              <span>ACCELERATION</span>
              <select
                id="sensor-mode"
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
                aria-label="Close acceleration"
                onClick={onCloseMotion}
              >
                <X />
              </Button>
            </div>
            <div className="axis-values">
              {axes.map((a, i) => (
                <label key={a.axis} style={{ color: a.color }}>
                  <input
                    type="checkbox"
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
                  <b id={`g-${a.axis.toLowerCase()}`}>
                    {sample
                      ? `${(raw ? sample.acceleration[i] : sample.acceleration[i] - data.samples[Math.max(0, index - 1)].acceleration[i]).toFixed(2)} ${raw ? "g" : "Δg"}`
                      : "—"}
                  </b>
                </label>
              ))}
            </div>
            <svg
              id="sensor-graph"
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
              <small className="sensor-note">
                {data.message ?? "No sensor data"}
              </small>
            )}
          </div>
        )}
      </div>
    </section>
  );
});
