import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaybackSync } from "../src/playback-sync.ts";
class Video extends EventTarget {
  paused = true;
  currentTime = 0;
  readyState = 4;
  seeking = false;
  pending: (() => void) | undefined;
  delayed = false;
  play() {
    const start = () => {
      this.paused = false;
      this.dispatchEvent(new Event("play"));
    };
    if (this.delayed)
      return new Promise<void>((resolve) => {
        this.pending = () => {
          start();
          resolve();
        };
      });
    start();
    return Promise.resolve();
  }
  pause() {
    if (!this.paused) {
      this.paused = true;
      this.dispatchEvent(new Event("pause"));
    }
  }
}
function fixture() {
  const main = new Video(),
    rear = new Video();
  let playing = false;
  const sync = new PlaybackSync(
    main,
    rear,
    (value) => {
      playing = value;
    },
    (error) => {
      throw error;
    },
  );
  sync.setActive(true);
  return { main, rear, sync, playing: () => playing };
}
test("late rear play cannot outlive a user pause", async () => {
  const f = fixture();
  f.rear.delayed = true;
  f.sync.play();
  assert.equal(f.main.paused, false);
  f.sync.pause();
  f.rear.pending!();
  await Promise.resolve();
  assert.equal(f.main.paused, true);
  assert.equal(f.rear.paused, true);
  assert.equal(f.playing(), false);
  f.sync.dispose();
});
test("pause wins during buffering and subsequent readiness", async () => {
  const f = fixture();
  f.rear.readyState = 2;
  f.sync.play();
  f.sync.pause();
  f.rear.readyState = 4;
  await f.sync.reconcile();
  assert.equal(f.main.paused, true);
  assert.equal(f.rear.paused, true);
  assert.equal(f.playing(), false);
  f.sync.dispose();
});
test("a decoder unexpectedly stopping is restarted under shared play intent", async () => {
  const f = fixture();
  await f.sync.play();
  f.rear.pause();
  await f.sync.reconcile();
  assert.equal(f.main.paused, false);
  assert.equal(f.rear.paused, false);
  assert.equal(f.playing(), true);
  f.sync.toggle();
  assert.equal(f.main.paused, true);
  assert.equal(f.rear.paused, true);
  assert.equal(f.playing(), false);
  f.sync.dispose();
});
test("disposing prevents pending play from restarting either decoder", async () => {
  const f = fixture();
  f.main.delayed = true;
  f.sync.play();
  f.sync.dispose();
  f.main.pending!();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(f.main.paused, true);
  assert.equal(f.rear.paused, true);
});
