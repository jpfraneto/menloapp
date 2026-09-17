import test from "node:test";
import assert from "node:assert/strict";
import { actionArguments } from "../src/experience-agent.js";

const tap = { action: "tap", label: "Say hello", identifier: "", x: 10, y: 20, endX: 0, endY: 0, safe: true, reason: "Try the greeting" };
test("preview actions stay on the selected Simulator and do not become shell commands", () => {
  assert.deepEqual(actionArguments(tap, "chosen-device"), ["touch", "-x", "10", "-y", "20", "--down", "--up", "--udid", "chosen-device"]);
  assert.equal(actionArguments({ ...tap, safe: false }, "chosen-device"), null);
  assert.equal(actionArguments({ ...tap, action: "done" }, "chosen-device"), null);
  assert.throws(() => actionArguments({ ...tap, action: "shell" }, "chosen-device"), /invalid/);
  assert.throws(() => actionArguments({ ...tap, label: "", x: 900 }, "chosen-device", { width: 402, height: 874 }), /out-of-bounds/);
  assert.throws(() => actionArguments({ ...tap, label: "", y: NaN }, "chosen-device"), /out-of-bounds/);
});
