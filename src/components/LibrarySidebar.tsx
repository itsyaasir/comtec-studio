import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronRight,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarRow } from "@/components/SidebarRow";
import {
  folderLabel,
  recordingKind,
  recordingCode,
  sessionSpan,
  type Recording,
} from "@/library-model";
import { recordingTime } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { useLibrary } from "@/hooks/use-library";
type Library = ReturnType<typeof useLibrary>;
const EVENT_CODES = ["G", "M", "S"];
/** Driving is the norm, so only the other recording types are labelled. */
function Kind({ name }: { name: string }) {
  const code = recordingCode(name);
  if (code === "A") return null;
  return (
    <span
      className={cn(
        "text-[11px]",
        code === "G" || code === "S"
          ? "rounded-[4px] bg-destructive/10 px-5 py-1 font-medium text-destructive"
          : code === "M"
            ? "rounded-[4px] bg-foreground/8 px-5 py-1 font-medium"
            : "opacity-60",
      )}
    >
      {recordingKind(name)}
    </span>
  );
}
function Notice({
  title,
  children,
  alert,
}: {
  title: string;
  children: ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-24 pb-40 text-center"
    >
      <strong className="text-[13px] font-semibold">{title}</strong>
      {children}
    </div>
  );
}
export const LibrarySidebar = memo(function LibrarySidebar({
  library: l,
  selected,
  onSelect,
}: {
  library: Library;
  selected?: Recording;
  onSelect: (clip: Recording) => void;
}) {
  const sections = useMemo(() => {
    const names = new Map<string, string[]>();
    for (const clip of l.clips)
      names.set(clip.folder, [...(names.get(clip.folder) ?? []), clip.name]);
    const sections: {
      date: string;
      sessions: {
        folder: string;
        title: string;
        detail: string;
        clips: Recording[];
        events: boolean;
      }[];
    }[] = [];
    for (const [folder, clips] of l.groups) {
      const label = folderLabel(folder);
      const span = sessionSpan(names.get(folder) ?? []);
      const session = {
        folder,
        title: span || label.session || "Recordings",
        detail: span ? label.session : "",
        clips,
        events: clips.some((c) => EVENT_CODES.includes(recordingCode(c.name))),
      };
      const last = sections[sections.length - 1];
      if (last?.date === label.date) last.sessions.push(session);
      else sections.push({ date: label.date, sessions: [session] });
    }
    return sections;
  }, [l.clips, l.groups]);
  const searching = l.query.trim() !== "";
  // Remembered against the selection, so moving to another recording reopens its session.
  const [collapsed, setCollapsed] = useState<{
    folder: string;
    selected?: string;
  }>();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current
      ?.querySelector('[data-testid="clip"][aria-current="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected?.id, l.folder]);
  return (
    <aside
      aria-label="Library"
      className="flex h-full min-h-0 min-w-0 flex-col border-r border-border bg-(--chrome)"
    >
      {/* Holds the window controls; nothing else belongs here, so it is only a drag region. */}
      <div
        className="h-49 shrink-0"
        data-testid="sidebar-titlebar"
        data-tauri-drag-region="deep"
      />
      <div className="flex flex-col gap-8 px-12 pt-2 pb-6">
        <label className="flex h-30 items-center gap-7 rounded-[7px] border border-border bg-background px-9 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          <Search size={14} className="shrink-0" />
          <input
            id="search"
            type="search"
            aria-label="Search recordings"
            placeholder="Search recordings"
            value={l.query}
            onInput={(e) => l.setQuery(e.currentTarget.value)}
            className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="font-sans text-[11px] whitespace-nowrap">⌘K</kbd>
        </label>
        <ToggleGroup
          type="single"
          value={l.filter}
          onValueChange={(v) => {
            if (v) l.setFilter(v);
          }}
          spacing={2}
          aria-label="Recording type"
          className="grid w-full grid-cols-4 rounded-[7px] border border-border bg-secondary p-3"
        >
          {(
            [
              ["all", "All"],
              ["A", "Driving"],
              ["P", "Parking"],
              ["events", "Events"],
            ] as const
          ).map(([value, label]) => (
            <ToggleGroupItem
              key={value}
              value={value}
              data-filter={value}
              className="h-auto min-w-0 rounded-[4px] px-4 py-4 text-[11px] font-normal text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_3px_rgb(0_0_0/0.13)]"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {l.error && l.clips.length > 0 && (
        <p
          role="alert"
          className="mx-12 mb-6 rounded-[6px] bg-destructive/10 px-9 py-6 text-[11px] leading-[1.45] text-destructive select-text"
        >
          Couldn't read the recordings, so this list may be out of date.{" "}
          {l.error}
        </p>
      )}
      {l.error && !l.clips.length ? (
        <Notice title="Couldn't read the recordings" alert>
          <p className="text-[12px] leading-[1.5] text-muted-foreground">
            {l.error}
          </p>
        </Notice>
      ) : !l.clips.length ? (
        l.busy ? (
          <Notice title="Reading recordings…">
            <LoaderCircle
              size={16}
              className="animate-spin text-muted-foreground"
            />
          </Notice>
        ) : (
          <Notice title="No recordings yet">
            <p className="text-[12px] leading-[1.5] text-muted-foreground">
              Sessions appear here once you open a recordings folder.
            </p>
          </Notice>
        )
      ) : !l.filtered.length ? (
        <Notice title="No matching recordings">
          <p className="text-[12px] leading-[1.5] text-muted-foreground">
            Nothing in this library fits the search and type you chose.
          </p>
          <Button
            variant="outline"
            className="mt-8"
            onClick={() => {
              l.setQuery("");
              l.setFilter("all");
            }}
          >
            Show all recordings
          </Button>
        </Notice>
      ) : (
        <div
          id="folders"
          ref={scroller}
          role="group"
          aria-label="Recordings by session"
          className="min-h-0 flex-1 overflow-y-auto px-8 pb-8"
        >
          {sections.map((section) => (
            <section key={section.sessions[0].folder}>
              <h2 className="sticky top-0 z-1 bg-(--chrome) px-6 pt-10 pb-5 text-[11px] font-semibold text-muted-foreground">
                {section.date}
              </h2>
              {section.sessions.map((session) => {
                const active = l.folder === session.folder;
                const open =
                  searching ||
                  (active &&
                    !(
                      collapsed?.folder === session.folder &&
                      collapsed.selected === selected?.id
                    ));
                return (
                  <div key={session.folder}>
                    <SidebarRow
                      variant="folder"
                      data-testid="folder"
                      data-folder={session.folder}
                      aria-expanded={open}
                      title={session.folder}
                      onClick={() => {
                        l.setFolder(session.folder);
                        setCollapsed(
                          open && active && !searching
                            ? { folder: session.folder, selected: selected?.id }
                            : undefined,
                        );
                      }}
                    >
                      <ChevronRight
                        size={13}
                        className={cn(
                          "shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-90",
                        )}
                      />
                      <span className="text-[12px] font-medium tabular-nums">
                        {session.title}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {session.detail}
                      </span>
                      {session.events && (
                        <span
                          className="size-5 shrink-0 rounded-full bg-destructive"
                          title="Includes event recordings"
                        >
                          <span className="sr-only">
                            Includes event recordings,
                          </span>
                        </span>
                      )}
                      <span className="min-w-14 text-right text-[11px] text-muted-foreground tabular-nums">
                        {session.clips.length}
                        <span className="sr-only">
                          {session.clips.length === 1
                            ? " recording"
                            : " recordings"}
                        </span>
                      </span>
                    </SidebarRow>
                    {open && (
                      <div
                        id={active ? "list" : undefined}
                        className="mt-1 mb-5 ml-11 border-l border-border pl-5"
                      >
                        {session.clips.map((clip) => (
                          <SidebarRow
                            variant="clip"
                            data-testid="clip"
                            data-id={clip.id}
                            data-name={clip.name}
                            key={clip.id}
                            aria-current={selected?.id === clip.id}
                            aria-label={`${recordingTime(clip.name)}, ${recordingKind(clip.name)}`}
                            title={`${recordingKind(clip.name)} recording, ${clip.name}`}
                            onClick={() => onSelect(clip)}
                          >
                            <span className="text-[12px] tabular-nums">
                              {recordingTime(clip.name)}
                            </span>
                            <Kind name={clip.name} />
                          </SidebarRow>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
      <div className="flex items-center gap-8 border-t border-border py-8 pr-8 pl-14">
        <HardDrive size={15} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1" title={l.root}>
          <b className="block truncate text-[12px] font-medium">
            {l.root.split("/").pop() || "No folder selected"}
          </b>
          <small className="block text-[11px] text-muted-foreground">
            <span id="count">{l.clips.length}</span>{" "}
            {l.clips.length === 1 ? "recording" : "recordings"}
          </small>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="refresh"
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh recordings"
              disabled={l.busy}
              onClick={l.refresh}
            >
              <RefreshCw size={14} className={cn(l.busy && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            Refresh
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              id="open"
              variant="ghost"
              size="icon-sm"
              aria-label="Open recordings folder"
              disabled={l.busy}
              onClick={l.open}
            >
              <FolderOpen size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            Open recordings folder
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
});
