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
import { CameraView } from "@/components/CameraView";
import { LibrarySidebar } from "@/components/LibrarySidebar";
import { TelemetryPanel } from "@/components/TelemetryPanel";
import { Transport } from "@/components/Transport";
import { useLibrary } from "@/hooks/use-library";
import { usePlayback } from "@/hooks/use-playback";
import { folderLabel, recordingKind } from "@/library-model";
import type { Layout, StageLayout } from "@/lib/types";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
const layouts: { value: Layout; label: string }[] = [
  { value: "all", label: "All views" },
  { value: "split", label: "Split" },
  { value: "panorama", label: "Panorama" },
  { value: "round", label: "Round" },
];
type Theme = "system" | "light" | "dark";
function initialTheme(): Theme {
  const value = localStorage.getItem("comtec.theme.v1");
  return value === "light" || value === "dark" ? value : "system";
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
    [showMap, setShowMap] = useState(true),
    [showMotion, setShowMotion] = useState(true),
    [expanded, setExpanded] = useState<"front" | "cabin" | "rear" | null>(null),
    [theme, setTheme] = useState<Theme>(initialTheme),
    [telemetryHeight, setTelemetryHeight] = useState(200);
  const drag = useRef<{ y: number; height: number } | null>(null);
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
    localStorage.setItem("comtec.theme.v1", theme);
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
      setSidebar(true);
      requestAnimationFrame(() => document.getElementById("search")?.focus());
      return;
    }
    if (
      (e.target as HTMLElement).closest(
        'input,select,button,canvas,svg,[role="dialog"]',
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
        <div className={`desktop-shell ${expanded ? "camera-focused" : ""}`}>
          <header className="titlebar" data-tauri-drag-region="deep">
            <div className="titlebar-left">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Toggle recording sidebar"
                aria-pressed={sidebar}
                onClick={() => setSidebar((v) => !v)}
              >
                <PanelLeft size={16} />
              </Button>
              <span className="app-name">
                COMTEC <b>Studio</b>
              </span>
            </div>
            <div className="titlebar-right">
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
            </div>
          </header>
          <div className={`workspace ${sidebar ? "" : "sidebar-hidden"}`}>
            {sidebar && (
              <LibrarySidebar
                library={library}
                selected={player.selected}
                onSelect={selectRecording}
              />
            )}
            <main className="review">
              <div className="review-heading">
                <div className="recording-heading">
                  <div className="eyebrow">
                    {label
                      ? `${label.date} / ${label.session}`
                      : "YOUR RECORDINGS"}
                  </div>
                  <h2 id="clip-title">
                    {player.selected?.name ?? "Recordings"}
                  </h2>
                  <span className="recording-kind">
                    {player.selected ? recordingKind(player.selected.name) : ""}
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
                <p className="playback-error" role="alert">
                  {player.error}
                </p>
              )}
              <div className="stage" id="stage" data-layout={cameraLayout}>
                <CameraView
                  camera="front"
                  source={sourceRef}
                  layout={cameraLayout}
                  expanded={expanded === "front"}
                  onExpand={expandCamera}
                />
                <CameraView
                  camera="cabin"
                  source={sourceRef}
                  layout={cameraLayout}
                  expanded={expanded === "cabin"}
                  onExpand={expandCamera}
                />
                <article className="camera rear">
                  <header>
                    <span>Rear camera</span>
                  </header>
                  <div className="camera-image">
                    <video
                      id="rear"
                      ref={rearRef}
                      playsInline
                      muted
                      crossOrigin="anonymous"
                      preload="auto"
                      tabIndex={0}
                      role="button"
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
                  </div>
                </article>
                <div
                  className="empty-state"
                  id="empty"
                  hidden={ready && !player.loading}
                >
                  <div className="empty-symbol">
                    {player.loading ? (
                      <LoaderCircle className="loading-spin" size={26} />
                    ) : (
                      <Film size={28} />
                    )}
                  </div>
                  <h3>
                    {player.loading
                      ? "Opening recording…"
                      : player.error
                        ? "Unable to open recording"
                        : "Select a recording"}
                  </h3>
                  <p>
                    {player.error ||
                      "Choose a session and recording from your library."}
                  </p>
                  {!player.loading && !player.selected && (
                    <Button onClick={library.open}>
                      <FolderOpen size={15} />
                      Open recordings folder
                    </Button>
                  )}
                </div>
              </div>
              {(showMap || showMotion) && (
                <>
                  <div
                    className="telemetry-resize"
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
                            Math.min(340, h + (e.key === "ArrowUp" ? 10 : -10)),
                          ),
                        );
                      }
                    }}
                    onPointerDown={(e) => {
                      drag.current = { y: e.clientY, height: telemetryHeight };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      if (drag.current)
                        setTelemetryHeight(
                          Math.max(
                            180,
                            Math.min(
                              340,
                              drag.current.height + drag.current.y - e.clientY,
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
                    <span />
                  </div>
                  <div
                    className="telemetry-container"
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
          </div>
          <video
            id="source"
            ref={sourceRef}
            className="decoder"
            playsInline
            crossOrigin="anonymous"
            preload="auto"
          />
          <DialogContent className="settings-dialog">
            <DialogHeader>
              <DialogTitle>Workspace settings</DialogTitle>
              <DialogDescription>
                Make COMTEC Studio feel at home.
              </DialogDescription>
            </DialogHeader>
            <section>
              <h3>Appearance</h3>
              <div className="theme-options">
                {(
                  [
                    { value: "system", label: "System", Icon: Monitor },
                    { value: "light", label: "Light", Icon: Sun },
                    { value: "dark", label: "Dark", Icon: Moon },
                  ] as const
                ).map(({ value, label, Icon }) => (
                  <Button
                    key={value}
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
            <section>
              <h3>Playback</h3>
              <p>
                Recordings play directly from the original files. Keep the
                recording drive connected while watching.
              </p>
            </section>
            <section>
              <h3>Keyboard shortcuts</h3>
              <dl>
                <dt>Play or pause</dt>
                <dd>Space</dd>
                <dt>Seek five seconds</dt>
                <dd>← / →</dd>
                <dt>Search recordings</dt>
                <dd>⌘ K</dd>
                <dt>Fullscreen</dt>
                <dd>F</dd>
              </dl>
            </section>
            <p className="about">
              Independent COMTEC viewer · Approximate 240° lens correction
            </p>
          </DialogContent>
        </div>
      </Dialog>
    </TooltipProvider>
  );
}
