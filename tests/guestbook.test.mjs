import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { onRequestGet as adminGet, onRequestPost as adminPost } from "../functions/admin/guestbook.ts";
import { onRequestGet as drawing } from "../functions/api/drawing/[id].ts";
import { onRequestPost as sign } from "../functions/api/sign.ts";
import { onRequestGet as guestbook } from "../functions/guestbook.ts";
import { ERASER, MAX_DRAWING_BYTES, MAX_POINTS, MAX_SHAPES, drawingFits, drawingUsage, cleanMessage, cleanName, cleanSite, entryHtml, parseDrawing, pathPoints, readEntry, strokePath, svg } from "../src/lib/guestbook.ts";

async function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(await readFile(new URL("../migrations/0001_entries.sql", import.meta.url), "utf8"));
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    first: async () => db.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...values) }),
    run: async () => db.prepare(sql).run(...values),
  });
  return { prepare: (sql) => statement(sql) };
}

const form = (fields) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

const post = (fields, headers = {}) =>
  new Request("https://cinappses.org/api/sign", { method: "POST", body: form(fields), headers });

const page = async () => new Response('<main><div class="entries"></div></main>', { headers: { etag: "abc" } });

const dot = JSON.stringify([{ color: 0, d: strokePath({ color: 0, size: 0, points: [[1, 1, 0.5]] }) }]);

test("drawings are validated before they are stored", () => {
  const shape = { color: 3, d: "M1.5,2.0 Q3.0,4.0 5.0,6.0 T7.0,-8.0 9.0,10.0 Z" };
  assert.deepEqual(parseDrawing(JSON.stringify([{ ...shape, extra: "<script>" }])), [shape]);
  const bad = [
    {},
    { color: 9, d: shape.d },
    { color: -1, d: shape.d },
    { color: 0.5, d: shape.d },
    { color: "0", d: shape.d },
    { color: 0, d: "" },
    { color: 0, d: 5 },
    { color: 0, d: 'M1,1 Z"/><script>alert(1)</script><path d="Z' },
    { color: 0, d: "M1.0,1.0 L5.0,5.0 Z" },
    { color: 0, d: "M1.0,1.0 Q2.0,2.0 3.0,3.0" },
    { color: 0, d: "M1000.0,1.0 Q2.0,2.0 3.0,3.0 TZ" },
    { color: 0, d: "M1.25,1.0 Q2.0,2.0 3.0,3.0 TZ" },
    { color: 0, d: "M1.0,1.0 Q2.0,2.0 3.0,3.0 T4.0,4.0  Z" },
  ];
  for (const item of bad) assert.equal(parseDrawing(JSON.stringify([item])), null, JSON.stringify(item));
  for (const raw of ["", "nope", "[]", "{}", "[null]", "[1]"]) assert.equal(parseDrawing(raw), null, raw);
  assert.equal(parseDrawing(JSON.stringify(Array(MAX_SHAPES + 1).fill(shape))), null);
  assert.equal(parseDrawing(JSON.stringify(Array(MAX_SHAPES).fill(shape))).length, MAX_SHAPES);
  const heavy = { color: 0, d: `M1,1Q2,2 3,3T${"4,4 ".repeat(MAX_POINTS / 4 - 3)}Z` };
  assert.equal(pathPoints(heavy.d), MAX_POINTS / 4);
  assert.equal(parseDrawing(JSON.stringify(Array(4).fill(heavy))).length, 4);
  assert.equal(parseDrawing(JSON.stringify([...Array(4).fill(heavy), shape])), null);
});

test("pen pressure changes the stroke width", () => {
  const width = (pressure) => {
    const d = strokePath({ color: 0, size: 2, points: [[20, 100, pressure], [180, 100, pressure], [340, 100, pressure]] });
    const ys = coordinates(d).map((point) => point[1]);
    return Math.max(...ys) - Math.min(...ys);
  };
  assert.ok(width(1) > width(0.5) * 1.3);
  assert.ok(width(0.1) < width(0.5) * 0.7);
});

