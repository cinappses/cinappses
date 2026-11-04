import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as drawing from "../src/lib/guestbook.ts";

const page = await readFile(new URL("../src/pages/guestbook.astro", import.meta.url), "utf8");
const script = page.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/m, "");
const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function pad() {
  const context = { scale() {}, fill() {}, fillRect() {}, drawImage() {} };
  const canvas = {
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 240 }),
    setPointerCapture() {},
  };
  const meter = { style: {} };
  const undo = {};
  const clear = {};
  const el = {
    querySelector: (selector) => ({ canvas, ".meter span": meter, ".undo": undo, ".clear": clear })[selector],
    querySelectorAll: () => [],
    classList: { add() {}, remove() {} },
    addEventListener() {},
  };
  const frames = new Map();
  let id = 0;
  let fits = true;
  const sandbox = vm.createContext({
    ...drawing,
    drawingFits: (...args) => fits && drawing.drawingFits(...args),
    devicePixelRatio: 2,
    Path2D: class {},
    requestAnimationFrame: (fn) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (key) => frames.delete(key),
    document: { createElement: () => canvas, addEventListener() {} },
  });
  vm.runInContext(code, sandbox);
  const api = sandbox.drawingPad(el);
  const event = (x, pointerId = 1) => ({ clientX: x, clientY: 100, pointerId, pointerType: "pen", pressure: 0.5, button: 0 });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); };
  return { api, canvas, undo, clear, event, flush, frames, meter, reject: () => { fits = false; } };
}

test("the pad batches moves and keeps completed drawings through undo and clear", () => {
  const p = pad();
  p.canvas.onpointerdown(p.event(10));
  p.canvas.onpointermove(p.event(20));
  p.canvas.onpointermove(p.event(30));
  assert.equal(p.frames.size, 1);
  p.flush();
  p.canvas.onpointerup(p.event(40));
  const first = JSON.stringify(p.api.shapes());
  assert.ok(first.length > 10);
  p.canvas.onpointerdown(p.event(60));
  p.canvas.onpointerup(p.event(80));
  assert.equal(p.api.shapes().length, 2);
  p.undo.onclick();
  assert.equal(JSON.stringify(p.api.shapes()), first);
  p.clear.onclick();
  assert.equal(p.api.shapes().length, 0);
});

test("a full pad preserves the last accepted stroke preview", () => {
  const p = pad();
  p.canvas.onpointerdown(p.event(10));
  p.canvas.onpointermove(p.event(30));
  p.flush();
  p.reject();
  p.canvas.onpointermove(p.event(100));
  p.flush();
  p.canvas.onpointerup(p.event(150));
  assert.equal(p.api.shapes().length, 1);
  assert.ok(drawing.parseDrawing(JSON.stringify(p.api.shapes())));
});

test("another pointer cannot replace or finish the active stroke", () => {
  const p = pad();
  p.canvas.onpointerdown(p.event(10));
  p.canvas.onpointerdown(p.event(100, 2));
  p.canvas.onpointerup(p.event(120, 2));
  p.canvas.onpointermove(p.event(30));
  p.canvas.onpointerup(p.event(50));
  assert.equal(p.api.shapes().length, 1);
  assert.equal(p.frames.size, 0);
});

test("the active stroke bound preserves ink and allows the next stroke", () => {
  const p = pad();
  p.canvas.onpointerdown(p.event(10));
  for (let i = 0; i < drawing.MAX_STROKE_POINTS + 20; i++) p.canvas.onpointermove(p.event(10 + i % 300));
  p.canvas.onpointerup(p.event(40));
  assert.equal(p.api.shapes().length, 1);
  assert.equal(p.frames.size, 0);
  p.canvas.onpointerdown(p.event(50));
  p.canvas.onpointerup(p.event(60));
  assert.equal(p.api.shapes().length, 2);
});
