/** A single play/pause intent for both native decoders, including late play events. */
export interface Decoder extends EventTarget {
  paused: boolean;
  currentTime: number;
  readyState: number;
  seeking: boolean;
  play(): Promise<void>;
  pause(): void;
}
export class PlaybackSync {
  wanted = false;
  private active = false;
  private attempt = 0;
  private starting = false;
  private disposed = false;
  private listeners = new AbortController();
  private main: Decoder;
  private rear: Decoder;
  private changed: (playing: boolean) => void;
  private failed: (error: unknown) => void;
  constructor(
    main: Decoder,
    rear: Decoder,
    changed: (playing: boolean) => void,
    failed: (error: unknown) => void,
  ) {
    this.main = main;
    this.rear = rear;
    this.changed = changed;
    this.failed = failed;
    for (const video of [main, rear]) {
      video.addEventListener(
        "play",
        () => {
          // A pending native play() can complete after the user presses Pause.
          if (!this.wanted) this.stopDecoders();
          this.publish();
        },
        { signal: this.listeners.signal },
      );
      video.addEventListener("pause", () => this.publish(), {
        signal: this.listeners.signal,
      });
      video.addEventListener("playing", () => this.publish(), {
        signal: this.listeners.signal,
      });
    }
  }
  setActive(active: boolean) {
    this.pause();
    this.active = active;
  }
  private stopDecoders() {
    this.main.pause();
    this.rear.pause();
  }
  private publish() {
    this.changed(this.wanted && (!this.main.paused || !this.rear.paused));
  }
  pause() {
    this.wanted = false;
    this.attempt++;
    this.starting = false;
    this.stopDecoders();
    this.changed(false);
  }
  play() {
    if (!this.active || this.disposed) return;
    this.wanted = true;
    return this.reconcile();
  }
  toggle() {
    if (this.wanted || !this.main.paused || !this.rear.paused) this.pause();
    else this.play();
  }
  async reconcile() {
    if (this.disposed || !this.active) return;
    if (!this.wanted) {
      this.stopDecoders();
      this.publish();
      return;
    }
    const main = this.main,
      rear = this.rear;
    if (main.seeking || rear.seeking) return;
    if (Math.abs(main.currentTime - rear.currentTime) > 0.12) {
      rear.currentTime = main.currentTime;
      return;
    }
    if ((!main.paused && !rear.paused) || this.starting) return;
    // Let each decoder buffer naturally; pausing in a waiting handler races play().
    if (main.readyState < 3 || rear.readyState < 3) return;
    const attempt = ++this.attempt;
    this.starting = true;
    try {
      await Promise.all([main.play(), rear.play()]);
      if (!this.wanted || this.disposed) this.stopDecoders();
    } catch (error) {
      if (
        attempt === this.attempt &&
        this.wanted &&
        !(error instanceof DOMException && error.name === "AbortError")
      ) {
        this.pause();
        this.failed(error);
      }
    } finally {
      if (attempt === this.attempt) this.starting = false;
      this.publish();
    }
  }
  dispose() {
    this.pause();
    this.disposed = true;
    this.listeners.abort();
  }
}
