import { test } from "node:test";
import assert from "node:assert/strict";
import { recordingKind, folderLabel } from "../src/library-model.ts";
test("COMTEC event types do not get mislabeled as driving", () => {
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
