"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ps = require("../lib/padscript");
const { playEvents } = require("../lib/scheduler");
const receiptLib = require("../lib/receipt");
const report = require("../lib/report");
const overlay = require("../lib/overlay");
const { makeLogWaiter, waitForLogLine, parseArgs } = require("../lib/cli");

function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qaping-rig-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a recorded session has stable events, including its held final state", () => {
  const script = ps.loadScript(JSON.stringify({ schema: ps.SCHEMA, source: "recorded", timeline: [
    { t_ms: 0, pad: { ly: 1 } },
    { t_ms: 200, pad: { ly: 1, buttons: ["A"] } },
    { t_ms: 400, pad: { ly: 1 } },
    { t_ms: 1400, pad: { ly: 1 } },
  ] }));
  const events = ps.changeEvents(script);
  assert.deepEqual(events, ps.changeEvents(JSON.parse(JSON.stringify(script))));
  assert.equal(ps.durationMs(script), 1400);
  assert.equal(events.at(-1).t_ms, 1400);
  assert.equal(events.at(-1).pad.ly, 1);
});

test("jump and trigger actions retain a held stick until neutral", () => {
  const events = ps.compileMoves([
    { op: "stick", stick: "L", x: 0, y: 1, ms: 100 },
    { op: "press", btn: "A", ms: 50 },
    { op: "trigger", trigger: "RT", v: 1, ms: 100 },
    { op: "neutral", ms: 100 },
  ]);
  assert.equal(events.find((event) => event.pad.buttons.includes("A")).pad.ly, 1);
  assert.equal(events.find((event) => event.pad.rt === 1).pad.ly, 1);
  assert.equal(events.at(-1).pad.ly, 0);
});

test("invalid axes and decreasing timestamps cannot become playable scripts", () => {
  for (const timeline of [
    [{ t_ms: 0, pad: { lx: 2 } }],
    [{ t_ms: 200, pad: {} }, { t_ms: 100, pad: {} }],
  ]) assert.throws(() => ps.loadScript(JSON.stringify({ schema: ps.SCHEMA, timeline })), /invalid padscript/);
});

test("a synchronization wait shifts playback without changing the input stream", async () => {
  let now = 0;
  const sent = [];
  await playEvents([
    { seq: 0, t_ms: 0, pad: { ly: 1 } },
    { t_ms: 100, wait_log: { match: "ready" } },
    { seq: 1, t_ms: 200, pad: {} },
  ], {
    now: () => now, spinMs: 0,
    doSleep: async (ms) => { now += ms; },
    waitLog: async () => { now += 500; },
    send: (event) => sent.push({ event, at: now }),
  });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].at, 700);
  assert.equal(sent[1].event.t_ms, 200);
});

test("repeated log barriers require a fresh matching occurrence", async (t) => {
  const file = path.join(temp(t), "game.log");
  fs.writeFileSync(file, "old ready\n");
  const wait = makeLogWaiter(file, () => false);
  fs.appendFileSync(file, "new ready\n");
  assert.equal(await wait("ready", 20), true);
  assert.equal(await wait("ready", 20), false);
  fs.appendFileSync(file, "another ready\n");
  assert.equal(await wait("ready", 20), true);
});

test("receipts round-trip unknown extensions without claiming a human review", (t) => {
  const dir = temp(t);
  const receipt = { ...receiptLib.createReceipt(), extension_from_caller: { value: 1 } };
  receiptLib.writeReceipt(dir, receipt);
  assert.deepEqual(receiptLib.readReceipt(dir), receipt);
  assert.equal(report.receiptToAnnotations(receipt).ping_id, null);
  assert.throws(() => receiptLib.writeReceipt(dir, { ...receipt, result: "fail" }), /failure_cause/);
});

test("startup cannot match an old session in an appended or replaced game log", async (t) => {
  const file = path.join(temp(t), "game.log");
  const old = "previous session ready\n";
  fs.writeFileSync(file, old);
  assert.equal(await waitForLogLine(file, "ready", 10, () => false, old), false);
  fs.appendFileSync(file, "new session ready\n");
  assert.equal(await waitForLogLine(file, "ready", 10, () => false, old), true);
  fs.writeFileSync(file, "ready\n");
  assert.equal(await waitForLogLine(file, "ready", 10, () => false, old), true);
});

test("the CLI reports actual receipt findings from any working directory", (t) => {
  const dir = temp(t);
  receiptLib.writeReceipt(dir, receiptLib.createReceipt({ warnings: ["Recording started late"] }));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../bin/rig.js"), "report", dir], {
    cwd: os.tmpdir(), encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const annotations = JSON.parse(fs.readFileSync(path.join(dir, "annotations.json")));
  assert.equal(annotations.ping_id, null);
  assert.ok(annotations.findings.every((finding) => finding.author === "rig"));
  assert.match(result.stdout, /Recording started late/);
});

test("an unsupported command fails without a module stack trace", () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../bin/rig.js"), "compare", "a", "b"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unsupported command/);
  assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|at .*\.js:\d+/);
});

test("CLI paths with spaces remain a single argument", () => {
  const args = parseArgs(["play", "D:/Steam Library/Game", "--game-log", "D:/Game Logs/session.log", "--no-telemetry"]);
  assert.equal(args._[1], "D:/Steam Library/Game");
  assert.equal(args["game-log"], "D:/Game Logs/session.log");
  assert.equal(args["no-telemetry"], true);
});

test("input overlay encodes a PNG from the supplied controller state", () => {
  const a = overlay.encodePng(overlay.drawPad({ buttons: ["A"], lx: 1 }));
  const b = overlay.encodePng(overlay.drawPad({}));
  assert.equal(a.subarray(1, 4).toString(), "PNG");
  assert.notDeepEqual(a, b);
});
