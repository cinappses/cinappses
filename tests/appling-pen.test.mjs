import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const page = await readFile(new URL("../src/pages/about.astro", import.meta.url), "utf8");
const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];
const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function pen({ calm = false } = {}) {
  const node = () => ({ style: {}, dataset: { name: "a", link: "" }, parentElement: {}, querySelector: () => node(), setPointerCapture() {} });
  const buttons = [node(), node(), node()];
  const box = {
    clientWidth: 600,
    clientHeight: 440,
    style: {},
    querySelector: () => node(),
    querySelectorAll: () => buttons,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const frames = [];
  let load;
  let observed;
  vm.runInContext(code, vm.createContext({
    performance,
    matchMedia: () => ({ matches: calm }),
    getComputedStyle: () => ({ getPropertyValue: (name) => (name === "--size" ? "56px" : "12px") }),
    requestAnimationFrame: (fn) => frames.push(fn),
    IntersectionObserver: class { constructor(fn) { observed = fn; } observe() {} disconnect() {} },
    document: {
      querySelector: (selector) => (selector === ".pen" ? box : node()),
      addEventListener: (name, fn) => { if (name === "astro:page-load") load = fn; },
    },
  }));
  load();
  const flush = (limit = 1000) => {
    let count = 0;
    while (frames.length && count < limit) { frames.shift()(); count++; }
    return count;
  };
  const at = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, pointerType: "touch" });
  const spot = (b) => b.style.transform;
  const show = (isIntersecting) => observed([{ isIntersecting }]);
  return { el: buttons[0], frames, flush, at, spot, show };
}

const key = (k) => ({ key: k, preventDefault() {} });

test("a cancelled touch drops the appling and lets the loop stop", () => {
  const p = pen();
  p.el.onpointerdown(p.at(40, 40));
  p.el.onpointermove(p.at(80, 40));
  p.flush(5);
  p.el.onpointercancel();
  assert.ok(p.flush() < 1000);
  assert.equal(p.frames.length, 0);
});

test("arrow keys fling the focused appling", () => {
  const p = pen();
  const before = p.spot(p.el);
  p.el.onkeydown(key("ArrowRight"));
  assert.ok(p.flush() > 1);
  assert.notEqual(p.spot(p.el), before);
});

test("the pen pauses offscreen and resumes when it comes back", () => {
  const p = pen();
  p.el.onkeydown(key("ArrowDown"));
  p.flush(2);
  p.show(false);
  assert.equal(p.flush(), 1);
  const paused = p.spot(p.el);
  p.el.onkeydown(key("ArrowDown"));
  assert.equal(p.frames.length, 0);
  p.show(true);
  assert.ok(p.flush() > 1);
  assert.notEqual(p.spot(p.el), paused);
});

test("reduced motion settles a fling quickly", () => {
  const full = pen();
  const calm = pen({ calm: true });
  full.el.onkeydown(key("ArrowRight"));
  calm.el.onkeydown(key("ArrowRight"));
  assert.ok(calm.flush() < 20);
  assert.ok(full.flush() > 100);
});