test("strokes are simplified and the eraser ignores pressure", () => {
  const line = Array.from({ length: 100 }, (_, i) => [20 + i * 3, 120, 0.5]);
  assert.ok(pathPoints(strokePath({ color: 0, size: 1, points: line })) < 40);
  const erase = (pressure) => strokePath({ color: ERASER, size: 1, points: line.map(([x, y]) => [x, y, pressure]) });
  assert.equal(erase(0.1), erase(1));
  assert.equal(svg([{ color: ERASER, d: "M1.0,1.0 Q2.0,2.0 3.0,3.0 TZ" }]).match(/fill="#ffffff"/g).length, 1);
});

test("names, messages and websites are cleaned up", () => {
  assert.equal(cleanName("  pip\n\tthe \u202egreat\u200b  "), "pip the great");
  assert.equal(cleanName("a\u0000b\u0007c\u007f"), "abc");
  assert.equal(cleanName("e\u0301"), "\u00e9");
  assert.equal(cleanName(`z${"\u0336".repeat(40)}`), `z${"\u0336".repeat(8)}`);
  assert.equal(cleanName("\u1019\u103b\u103e\u1031\u102c\u103a"), "\u1019\u103b\u103e\u1031\u102c\u103a");
  assert.equal(cleanName("\u3164\u2800\uffa0"), "");
  assert.equal(cleanName("\u{1F469}\u200d\u{1F467}"), "\u{1F469}\u200d\u{1F467}");
  assert.equal(cleanName("\u{1F338}".repeat(50)), "\u{1F338}".repeat(40));
  assert.equal(cleanName("\u200b\u2066 "), "");

  assert.equal(cleanMessage("hi  \r\nthere\r\n\r\n\r\n\r\n\r\nbye\t!  "), "hi\nthere\n\nbye !");
  assert.equal(cleanMessage("x".repeat(5000)).length, 1000);
  assert.equal(cleanMessage("\n\n  \n"), "");
  const start = performance.now();
  cleanMessage(`a${" ".repeat(4998)}b`);
  assert.ok(performance.now() - start < 20);

  assert.equal(cleanSite(" https://pip.neocities.org "), "https://pip.neocities.org/");
  assert.equal(cleanSite("HTTP://Pip.org/a b"), "http://pip.org/a%20b");
  for (const bad of ["", "pip.neocities.org", "javascript:alert(1)", "data:text/html,hi", "ftp://pip.org", "https://me:pw@pip.org", `https://pip.org/${"a".repeat(200)}`]) {
    assert.equal(cleanSite(bad), null, bad);
  }
});

test("drawings render as filled svg paths", () => {
  assert.equal(
    svg([{ color: 1, d: "M1,2 Q3,4 5,6 TZ" }]),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240"><rect width="360" height="240" fill="#fff"/><path d="M1,2 Q3,4 5,6 TZ" fill="#d6402b"/></svg>',
  );
  assert.match(JSON.parse(dot)[0].d, /^M[-\d., QTt]+Z$/);
});

test("entries need a name and a message or a drawing", () => {
  assert.equal(readEntry(form({ name: "pip" })), null);
  assert.equal(readEntry(form({ message: "hi" })), null);
  assert.equal(readEntry(form({ name: "pip", message: "hi", phone: "1" })), null);
  assert.equal(readEntry(form({ name: "pip", drawing: "[[0,0,1]]" })), null);
  assert.deepEqual(readEntry(form({ name: " pip ", message: "hi", site: "javascript:alert(1)" })), { name: "pip", site: null, message: "hi", drawing: null });
  assert.equal(readEntry(form({ name: "\u200b", message: "hi" })), null);
  assert.equal(readEntry(form({ name: "pip", message: "\u202e\n" })), null);
  assert.deepEqual(readEntry(form({ name: "pip", site: "https://pip.neocities.org", drawing: dot })), {
    name: "pip",
    site: "https://pip.neocities.org/",
    message: null,
    drawing: svg(JSON.parse(dot)),
  });
  assert.equal(readEntry(form({ name: "x".repeat(99), message: "y".repeat(2000) })).name.length, 40);
  assert.equal(readEntry(form({ name: "pip", message: "hi", site: "https://pip.org" })).site, "https://pip.org/");
});

