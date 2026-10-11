import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recordingKind,
  folderLabel,
  sessionSpan,
  recordingSearchText,
} from "../src/library-model.ts";
test("Comtec event types do not get mislabeled as driving", () => {
  assert.equal(recordingKind("013_162121_G.mp4"), "Impact");
  assert.equal(recordingKind("000_180000_S.MP4"), "Parking impact");
  assert.equal(recordingKind("000_180000_M.mp4"), "Manual");
  assert.equal(recordingKind("unknown.mp4"), "Other");
});
test("session grouping preserves dates and session identity", () => {
  assert.deepEqual(folderLabel("20260915_002"), {
    date: "15 Sep 2026",
    session: "Session 2",
  });
});
test("a session is described by its first and last recording times", () => {
  assert.equal(
    sessionSpan(["000_023859_A.mp4", "001_023959_A.mp4", "015_025359_A.mp4"]),
    "02:38 – 02:53",
  );
  assert.equal(sessionSpan(["000_025559_P.mp4"]), "02:55");
  assert.equal(
    sessionSpan(["000_235930_A.mp4", "001_000030_A.mp4"]),
    "23:59 – 00:00",
  );
  assert.equal(sessionSpan(["notes.mp4"]), "");
  assert.equal(sessionSpan([]), "");
});
test("search matches what a recording row shows, not only its file name", () => {
  const text = recordingSearchText({
    name: "013_162121_G.mp4",
    folder: "20260915_002",
  });
  for (const query of [
    "16:21",
    "16:21:21",
    "15 sep",
    "session 2",
    "impact",
    "013_162121",
    "20260915_002",
  ])
    assert.ok(text.includes(query), query);
  assert.ok(!text.includes("parking"));
});
