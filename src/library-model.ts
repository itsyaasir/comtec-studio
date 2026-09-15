export interface Recording {
  id: string;
  name: string;
  folder: string;
  size: number;
}
export function recordingCode(name: string): string {
  return name.match(/_([A-Z])\.mp4$/i)?.[1].toUpperCase() ?? "?";
}
export function recordingKind(name: string): string {
  return (
    (
      {
        A: "Driving",
        G: "Impact",
        M: "Manual",
        P: "Parking",
        S: "Parking impact",
      } as Record<string, string>
    )[recordingCode(name)] ?? "Other"
  );
}
export function folderLabel(folder: string): { date: string; session: string } {
  const name = folder.split("/").pop() || "Recordings";
  const m = name.match(/^(\d{4})(\d{2})(\d{2})_(\d+)$/);
  return m
    ? {
        date: `${m[3]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${m[1]}`,
        session: `Session ${Number(m[4])}`,
      }
    : { date: name, session: folder.includes("/") ? folder : "" };
}
