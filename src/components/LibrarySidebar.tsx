import { memo } from "react";
import {
  FolderOpen,
  RefreshCw,
  Search,
  HardDrive,
  Folder,
  Film,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SidebarRow } from "@/components/SidebarRow";
import {
  folderLabel,
  recordingKind,
  recordingCode,
  type Recording,
} from "@/library-model";
import { recordingTime } from "@/lib/types";
import type { useLibrary } from "@/hooks/use-library";
type Library = ReturnType<typeof useLibrary>;
export const LibrarySidebar = memo(function LibrarySidebar({
  library: l,
  selected,
  onSelect,
}: {
  library: Library;
  selected?: Recording;
  onSelect: (clip: Recording) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col gap-8 border-r border-border bg-(--chrome) p-10 in-[.camera-focused]:hidden">
      <div className="flex items-center justify-between pt-16 pr-15 pb-8 pl-18">
        <h1 className="text-[18px] font-[650] tracking-[-0.03em]">
          Library{" "}
          <span
            id="count"
            className="ml-7 rounded-[5px] border border-border bg-secondary px-6 py-2 align-middle text-[11px] font-medium text-muted-foreground"
          >
            {l.clips.length}
          </span>
        </h1>
        <Button
          id="refresh"
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh recordings"
          disabled={l.busy}
          onClick={l.refresh}
        >
          <RefreshCw size={15} />
        </Button>
      </div>
      <Button
        id="open"
        variant="outline"
        className="mx-16 mb-12 h-32 justify-start"
        onClick={l.open}
        disabled={l.busy}
      >
        <FolderOpen size={16} />
        Open recordings folder
      </Button>
      <label className="relative mx-16 mb-12 flex items-center gap-6 rounded-[6px] border border-border bg-background px-8 py-5 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 focus-within:outline-none">
        <Search size={14} />
        <input
          id="search"
          type="search"
          aria-label="Search recordings"
          placeholder="Search recordings"
          value={l.query}
          onInput={(e) => l.setQuery(e.currentTarget.value)}
          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
        />
        <kbd className="text-[10px] whitespace-nowrap">⌘ K</kbd>
      </label>
      <ToggleGroup
        type="single"
        value={l.filter}
        onValueChange={(v) => {
          if (v) l.setFilter(v);
        }}
        aria-label="Recording type"
        className="mx-16 mb-12 grid w-auto grid-cols-4 gap-3"
      >
        {(
          [
            ["all", "All clips"],
            ["A", "Driving"],
            ["P", "Parking"],
            ["events", "Events"],
          ] as const
        ).map(([value, label]) => (
          <ToggleGroupItem
            key={value}
            value={value}
            data-filter={value}
            className="h-auto min-w-0 rounded-[5px] px-1 py-4 text-[11px] font-normal text-muted-foreground data-[state=on]:bg-(--selection) data-[state=on]:font-semibold data-[state=on]:text-(--selection-text)"
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="grid min-h-0 flex-1 grid-cols-[126px_minmax(0,1fr)] gap-8 border-t border-border max-[1180px]:grid-cols-[112px_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col border-r border-border">
          <div className="px-10 pt-12 pb-7 text-[9px] font-semibold tracking-[0.06em] text-muted-foreground">
            SESSIONS
          </div>
          <div
            id="folders"
            aria-label="Recording folders"
            className="min-h-0 overflow-auto px-5 pb-6 scrollbar-thin"
          >
            {[...l.groups].map(([folder, clips]) => {
              const label = folderLabel(folder);
              return (
                <SidebarRow
                  key={folder}
                  variant="folder"
                  data-testid="folder"
                  data-folder={folder}
                  aria-current={l.folder === folder}
                  title={folder}
                  onClick={() => l.setFolder(folder)}
                >
                  <Folder
                    size={15}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0">
                    <strong className="text-[10px] font-semibold whitespace-nowrap">
                      {label.date}
                    </strong>
                    <small className="mt-3 block text-[9px] text-muted-foreground">
                      {label.session} · {clips.length}
                    </small>
                  </span>
                </SidebarRow>
              );
            })}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col bg-background">
          <div className="px-10 pt-12 pb-7 text-[9px] font-semibold tracking-[0.06em] text-muted-foreground">
            {l.folder ? folderLabel(l.folder).session : "RECORDINGS"}
          </div>
          <div
            id="list"
            aria-label="Recordings"
            className="min-h-0 overflow-auto px-5 pb-6 scrollbar-thin"
          >
            {(l.groups.get(l.folder) ?? []).map((clip) => (
              <SidebarRow
                variant="clip"
                data-testid="clip"
                data-id={clip.id}
                key={clip.id}
                aria-current={selected?.id === clip.id}
                onClick={() => onSelect(clip)}
              >
                <span className="text-muted-foreground max-[1180px]:hidden">
                  <Film size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-[12px] font-semibold tabular-nums">
                    {recordingTime(clip.name)}
                  </strong>
                  <small className="my-3 block truncate text-[9px] text-muted-foreground">
                    {clip.name}
                  </small>
                  <em className="block text-[10px] not-italic opacity-70">
                    {recordingKind(clip.name)}
                  </em>
                </span>
                <span
                  className="self-start rounded-[3px] border border-border px-3 py-1 text-[9px]"
                  title={recordingKind(clip.name)}
                >
                  {recordingCode(clip.name)}
                </span>
                <ChevronRight size={12} className="hidden" />
              </SidebarRow>
            ))}
          </div>
        </div>
      </div>
      {l.error && (
        <p role="alert" className="px-16 py-12 text-[12px] text-destructive">
          {l.error}
        </p>
      )}
      {!l.busy && !l.filtered.length && (
        <p className="px-16 py-12 text-[12px] text-muted-foreground">
          {l.clips.length
            ? "No matching recordings."
            : "Choose a folder to browse your recordings."}
        </p>
      )}
      <div
        className="flex items-center gap-10 border-t border-border px-16 py-13 text-muted-foreground"
        title={l.root}
      >
        <HardDrive size={16} />
        <span className="min-w-0">
          <b className="block truncate text-[11px] font-medium text-foreground">
            {l.root.split("/").pop() || "No folder selected"}
          </b>
          <small className="text-[10px]">{l.clips.length} recordings</small>
        </span>
      </div>
    </aside>
  );
});
