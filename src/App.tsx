import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Film,
  Settings2,
  PanelLeft,
  Maximize,
  Sun,
  Moon,
  Monitor,
  FolderOpen,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { usePanelRef } from "react-resizable-panels";
import { CameraView } from "@/components/CameraView";
import { LibrarySidebar } from "@/components/LibrarySidebar";
import { TelemetryPanel } from "@/components/TelemetryPanel";
import { Transport } from "@/components/Transport";
import { useLibrary } from "@/hooks/use-library";
import { usePlayback } from "@/hooks/use-playback";
import { folderLabel, recordingKind } from "@/library-model";
import type { Layout, StageLayout } from "@/lib/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CameraPanel } from "@/components/CameraPanel";
import { STAGE_LAYOUTS } from "@/lib/stage-layouts";
import { cn } from "@/lib/utils";
const layouts: { value: Layout; label: string }[] = [
  { value: "all", label: "All views" },
  { value: "split", label: "Split" },
  { value: "panorama", label: "Panorama" },
  { value: "round", label: "Round" },
];
type Theme = "system" | "light" | "dark";
function initialTheme(): Theme {
  const value = localStorage.getItem("dashreel.theme.v1");
  return value === "light" || value === "dark" ? value : "system";
}
const SIDEBAR_WIDTH = { default: 300, min: 240, max: 440 };
function initialSidebarWidth(): number {
  const value = Number(localStorage.getItem("dashreel.sidebar.v1"));
  return value >= SIDEBAR_WIDTH.min && value <= SIDEBAR_WIDTH.max
    ? value
    : SIDEBAR_WIDTH.default;
}
export default function App() {
  const { source: sourceRef, rear: rearRef, ...player } = usePlayback(),
    library = useLibrary(player.reset);
  const { select, selected } = player;
  const { setFolder } = library;
  const selectRecording = useCallback(
    (clip: Parameters<typeof select>[0], autoplay = false) => {
      setFolder(clip.folder);
      void select(clip, autoplay);
    },
    [select, setFolder],
  );
  const [layout, setLayout] = useState<Layout>("all"),
    [settings, setSettings] = useState(false),
    [sidebar, setSidebar] = useState(true),
    [sidebarWidth] = useState(initialSidebarWidth),
    [showMap, setShowMap] = useState(true),
    [showMotion, setShowMotion] = useState(true),
    [expanded, setExpanded] = useState<"front" | "cabin" | "rear" | null>(null),
    [theme, setTheme] = useState<Theme>(initialTheme),
    [telemetryHeight, setTelemetryHeight] = useState(200);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const libraryRef = usePanelRef();
  const adjacent = useCallback(
    (delta: number) => {
      const i = library.filtered.findIndex((c) => c.id === selected?.id);
      const next = library.filtered[i + delta];
      if (next) selectRecording(next, player.playing);
    },
    [library.filtered, selected?.id, selectRecording, player.playing],
  );
  const { subscribeEnded } = player;
  const autoNext = useEffectEvent(() => {
    const index = library.clips.findIndex((clip) => clip.id === selected?.id);
    const next = index >= 0 ? library.clips[index + 1] : undefined;
    if (next) {
      library.setQuery("");
      library.setFilter("all");
      selectRecording(next, true);
    }
  });
  useEffect(() => subscribeEnded(() => autoNext()), [subscribeEnded]);
  const expandCamera = useCallback(
    (camera: "front" | "cabin" | "rear") =>
      setExpanded((current) => (current === camera ? null : camera)),
    [],
  );
  const cameraLayout: StageLayout = expanded ?? layout;
  const arrangement = STAGE_LAYOUTS[cameraLayout];
  const fullscreen = useCallback(() => {
    const window = getCurrentWindow();
    void window.isFullscreen().then((value) => window.setFullscreen(!value));
  }, []);
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && system.matches),
      );
    apply();
    system.addEventListener("change", apply);
    localStorage.setItem("dashreel.theme.v1", theme);
    return () => system.removeEventListener("change", apply);
  }, [theme]);
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (settings) return;
    if (e.key === "Escape" && expanded) {
      setExpanded(null);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      libraryRef.current?.expand();
      // Mount the search field in this event rather than waiting for the panel to report its size.
      setSidebar(true);
      requestAnimationFrame(() => document.getElementById("search")?.focus());
      return;
    }
    if (
      (e.target as HTMLElement).closest(
        'input,select,button,canvas,svg,[role="dialog"],[role="separator"]',
      )
    )
      return;
    if (e.code === "Space") {
      e.preventDefault();
      void player.toggle();
    } else if (e.key === "ArrowLeft") player.jump(player.time - 5);
    else if (e.key === "ArrowRight") player.jump(player.time + 5);
    else if (e.key.toLowerCase() === "f") fullscreen();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const ready = !!player.media,
    label = player.selected ? folderLabel(player.selected.folder) : undefined;
  return (
    <TooltipProvider>
      <Dialog open={settings} onOpenChange={setSettings}>
        <div
          data-testid="desktop-shell"
          className={cn(
            "flex h-full flex-col select-none",
            expanded && "camera-focused",
          )}
        >
          <ResizablePanelGroup
            id="workspace"
            className="min-h-0 flex-1 [.camera-focused_&>[data-separator]]:hidden [.camera-focused_&>#library]:hidden!"
          >
            <ResizablePanel
              id="library"
              panelRef={libraryRef}
              collapsible
              collapsedSize={0}
              defaultSize={sidebarWidth}
              minSize={SIDEBAR_WIDTH.min}
              maxSize={SIDEBAR_WIDTH.max}
              groupResizeBehavior="preserve-pixel-size"
              onResize={({ inPixels }) => {
                // Camera focus hides this panel with CSS; that is not the user collapsing it.
                if (expanded) return;
                setSidebar(inPixels > 0);
                if (inPixels > 0)
                  localStorage.setItem(
                    "dashreel.sidebar.v1",
                    String(Math.round(inPixels)),
                  );
              }}
            >
              {sidebar && (
                <LibrarySidebar
                  library={library}
                  selected={player.selected}
                  onSelect={selectRecording}
                />
              )}
            </ResizablePanel>
            <ResizableHandle aria-label="Resize recording sidebar" />
            <ResizablePanel
              id="review"
              minSize={560}
              className="flex min-w-0 flex-col"
            >
              <header
                className={cn(
                  "flex h-49 shrink-0 items-center justify-between border-b border-border bg-(--chrome) pr-16",
                  sidebar && !expanded ? "pl-10" : "pl-90",
                )}
                data-tauri-drag-region="deep"
              >
                <div className="flex items-center gap-8">
                  {!expanded && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-30"
                      aria-label="Toggle recording sidebar"
                      aria-pressed={sidebar}
                      onClick={() =>
                        sidebar
                          ? libraryRef.current?.collapse()
                          : libraryRef.current?.expand()
                      }
                    >
                      <PanelLeft size={16} />
                    </Button>
                  )}
                  <span className="text-[13px] font-semibold">Dashreel</span>
                </div>
                <DialogTrigger asChild>
                  <Button
                    id="settings"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Settings"
                  >
                    <Settings2 size={16} />
                  </Button>
                </DialogTrigger>
              </header>
              <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div
                  className={cn(
                    "shrink-0 items-center gap-12 px-18 py-14 max-[1180px]:flex-wrap max-[1180px]:gap-7 max-[1180px]:px-16 max-[1180px]:py-10 [@media(max-height:780px)]:py-8",
                    expanded ? "hidden" : "flex",
                  )}
                >
                  <div className="min-w-0 flex-1 max-[1180px]:basis-[calc(100%-40px)]">
                    <div className="mb-3 text-[9px] tracking-[0.07em] text-muted-foreground">
                      {label
                        ? `${label.date} / ${label.session}`
                        : "YOUR RECORDINGS"}
                    </div>
                    <h2
                      id="clip-title"
                      className="truncate text-[15px] font-semibold tracking-[-0.025em]"
                    >
                      {player.selected?.name ?? "Recordings"}
                    </h2>
                    <span className="text-[10px] text-muted-foreground">
                      {player.selected
                        ? recordingKind(player.selected.name)
                        : ""}
                    </span>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={cameraLayout}
                    onValueChange={(v) => {
                      if (!v) return;
                      setExpanded(null);
                      setLayout(v as Layout);
                    }}
                    spacing={2}
                    aria-label="Camera layout"
                    className="max-[1180px]:order-3 rounded-[7px] border border-border bg-secondary p-3"
                  >
                    {layouts.map((view) => (
                      <ToggleGroupItem
                        key={view.value}
                        value={view.value}
                        data-layout={view.value}
                        className="h-auto min-w-0 rounded-[4px] px-7 py-4 text-[11px] font-normal text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_3px_rgb(0_0_0/0.13)]"
                      >
                        {view.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <Button
                    id="fullscreen"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Toggle fullscreen"
                    onClick={fullscreen}
                  >
                    <Maximize size={16} />
                  </Button>
                </div>
                {player.error && ready && (
                  <p
                    className="mx-16 mb-8 rounded-[6px] border border-destructive px-12 py-8 text-[12px] text-destructive"
                    role="alert"
                  >
                    {player.error}
                  </p>
                )}
                <div
                  id="stage"
                  data-layout={cameraLayout}
                  data-testid="stage"
                  className={cn(
                    "relative mx-16 grid min-h-150 flex-1 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-700",
                    arrangement.grid,
                    expanded && "mt-14",
                  )}
                >
                  <CameraView
                    camera="front"
                    source={sourceRef}
                    layout={cameraLayout}
                    expanded={expanded === "front"}
                    onExpand={expandCamera}
                    hidden={arrangement.hide.includes("front")}
                    className={arrangement.front}
                  />
                  <CameraView
                    camera="cabin"
                    source={sourceRef}
                    layout={cameraLayout}
                    expanded={expanded === "cabin"}
                    onExpand={expandCamera}
                    hidden={arrangement.hide.includes("cabin")}
                  />
                  <CameraPanel
                    title="Rear camera"
                    hidden={arrangement.hide.includes("rear")}
                  >
                    <video
                      id="rear"
                      ref={rearRef}
                      playsInline
                      muted
                      crossOrigin="anonymous"
                      preload="auto"
                      tabIndex={0}
                      role="button"
                      className={cn(
                        "absolute inset-0 block h-full w-full object-contain focus-visible:ring-3 focus-visible:ring-zinc-400/50 focus-visible:ring-inset focus-visible:outline-none",
                        expanded === "rear"
                          ? "cursor-zoom-out"
                          : "cursor-zoom-in",
                      )}
                      aria-label={
                        expanded === "rear"
                          ? "Restore camera layout"
                          : "Expand rear camera"
                      }
                      onClick={() => expandCamera("rear")}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") expandCamera("rear");
                      }}
                    />
                  </CameraPanel>
                  <div
                    id="empty"
                    hidden={ready && !player.loading}
                    className="absolute inset-0 z-2 flex flex-col items-center justify-center bg-radial-[ellipse_at_50%_20%] from-zinc-900 to-zinc-950 to-70% p-20 text-center text-zinc-100"
                  >
                    <div className="mb-15 rounded-[15px] border border-white/10 bg-white/5 p-15 text-zinc-400 max-[1180px]:hidden">
                      {player.loading ? (
                        <LoaderCircle className="animate-spin" size={26} />
                      ) : (
                        <Film size={28} />
                      )}
                    </div>
                    <h3 className="text-[20px] font-[550] tracking-[-0.025em] max-[1180px]:text-[17px]">
                      {player.loading
                        ? "Opening recording…"
                        : player.error
                          ? "Unable to open recording"
                          : library.clips.length || library.busy
                            ? "Select a recording"
                            : "Open your recordings"}
                    </h3>
                    <p className="mt-8 mb-18 max-w-340 text-[12px] leading-[1.6] text-zinc-400 max-[1180px]:mt-5 max-[1180px]:mb-10">
                      {player.error ||
                        (library.clips.length || library.busy
                          ? "Choose a session and recording from your library."
                          : "Choose the folder or SD card that holds your dashcam recordings.")}
                    </p>
                    {!player.loading &&
                      !library.busy &&
                      !library.clips.length && (
                        <Button
                          onClick={library.open}
                          className="bg-zinc-100 text-zinc-800 hover:bg-white"
                        >
                          <FolderOpen size={15} />
                          Open recordings folder
                        </Button>
                      )}
                  </div>
                </div>
                {(showMap || showMotion) && (
                  <>
                    <div
                      className={cn(
                        "focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none h-12 shrink-0 touch-none items-center justify-center cursor-row-resize",
                        expanded ? "hidden" : "flex",
                      )}
                      role="separator"
                      tabIndex={0}
                      aria-label="Resize telemetry panel"
                      aria-orientation="horizontal"
                      aria-valuemin={180}
                      aria-valuemax={340}
                      aria-valuenow={telemetryHeight}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                          setTelemetryHeight((h) =>
                            Math.max(
                              180,
                              Math.min(
                                340,
                                h + (e.key === "ArrowUp" ? 10 : -10),
                              ),
                            ),
                          );
                        }
                      }}
                      onPointerDown={(e) => {
                        drag.current = {
                          y: e.clientY,
                          height: telemetryHeight,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        if (drag.current)
                          setTelemetryHeight(
                            Math.max(
                              180,
                              Math.min(
                                340,
                                drag.current.height +
                                  drag.current.y -
                                  e.clientY,
                              ),
                            ),
                          );
                      }}
                      onPointerUp={() => {
                        drag.current = null;
                      }}
                      onPointerCancel={() => {
                        drag.current = null;
                      }}
                    >
                      <span className="h-3 w-28 rounded-[2px] bg-border" />
                    </div>
                    <div
                      className={cn(
                        "mx-16 min-h-180 max-h-[40vh] shrink-0 [@media(max-height:780px)]:max-h-180",
                        expanded && "hidden",
                      )}
                      style={{ height: telemetryHeight }}
                    >
                      <TelemetryPanel
                        data={player.telemetry}
                        time={player.time}
                        duration={player.media?.duration ?? 1}
                        seek={player.jump}
                        showMap={showMap}
                        showMotion={showMotion}
                        onCloseMap={() => setShowMap(false)}
                        onCloseMotion={() => setShowMotion(false)}
                      />
                    </div>
                  </>
                )}
                <Transport
                  player={player}
                  adjacent={adjacent}
                  showMap={showMap}
                  showMotion={showMotion}
                  onShowMap={() => setShowMap(true)}
                  onShowMotion={() => setShowMotion(true)}
                />
              </main>
            </ResizablePanel>
          </ResizablePanelGroup>
          <video
            id="source"
            ref={sourceRef}
            className="pointer-events-none fixed bottom-0 left-0 h-1 w-1 opacity-0"
            playsInline
            crossOrigin="anonymous"
            preload="auto"
          />
          <DialogContent className="max-w-440 sm:max-w-440">
            <DialogHeader>
              <DialogTitle>Workspace settings</DialogTitle>
              <DialogDescription>Make Dashreel feel at home.</DialogDescription>
            </DialogHeader>
            <section className="border-t border-border pt-12">
              <h3 className="mb-10 text-[12px] font-semibold">Appearance</h3>
              <div className="flex gap-8">
                {(
                  [
                    { value: "system", label: "System", Icon: Monitor },
                    { value: "light", label: "Light", Icon: Sun },
                    { value: "dark", label: "Dark", Icon: Moon },
                  ] as const
                ).map(({ value, label, Icon }) => (
                  <Button
                    key={value}
                    className="flex-1"
                    variant={theme === value ? "secondary" : "outline"}
                    aria-pressed={theme === value}
                    onClick={() => setTheme(value)}
                  >
                    <Icon size={16} />
                    {label}
                  </Button>
                ))}
              </div>
            </section>
            <section className="border-t border-border pt-12">
              <h3 className="mb-10 text-[12px] font-semibold">Playback</h3>
              <p className="text-[12px] leading-[1.6] text-muted-foreground">
                Recordings play directly from the original files. Keep the
                recording drive connected while watching.
              </p>
            </section>
            <section className="border-t border-border pt-12">
              <h3 className="mb-10 text-[12px] font-semibold">
                Keyboard shortcuts
              </h3>
              <dl className="grid grid-cols-[1fr_auto] gap-9 text-[12px]">
                <dt>Play or pause</dt>
                <dd className="text-muted-foreground">Space</dd>
                <dt>Seek five seconds</dt>
                <dd className="text-muted-foreground">← / →</dd>
                <dt>Search recordings</dt>
                <dd className="text-muted-foreground">⌘ K</dd>
                <dt>Fullscreen</dt>
                <dd className="text-muted-foreground">F</dd>
              </dl>
            </section>
            <p className="text-[10px] leading-[1.6] text-muted-foreground">
              Independent viewer for Comtec recordings · Approximate 240° lens
              correction
            </p>
          </DialogContent>
        </div>
      </Dialog>
    </TooltipProvider>
  );
}
