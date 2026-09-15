import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { RotateCcw, Rotate3D } from "lucide-react";
import { Lens } from "@/projection";
import { presets } from "@/camera-model";
import type { Layout } from "@/lib/types";
import { Button } from "@/components/ui/button";
interface Props {
  camera: "front" | "cabin";
  source: RefObject<HTMLVideoElement | null>;
  layout: Layout;
}
export const CameraView = memo(function CameraView({
  camera,
  source,
  layout,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    lens = useRef<Lens | null>(null);
  const [fov, setFov] = useState(presets[camera].fov),
    [error, setError] = useState("");
  useEffect(() => {
    if (!canvas.current || !source.current) return;
    let frame = 0;
    try {
      const renderer = new Lens(
        canvas.current,
        source.current,
        presets[camera],
        setFov,
        setError,
      );
      lens.current = renderer;
      const render = () => {
        renderer.render();
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
      return () => {
        cancelAnimationFrame(frame);
        renderer.destroy();
        lens.current = null;
      };
    } catch (e) {
      setError(String(e));
    }
  }, [camera, source]);
  useEffect(() => {
    if (lens.current) {
      lens.current.mode =
        camera === "front" && layout === "round"
          ? "round"
          : camera === "front" && layout === "panorama"
            ? "panorama"
            : "perspective";
      lens.current.render(true);
    }
  }, [camera, layout]);
  return (
    <article className={`camera ${camera}`}>
      <header>
        <span>
          {camera === "front" ? "Front camera" : "Cabin"}
          <small>
            {camera === "front"
              ? layout === "round"
                ? "Original 360°"
                : layout === "panorama"
                  ? "Panorama"
                  : "360° perspective"
              : "Interior view"}
          </small>
        </span>
        <div className="camera-actions">
          {camera === "cabin" && (
            <Button
              variant="ghost"
              size="icon-sm"
              id="cabin-rotate"
              aria-label="Rotate cabin 180 degrees"
              onClick={() => {
                if (lens.current) {
                  lens.current.roll = (lens.current.roll + 180) % 360;
                  lens.current.update();
                }
              }}
            >
              <Rotate3D />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            id={`${camera}-reset`}
            aria-label={`Reset ${camera} view`}
            onClick={() => lens.current?.reset()}
          >
            <RotateCcw />
          </Button>
        </div>
      </header>
      <div className="camera-image">
        <canvas
          id={camera}
          ref={canvas}
          tabIndex={0}
          aria-label={`${camera} camera. Drag to look, scroll to zoom, arrow keys to pan.`}
        />
        {error && <div className="camera-error">{error}</div>}
      </div>
      {camera === "front" && (
        <div className="lens-controls">
          <span>Drag to look around</span>
          <label>
            Zoom
            <input
              id="front-zoom"
              aria-label="Front field of view"
              type="range"
              min="35"
              max="130"
              value={fov}
              onInput={(e) => {
                if (lens.current) {
                  lens.current.fov = Number(e.currentTarget.value);
                  lens.current.update();
                }
              }}
            />
          </label>
        </div>
      )}
    </article>
  );
});
