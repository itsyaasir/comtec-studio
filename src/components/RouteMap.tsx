import { memo, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Sample } from "@/lib/types";
interface Props {
  samples: Sample[];
  sample?: Sample;
}
export const RouteMap = memo(function RouteMap({ samples, sample }: Props) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    route = useRef<L.Polyline | null>(null),
    marker = useRef<L.CircleMarker | null>(null),
    tiles = useRef<L.GridLayer | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let active = true;
    const view = L.map(container.current, {
      attributionControl: true,
      zoomControl: true,
      preferCanvas: true,
    }).setView([0, 0], 2);
    view.attributionControl.setPrefix(false);
    view.zoomControl.setPosition("bottomright");
    class NativeTiles extends L.GridLayer {
      createTile(coords: L.Coords, done: L.DoneCallback) {
        const img = document.createElement("img");
        img.alt = "";
        invoke<string>("map_tile", { z: coords.z, x: coords.x, y: coords.y })
          .then((path) => {
            if (!active) return;
            img.onload = () => done(undefined, img);
            img.onerror = () => {
              if (active) setUnavailable(true);
              done(Error("Map image unavailable"), img);
            };
            img.src = convertFileSrc(path);
          })
          .catch(() => {
            if (active) setUnavailable(true);
            done(Error("Map unavailable"), img);
          });
        return img;
      }
    }
    tiles.current = new NativeTiles({
      minZoom: 2,
      maxZoom: 19,
      keepBuffer: 0,
      updateWhenIdle: true,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    });
    route.current = L.polyline([], { color: "#df9f49", weight: 3 }).addTo(view);
    marker.current = L.circleMarker([0, 0], {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#dc8c2d",
      fillOpacity: 1,
    });
    map.current = view;
    const resize = new ResizeObserver(() => view.invalidateSize());
    resize.observe(container.current);
    return () => {
      active = false;
      resize.disconnect();
      view.remove();
      map.current = null;
      route.current = null;
      marker.current = null;
      tiles.current = null;
    };
  }, []);
  useEffect(() => {
    const view = map.current,
      line = route.current,
      layer = tiles.current;
    if (!view || !line || !layer) return;
    const points = samples
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .map((s) => [s.latitude!, s.longitude!] as L.LatLngTuple);
    line.setLatLngs(points);
    if (points.length) {
      view.invalidateSize();
      view.fitBounds(line.getBounds(), {
        padding: [22, 22],
        maxZoom: 16,
        animate: false,
      });
      if (!view.hasLayer(layer)) layer.addTo(view);
    } else {
      view.removeLayer(layer);
    }
  }, [samples]);
  const latitude = sample?.latitude,
    longitude = sample?.longitude;
  useEffect(() => {
    const view = map.current,
      pin = marker.current;
    if (!view || !pin) return;
    if (latitude != null && longitude != null) {
      pin.setLatLng([latitude, longitude]);
      if (!view.hasLayer(pin)) pin.addTo(view);
    } else view.removeLayer(pin);
  }, [latitude, longitude]);
  const hasFix = samples.some(
    (s) => s.latitude !== null && s.longitude !== null,
  );
  return (
    <div className="relative h-full bg-secondary">
      <div
        ref={container}
        id="route-map"
        className="h-full focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:ring-inset focus-visible:outline-none [&_a]:focus-visible:ring-3 [&_a]:focus-visible:ring-ring/30 [&_a]:focus-visible:outline-none"
        aria-label="Recorded GPS route"
      />
      <div
        id="route-empty"
        className="absolute inset-0 z-[450] grid place-content-center bg-secondary text-center text-[11px] text-muted-foreground"
        hidden={hasFix}
      >
        {samples.length
          ? "No GPS fix in this recording"
          : "Your recorded route appears here"}
      </div>
      {unavailable && hasFix && (
        <span className="absolute right-8 bottom-20 left-8 z-[500] bg-background p-5 text-[9px]">
          Street map unavailable · Recorded route remains visible
        </span>
      )}
    </div>
  );
});
