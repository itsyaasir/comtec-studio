import type { Recording } from "../library-model";
export type { Recording };
export type Layout =
  "all" | "front" | "split" | "panorama" | "round" | "cabin" | "rear";
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
