import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { RotateCcw, Rotate3D, Maximize2, Minimize2 } from "lucide-react";
import { Lens } from "@/projection";
import { presets } from "@/camera-model";
import type { StageLayout } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CameraPanel } from "@/components/CameraPanel";
interface Props {
  camera: "front" | "cabin";
  source: RefObject<HTMLVideoElement | null>;
  layout: StageLayout;
  expanded: boolean;
  onExpand: (camera: "front" | "cabin" | "rear") => void;
  /** display:none, not an unmount — see CameraPanel. */
  hidden?: boolean;
  className?: string;
}
export const CameraView = memo(function CameraView({
  camera,
  source,
  layout,
  expanded,
  onExpand,
  hidden,
  className,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    lens = useRef<Lens | null>(null);
  const pointer = useRef({ x: 0, y: 0, moved: false, active: false });
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
  const actions = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-24 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white [&_svg:not([class*='size-'])]:size-12"
        aria-label={
          expanded ? "Restore camera layout" : `Expand ${camera} camera`
        }
        onClick={() => onExpand(camera)}
      >
        {expanded ? <Minimize2 /> : <Maximize2 />}
      </Button>
      {camera === "cabin" && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-24 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white [&_svg:not([class*='size-'])]:size-12"
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
        className="size-24 rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white [&_svg:not([class*='size-'])]:size-12"
        id={`${camera}-reset`}
        aria-label={`Reset ${camera} view`}
        onClick={() => lens.current?.reset()}
      >
        <RotateCcw />
      </Button>
    </>
  );
  return (
    <CameraPanel
      title={camera === "front" ? "Front camera" : "Cabin"}
      actions={actions}
      hidden={hidden}
      className={className}
      footer={
        camera === "front" && (
          <label className="flex items-center gap-7">
            Zoom
            <input
              id="front-zoom"
              aria-label="Front field of view"
              type="range"
              min="35"
              max="130"
              className="w-75 accent-primary"
              value={fov}
              onInput={(e) => {
                if (lens.current) {
                  lens.current.fov = Number(e.currentTarget.value);
                  lens.current.update();
                }
              }}
            />
          </label>
        )
      }
    >
      <canvas
        id={camera}
        ref={canvas}
        className="absolute inset-0 block h-full w-full cursor-grab touch-none object-contain active:cursor-grabbing"
        tabIndex={0}
        role="button"
        aria-label={`${camera} camera. Click or press Enter to expand. Drag to look, scroll to zoom.`}
        onPointerDown={(e) => {
          pointer.current = {
            x: e.clientX,
            y: e.clientY,
            moved: false,
            active: true,
          };
        }}
        onPointerMove={(e) => {
          if (!pointer.current.active) return;
          if (
            Math.hypot(
              e.clientX - pointer.current.x,
              e.clientY - pointer.current.y,
            ) > 5
          )
            pointer.current.moved = true;
        }}
        onPointerUp={() => {
          pointer.current.active = false;
        }}
        onPointerCancel={() => {
          pointer.current.active = false;
          pointer.current.moved = false;
        }}
        onClick={() => {
          const dragged = pointer.current.moved;
          pointer.current.moved = false;
          if (!dragged) onExpand(camera);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onExpand(camera);
          }
        }}
      />
      {error && (
        <div className="absolute inset-0 bg-zinc-900 p-30 text-red-300">
          {error}
        </div>
      )}
    </CameraPanel>
  );
});