test("entry markup escapes everything visitors write", () => {
  const html = entryHtml({ id: 1, name: '<b>"pip"</b>', site: 'https://x.org/"><script>', message: "<script>hi</script>", drawn: 0, created: Date.UTC(2026, 9, 20) });
  assert.doesNotMatch(html, /<script>|<b>"/);
  assert.match(html, /href="https:\/\/x.org\/&#34;&#62;&#60;script&#62;"/);
  assert.match(html, /<small>10\/20\/2026<\/small>/);
  assert.equal(
    entryHtml({ id: 2, name: '"pip"', site: null, message: null, drawn: 1, created: 0 }),
    '<article><p><b>&#34;pip&#34;</b> <small>1/1/1970</small></p><img class="art" src="/api/drawing/2" alt="drawing by &#34;pip&#34;" width="360" height="240" loading="lazy"></article>',
  );
});

test("signing stores the entry and shows it on the guestbook", async () => {
  const DB = await database();
  const added = await sign({ request: post({ name: "pip", message: "hi" }, { "x-fragment": "1" }), env: { DB } });
  assert.equal(added.status, 201);
  assert.match(await added.text(), /^<article><p><b>pip<\/b>.*<p>hi<\/p><\/article>$/);

  const plain = await sign({ request: post({ name: "kiwi", drawing: JSON.stringify([{ color: 3, d: "M10.0,10.0 Q12.0,12.0 14.0,14.0 TZ" }]) }), env: { DB } });
  assert.equal(plain.status, 303);
  assert.equal(plain.headers.get("location"), "https://cinappses.org/guestbook");

  assert.equal((await sign({ request: post({ name: "x" }, { "x-fragment": "1" }), env: { DB } })).status, 400);
  assert.equal((await sign({ request: post({ name: "x" }), env: { DB } })).status, 303);

  await sign({ request: post({ name: "tricky", message: "costs $' and $` and $&" }), env: { DB } });
  const res = await guestbook({ request: new Request("https://cinappses.org/guestbook"), env: { DB }, next: page });
  const html = await res.text();
  assert.equal(res.headers.get("etag"), null);
  assert.equal(html.match(/<article>/g).length, 3);
  assert.match(html, /<p>costs \$&#39; and \$` and \$&#38;<\/p>/);
  assert.equal(html.match(/<main>/g).length, 1);
  assert.ok(html.indexOf("tricky") < html.indexOf("kiwi") && html.indexOf("kiwi") < html.indexOf("pip"));
  assert.match(html, /<img class="art" src="\/api\/drawing\/2"/);
  assert.doesNotMatch(html, /<svg|<path/);

  const art = await drawing({ params: { id: "2" }, env: { DB } });
  assert.equal(art.headers.get("content-type"), "image/svg+xml");
  assert.match(art.headers.get("cache-control"), /immutable/);
  assert.match(await art.text(), /^<svg .*fill="#f4c542"\/><\/svg>$/);
  assert.equal((await drawing({ params: { id: "1" }, env: { DB } })).status, 404);
  assert.equal((await drawing({ params: { id: "nope" }, env: { DB } })).status, 404);
});

test("the admin page deletes entries only for people who can push to the repo", async (t) => {
  const DB = await database();
  await sign({ request: post({ name: "spam", message: "buy" }), env: { DB } });
  const env = { DB };
  const url = "https://cinappses.org/admin/guestbook";
  const tokens = { luci: { permissions: { push: true } }, fan: { permissions: { push: false } } };
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    seen.push(String(input));
    const repo = tokens[new Headers(init.headers).get("authorization").replace("Bearer ", "")];
    return repo ? Response.json(repo) : new Response(null, { status: 401 });
  };
  t.after(() => (globalThis.fetch = realFetch));

  const list = await adminGet({ request: new Request(url), env });
  assert.match(await list.text(), /spam.*<button name="id" value="1">delete<\/button>/);

  const remove = (headers) => adminPost({ request: new Request(url, { method: "POST", body: form({ id: "1" }), headers }), env });
  const count = async () => (await DB.prepare("select count(*) n from entries").first()).n;
  assert.equal((await remove({})).status, 403);
  assert.equal((await remove({ authorization: "Basic bHVjaQ==" })).status, 403);
  assert.equal((await remove({ authorization: "Bearer nobody" })).status, 403);
  assert.equal((await remove({ authorization: "Bearer fan" })).status, 403);
  assert.equal(await count(), 1);
  assert.equal((await remove({ authorization: "Bearer luci" })).status, 204);
  assert.equal(await count(), 0);
  assert.ok(seen.every((u) => u === "https://api.github.com/repos/cinappses/cinappses"));
  await sign({ request: post({ name: "next", message: "hi" }), env: { DB } });
  assert.equal((await DB.prepare("select id from entries").first()).id, 2);
});

function coordinates(d) {
  let command = "";
  let end = [0, 0];
  return [...d.matchAll(/([MQTt]?)\s*(-?(?:\d+(?:\.\d)?|\.\d)),(-?(?:\d+(?:\.\d)?|\.\d))/g)].map((match) => {
    command = match[1] || command;
    const pair = [Number(match[2]), Number(match[3])];
    end = command === "t" ? pair.map((n, i) => Math.round((n + end[i]) * 10) / 10) : pair;
    return end;
  });
}

test("drawing capacity uses the same serialized budget as validation", () => {
  const shape = JSON.parse(dot)[0];
  const shapes = Array(1000).fill(shape);
  assert.equal(drawingUsage(shapes).bytes, JSON.stringify(shapes).length);
  assert.ok(parseDrawing(JSON.stringify(shapes)));
  const usage = drawingUsage(shapes);
  assert.ok(drawingFits(usage, shape));
  assert.equal(drawingFits({ ...usage, bytes: MAX_DRAWING_BYTES }, shape), false);
  assert.equal(drawingFits({ ...usage, points: MAX_POINTS }, shape), false);
  assert.equal(drawingFits({ ...usage, shapes: MAX_SHAPES }, shape), false);
  assert.equal(parseDrawing(" ".repeat(MAX_DRAWING_BYTES + 1)), null);
  assert.equal(parseDrawing(JSON.stringify([{ color: 0, d: "M.1,-.2Q3,4 5,6t-.5,.5 1,-1Z" }] )).length, 1);
});

test("compacted paths preserve every original coordinate", async () => {
  const { getStroke } = await import("perfect-freehand");
  const { default: simplify } = await import("simplify-js");
  for (let sample = 0; sample < 30; sample++) {
    const stroke = {
      color: sample % 9,
      size: sample % 3,
      points: Array.from({ length: 100 }, (_, i) => [
        180 + Math.sin(i * (sample + 1) / 30) * 170,
        120 + Math.cos(i / 10) * 110,
        (Math.sin(i / 5) + 1) / 2,
      ]),
    };
    const outline = getStroke(stroke.points, { size: [4, 8, 18][stroke.size], thinning: stroke.color === ERASER ? 0 : 0.6, simulatePressure: false });
    const points = simplify(outline.map(([x, y]) => ({ x, y })), 0.25, true);
    const round = (n) => Number(n.toFixed(1)) || 0;
    const expected = [[points[0].x, points[0].y], [points[1].x, points[1].y]];
    for (let i = 1; i < points.length - 1; i++) expected.push([(points[i].x + points[i + 1].x) / 2, (points[i].y + points[i + 1].y) / 2]);
    const d = strokePath(stroke);
    assert.deepEqual(coordinates(d), expected.map((pair) => pair.map(round)));
    assert.ok(parseDrawing(JSON.stringify([{ color: stroke.color, d }])));
  }
});

test("compressed storage round-trips drawings and preserves legacy entries", async () => {
  const { packDrawing, unpackDrawing } = await import("../src/lib/drawing-storage.ts");
  const art = svg(Array(1000).fill(JSON.parse(dot)[0]));
  const packed = await packDrawing(art);
  assert.ok(packed.length < art.length / 4);
  assert.equal(await unpackDrawing(packed), art);
  assert.equal(await unpackDrawing(art), art);
  assert.equal(await packDrawing("tiny"), "tiny");

  const DB = await database();
  const res = await sign({ request: post({ name: "pip", drawing: JSON.stringify(Array(1000).fill(JSON.parse(dot)[0])) }, { "x-fragment": "1" }), env: { DB } });
  assert.equal(res.status, 201);
  const stored = await DB.prepare("select drawing from entries where id = 1").first();
  assert.match(stored.drawing, /^gzip:/);
  const served = await drawing({ params: { id: "1" }, env: { DB } });
  assert.equal(await served.text(), art);
});
