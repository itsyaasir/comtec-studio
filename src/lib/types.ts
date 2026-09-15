import type { Recording } from "../library-model";
export type { Recording };
/** What the layout switcher offers. */
export type Layout = "all" | "split" | "panorama" | "round";

/**
 * What the stage can actually render. The three solo views are reachable only
 * by clicking a camera (App sets `expanded`), never from the switcher — the
 * switcher entries for them were redundant with click-to-expand.
 */
export type StageLayout = Layout | "front" | "cabin" | "rear";
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
export interface Playback {
  duration: number;
  start: number;
  mainPath: string;
  rearPath: string;
}
export const formatTime = (t: number) => {
  const s = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};
export const recordingTime = (name: string) => {
  const m = name.match(/^\d+_(\d{2})(\d{2})(\d{2})_/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : name;
};
