import { memo, useMemo, useState, lazy, Suspense } from "react";
import { Activity, MapPin, Navigation } from "lucide-react";
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
}
export const TelemetryPanel = memo(function TelemetryPanel({
  data,
  time,
  duration,
  seek,
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
      <div className="telemetry-summary">
        <div className="speed-readout">
          <Navigation size={15} />
          <strong id="car-speed">
            {sample?.speedKmh == null ? "—" : Math.round(sample.speedKmh)}
          </strong>
          <span>km/h</span>
        </div>
        <div className="recorded-at">
          <b>{sample?.recordedAt ?? "Recorded telemetry"}</b>
          <span id="gps-state">
            {sample
              ? sample.latitude === null
                ? "GPS unavailable"
                : "GPS fix · Recorded position"
              : "Select a recording to view its journey"}
          </span>
        </div>
        <span className="telemetry-caption">
          <Activity size={14} />
          Motion & location
        </span>
      </div>
      <div className="telemetry-body">
        <div className="map-section">
          <header>
            <MapPin size={13} />
            <span>Recorded route</span>
          </header>
          <Suspense fallback={<div className="map-loading">Loading map…</div>}>
            <RouteMap samples={data.samples} sample={sample} />
          </Suspense>
        </div>
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
            <small>Click to seek</small>
          </div>
          <div className="axis-values">
            {axes.map((a, i) => (
              <label key={a.axis} style={{ color: a.color }}>
                <input
                  type="checkbox"
                  checked={enabled[i]}
                  onChange={(e) =>
                    setEnabled((v) =>
                      v.map((value, j) => (i === j ? e.target.checked : value)),
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
          <small className="sensor-note">
            {data.samples.length
              ? "10 Hz · Δg shows the change between consecutive samples"
              : (data.message ?? "No sensor data loaded")}
          </small>
        </div>
      </div>
    </section>
  );
});
