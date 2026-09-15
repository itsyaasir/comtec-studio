import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { recordingCode, type Recording } from "@/library-model";
export function useLibrary(reset: () => void) {
  const [clips, setClips] = useState<Recording[]>([]),
    [root, setRoot] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [folder, setFolder] = useState(""),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const load = useCallback(
    async (choose = false) => {
      const n = ++sequence.current;
      reset();
      setBusy(true);
      setError("");
      try {
        const result = await invoke<{
          root: string;
          clips: Recording[];
        } | null>("library", { choose });
        if (n !== sequence.current || !result) return;
        setClips(result.clips);
        setRoot(result.root);
        setFolder("");
        setQuery("");
      } catch (e) {
        if (n === sequence.current) setError(String(e));
      } finally {
        if (n === sequence.current) setBusy(false);
      }
    },
    [reset],
  );
  useEffect(() => {
    let active = true;
    const n = sequence.current;
    void invoke<{ root: string; clips: Recording[] } | null>("library", {
      choose: false,
    })
      .then((result) => {
        if (active && n === sequence.current && result) {
          setClips(result.clips);
          setRoot(result.root);
        }
      })
      .catch((e) => {
        if (active && n === sequence.current) setError(String(e));
      })
      .finally(() => {
        if (active && n === sequence.current) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const filtered = useMemo(
    () =>
      clips.filter((c) => {
        const code = recordingCode(c.name);
        return (
          (filter === "all" ||
            (filter === "events"
              ? ["G", "M", "S"].includes(code)
              : filter === "P"
                ? ["P", "S"].includes(code)
                : code === filter)) &&
          `${c.name} ${c.folder}`.toLowerCase().includes(query.toLowerCase())
        );
      }),
    [clips, filter, query],
  );
  const groups = useMemo(() => {
    const groups = new Map<string, Recording[]>();
    for (const clip of filtered) {
      const list = groups.get(clip.folder) ?? [];
      list.push(clip);
      groups.set(clip.folder, list);
    }
    return groups;
  }, [filtered]);
  const activeFolder = groups.has(folder)
    ? folder
    : (groups.keys().next().value ?? "");
  const open = useCallback(() => void load(true), [load]),
    refresh = useCallback(() => void load(), [load]);
  return useMemo(
    () => ({
      clips,
      root,
      query,
      setQuery,
      filter,
      setFilter,
      folder: activeFolder,
      setFolder,
      filtered,
      groups,
      busy,
      error,
      open,
      refresh,
    }),
    [
      clips,
      root,
      query,
      filter,
      activeFolder,
      filtered,
      groups,
      busy,
      error,
      open,
      refresh,
    ],
  );
}
