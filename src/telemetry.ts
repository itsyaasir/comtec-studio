import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
export interface Sample {
  time: number;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  recordedAt: string;
  acceleration: [number, number, number];
}
export interface Telemetry {
  samples: Sample[];
  message: string | null;
}
export class TelemetryPanel {
  private samples: Sample[] = [];
  private map: L.Map;
  private path: L.Polyline;
  private marker: L.CircleMarker;
  private tiles: L.GridLayer;
  private duration = 1;
  private index = -1;
  private error = "";
  private currentTime = 0;
  constructor(
    private root: HTMLElement,
    private seek: (time: number) => void,
  ) {
    root.innerHTML = `<div class="telemetry-top"><div class="speed-readout"><strong id="car-speed">—</strong><span>km/h</span></div><div class="recorded-time"><b id="recorded-time">No recording selected</b><span id="gps-state">Recorded GPS & G-sensor</span></div><div class="sensor-values"><label class="axis-x"><input type="checkbox" data-axis="0" checked>Forward / back <b id="g-x">—</b></label><label class="axis-y"><input type="checkbox" data-axis="1" checked>Left / right <b id="g-y">—</b></label><label class="axis-z"><input type="checkbox" data-axis="2" checked>Up / down <b id="g-z">—</b></label></div></div><div class="telemetry-body"><div class="route-panel"><div id="route-map" aria-label="Recorded GPS route"></div><div id="route-empty">Select a GPS recording to see its route.</div><span id="map-status" role="status"></span></div><div class="graph-panel"><div class="graph-heading"><span>G-SENSOR</span><select id="sensor-mode" aria-label="G-sensor display"><option value="change">Acceleration change (Δg)</option><option value="raw">Raw acceleration (g)</option></select><span>Click graph to seek</span></div><canvas id="sensor-graph" tabindex="0" aria-label="G-sensor graph. Left and right arrows seek one second."></canvas><span id="sensor-note">No telemetry loaded</span></div></div>`;
    this.map = L.map(root.querySelector("#route-map") as HTMLElement, {
      attributionControl: true,
      zoomControl: true,
      preferCanvas: true,
    }).setView([0, 0], 2);
    this.map.attributionControl.setPrefix(false);
    const Tile = L.GridLayer.extend({
      createTile: (coordinates: L.Coords, done: L.DoneCallback) => {
        const img = document.createElement("img");
        img.alt = "";
        invoke<string>("map_tile", {
          z: coordinates.z,
          x: coordinates.x,
          y: coordinates.y,
        })
          .then((path) => {
            img.onload = () => done(undefined, img);
            img.onerror = () => done(Error("Map image failed"), img);
            img.src = convertFileSrc(path);
            this.text("map-status", "");
          })
          .catch(() => {
            this.text(
              "map-status",
              "Street map unavailable · Route shown without map",
            );
            done(Error("Map unavailable"), img);
          });
        return img;
      },
    });
    this.tiles = new Tile();
    L.setOptions(this.tiles, {
      maxZoom: 19,
      minZoom: 2,
      keepBuffer: 0,
      updateWhenIdle: true,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    });
    this.path = L.polyline([], { color: "#eebd7e", weight: 3 }).addTo(this.map);
    this.marker = L.circleMarker([0, 0], {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#e39a54",
      fillOpacity: 1,
    });
    const graph = root.querySelector<HTMLCanvasElement>("#sensor-graph")!;
    graph.onclick = (e) =>
      seek(
        Math.max(
          0,
          Math.min(
            this.duration,
            ((e.clientX - graph.getBoundingClientRect().left) /
              graph.clientWidth) *
              this.duration,
          ),
        ),
      );
    graph.onkeydown = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        seek(this.currentTime + (e.key === "ArrowLeft" ? -1 : 1));
      }
    };
    root.querySelector("#sensor-mode")!.addEventListener("change", () => {
      this.index = -1;
      this.update(this.currentTime);
    });
    root
      .querySelectorAll("[data-axis]")
      .forEach((input) => input.addEventListener("change", () => this.draw()));
    new ResizeObserver(() => {
      this.map.invalidateSize();
      this.draw();
    }).observe(root);
  }
  private text(id: string, value: string) {
    this.root.querySelector("#" + id)!.textContent = value;
  }
  set(data: Telemetry | undefined, duration = 1) {
    this.samples = data?.samples ?? [];
    this.duration = duration;
    this.index = -1;
    this.error = data?.message ?? "";
    this.currentTime = 0;
    this.map.removeLayer(this.marker);
    this.path.setLatLngs([]);
    this.text("car-speed", "—");
    this.text("recorded-time", "No recording selected");
    this.text("gps-state", this.error || "No telemetry loaded");
    ["g-x", "g-y", "g-z"].forEach((id) => this.text(id, "—"));
    const route = this.samples
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .map((s) => [s.latitude!, s.longitude!] as L.LatLngTuple);
    const empty = this.root.querySelector<HTMLElement>("#route-empty")!;
    empty.hidden = route.length > 0;
    empty.textContent = this.samples.length
      ? "No GPS fix in this recording."
      : "Select a GPS recording to see its route.";
    if (route.length) {
      this.path.setLatLngs(route);
      this.map.invalidateSize();
      this.map.fitBounds(this.path.getBounds(), {
        padding: [20, 20],
        maxZoom: 16,
        animate: false,
      });
      if (!this.map.hasLayer(this.tiles)) this.tiles.addTo(this.map);
    } else {
      this.map.removeLayer(this.tiles);
    }
    this.text(
      "sensor-note",
      this.samples.length
        ? "Recorded at 10 Hz · Δg is the change between consecutive samples"
        : this.error || "No telemetry loaded",
    );
    this.update(0);
    this.draw();
  }
  update(time: number) {
    this.currentTime = time;
    const i = Math.max(
      0,
      Math.min(this.samples.length - 1, Math.floor(time * 10)),
    );
    if (i === this.index) return;
    this.index = i;
    const sample = this.samples[i];
    if (!sample) return;
    this.text(
      "car-speed",
      sample.speedKmh === null ? "—" : Math.round(sample.speedKmh).toString(),
    );
    this.text("recorded-time", sample.recordedAt);
    this.text(
      "gps-state",
      sample.latitude === null
        ? "GPS unavailable"
        : "GPS fix · Recorded position",
    );
    const raw =
      (this.root.querySelector("#sensor-mode") as HTMLSelectElement).value ===
      "raw";
    sample.acceleration.forEach((v, axis) =>
      this.text(
        ["g-x", "g-y", "g-z"][axis],
        `${(raw ? v : v - (this.samples[Math.max(0, i - 1)]?.acceleration[axis] ?? v)).toFixed(2)} ${raw ? "g" : "Δg"}`,
      ),
    );
    if (sample.latitude !== null && sample.longitude !== null) {
      this.marker.setLatLng([sample.latitude, sample.longitude]);
      if (!this.map.hasLayer(this.marker)) this.marker.addTo(this.map);
    } else {
      this.map.removeLayer(this.marker);
    }
    this.draw();
  }
  private draw() {
    const canvas = this.root.querySelector<HTMLCanvasElement>("#sensor-graph")!,
      w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    const c = canvas.getContext("2d")!;
    c.scale(devicePixelRatio, devicePixelRatio);
    const colors = ["#91cf85", "#f28782", "#ae9eeb"];
    const raw =
      (this.root.querySelector("#sensor-mode") as HTMLSelectElement).value ===
      "raw";
    const values = this.samples.map((s, i) =>
      s.acceleration.map((v, a) =>
        raw ? v : v - this.samples[Math.max(0, i - 1)].acceleration[a],
      ),
    );
    const enabled = [
      ...this.root.querySelectorAll<HTMLInputElement>("[data-axis]"),
    ].map((el) => el.checked);
    const scale = Math.max(
      raw ? 1.5 : 0.25,
      ...values.flatMap((v) => v.map(Math.abs)),
    );
    c.font = "9px -apple-system";
    for (let axis = 0; axis < 3; axis++) {
      const center = ((axis + 0.5) * h) / 3;
      c.strokeStyle = "#3b4048";
      c.beginPath();
      c.moveTo(0, center);
      c.lineTo(w, center);
      c.stroke();
      c.fillStyle = colors[axis];
      c.fillText(["X", "Y", "Z"][axis], 4, center - 4);
      if (!enabled[axis]) continue;
      c.strokeStyle = colors[axis];
      c.lineWidth = 1;
      c.beginPath();
      values.forEach((v, i) => {
        const x = (this.samples[i].time / this.duration) * w,
          y = center - (v[axis] / scale) * (h / 6 - 4);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.stroke();
    }
    c.strokeStyle = "#e5c192";
    c.beginPath();
    const cursor = (this.currentTime / this.duration) * w;
    c.moveTo(cursor, 0);
    c.lineTo(cursor, h);
    c.stroke();
  }
}
