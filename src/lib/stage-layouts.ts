import type { StageLayout } from "@/lib/types";

export type CameraId = "front" | "cabin" | "rear";

export interface StageArrangement {
  /** Grid template utilities applied to the stage element. */
  grid: string;
  /** Extra utilities for the front panel (it spans two rows in "all"). */
  front: string;
  /**
   * Cameras hidden in this arrangement.
   *
   * These MUST render as Tailwind's `hidden` (display:none), never as a
   * conditional mount. Pan, zoom and roll live in the Lens instance created by
   * the useEffect in CameraView; unmounting destroys its WebGL context, so
   * all -> cabin -> all would silently reset the front camera's framing.
   */
  hide: readonly CameraId[];
}

const SOLO = "grid-cols-1 grid-rows-1";

/*
 * Annotated rather than `satisfies`: under `satisfies` the empty `hide` of
 * "all" infers as never[], so hide.includes(camera) fails to compile at the
 * call site. The annotation still makes an unhandled layout a compile error,
 * which is the point of the record.
 */
export const STAGE_LAYOUTS: Record<StageLayout, StageArrangement> = {
  all: {
    grid: "grid-cols-[minmax(0,2fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
    front: "row-span-2",
    hide: [],
  },
  split: { grid: "grid-cols-2 grid-rows-1", front: "", hide: ["rear"] },
  // panorama and round are front-solo; they differ only in lens projection,
  // set in CameraView from the layout value.
  panorama: { grid: SOLO, front: "", hide: ["cabin", "rear"] },
  round: { grid: SOLO, front: "", hide: ["cabin", "rear"] },
  front: { grid: SOLO, front: "", hide: ["cabin", "rear"] },
  cabin: { grid: SOLO, front: "", hide: ["front", "rear"] },
  rear: { grid: SOLO, front: "", hide: ["front", "cabin"] },
};
