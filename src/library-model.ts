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
/** First and last recording times in file order, so a session that crosses midnight reads correctly. */
export function sessionSpan(names: string[]): string {
  const times = names.flatMap((name) => {
    const m = name.match(/^\d+_(\d{2})(\d{2})\d{2}_/);
    return m ? [`${m[1]}:${m[2]}`] : [];
  });
  if (!times.length) return "";
  const first = times[0],
    last = times[times.length - 1];
  return first === last ? first : `${first} – ${last}`;
}
/** Lower-cased text a search is matched against: the file and folder names plus the time, date, session and type the row displays. */
export function recordingSearchText(clip: {
  name: string;
  folder: string;
}): string {
  const time = clip.name.match(/^\d+_(\d{2})(\d{2})(\d{2})_/);
  const label = folderLabel(clip.folder);
  return [
    clip.name,
    clip.folder,
    time ? `${time[1]}:${time[2]}:${time[3]}` : "",
    label.date,
    label.session,
    recordingKind(clip.name),
  ]
    .join(" ")
    .toLowerCase();
}
