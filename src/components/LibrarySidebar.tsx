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
    <aside className="library-sidebar">
      <div className="sidebar-heading">
        <h1>
          Library <span id="count">{l.clips.length}</span>
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
        className="open-folder"
        onClick={l.open}
        disabled={l.busy}
      >
        <FolderOpen size={16} />
        Open recordings folder
      </Button>
      <label className="search-field">
        <Search size={14} />
        <input
          id="search"
          type="search"
          aria-label="Search recordings"
          placeholder="Search recordings"
          value={l.query}
          onInput={(e) => l.setQuery(e.currentTarget.value)}
        />
        <kbd>⌘ K</kbd>
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
            className="h-auto min-w-0 rounded-[5px] px-1 py-4 text-[11px] font-normal text-muted-foreground data-[state=on]:bg-[var(--selection)] data-[state=on]:font-semibold data-[state=on]:text-[var(--selection-text)]"
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="library-columns">
        <div className="folder-column">
          <div className="column-heading">SESSIONS</div>
          <div id="folders" aria-label="Recording folders">
            {[...l.groups].map(([folder, clips]) => {
              const label = folderLabel(folder);
              return (
                <button
                  key={folder}
                  className="folder"
                  data-folder={folder}
                  aria-current={l.folder === folder}
                  title={folder}
                  onClick={() => l.setFolder(folder)}
                >
                  <Folder size={15} />
                  <span>
                    <strong>{label.date}</strong>
                    <small>
                      {label.session} · {clips.length}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="recording-column">
          <div className="column-heading">
            {l.folder ? folderLabel(l.folder).session : "RECORDINGS"}
          </div>
          <div id="list" aria-label="Recordings">
            {(l.groups.get(l.folder) ?? []).map((clip) => (
              <button
                className="clip"
                data-id={clip.id}
                key={clip.id}
                aria-current={selected?.id === clip.id}
                onClick={() => onSelect(clip)}
              >
                <span className="clip-leading">
                  <Film size={14} />
                </span>
                <span className="clip-copy">
                  <strong>{recordingTime(clip.name)}</strong>
                  <small>{clip.name}</small>
                  <em>{recordingKind(clip.name)}</em>
                </span>
                <span className="clip-type" title={recordingKind(clip.name)}>
                  {recordingCode(clip.name)}
                </span>
                <ChevronRight size={12} className="clip-arrow" />
              </button>
            ))}
          </div>
        </div>
      </div>
      {l.error && (
        <p role="alert" className="library-error">
          {l.error}
        </p>
      )}
      {!l.busy && !l.filtered.length && (
        <p className="library-empty">
          {l.clips.length
            ? "No matching recordings."
            : "Choose a folder to browse your recordings."}
        </p>
      )}
      <div className="library-location" title={l.root}>
        <HardDrive size={16} />
        <span>
          <b>{l.root.split("/").pop() || "No folder selected"}</b>
          <small>{l.clips.length} recordings</small>
        </span>
      </div>
    </aside>
  );
});
