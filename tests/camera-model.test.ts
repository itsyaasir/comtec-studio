import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraBasis, presets } from "../src/camera-model.ts";
test("cabin screen-up points toward occupants heads in the lower source hemisphere", () => {
  const c = presets.cabin,
    b = cameraBasis(c.pitch, c.yaw, c.roll);
  const sourceY = (screenY: number) => {
    const x = b[3] * screenY + b[6];
    const y = b[4] * screenY + b[7];
    const z = b[5] * screenY + b[8];
    const radial = Math.hypot(x, y);
    return 0.5 - (Math.atan2(radial, z) / (240 * Math.PI / 180)) * y / radial;
  };
  assert.ok(
    sourceY(0.1) > sourceY(0),
    "The cabin is upside down: screen-up must sample farther down the circular source",
  );
  assert.ok(
    b[0] < 0,
    "Cabin left/right must rotate with its vertical orientation",
  );
});
test("front retains upright screen-up and right", () => {
  const c = presets.front,
    b = cameraBasis(c.pitch, c.yaw, c.roll);
  assert.ok(b[4] > 0);
  assert.ok(b[0] > 0);
});
