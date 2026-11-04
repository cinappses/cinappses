import { getStroke } from "perfect-freehand";
import simplify from "simplify-js";

export const WIDTH = 360;
export const HEIGHT = 240;
export const PALETTE = [
  ["black", "#1d1410"],
  ["red", "#d6402b"],
  ["orange", "#f1a164"],
  ["yellow", "#f4c542"],
  ["green", "#4f9a48"],
  ["blue", "#3b6cc4"],
  ["purple", "#8b5bb5"],
  ["pink", "#f08fb4"],
  ["eraser", "#ffffff"],
] as const;
export const ERASER = PALETTE.length - 1;
export const SIZES = [4, 8, 18];
export const MAX_SHAPES = 5000;
export const MAX_POINTS = 100_000;
export const MAX_DRAWING_BYTES = 512_000;
export const MAX_STROKE_POINTS = 4096;

export type Stroke = { color: number; size: number; points: number[][] };
export type Entry = { id: number; name: string; site: string | null; message: string | null; drawn: number; created: number };
export const ENTRY_COLUMNS = "id, name, site, message, created, drawing is not null as drawn";
export type Database = {
  prepare(sql: string): {
    bind(...values: unknown[]): Statement;
  } & Statement;
};
type Statement = {
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
};

const average = (a: number, b: number) => (a + b) / 2;

export function strokePath(stroke: Stroke) {
  const thinning = stroke.color === ERASER ? 0 : 0.6;
  const outline = getStroke(stroke.points, { size: SIZES[stroke.size], thinning, simulatePressure: false });
  const points = simplify(outline.map(([x, y]) => ({ x, y })), 0.25, true);
  if (points.length < 4) return "";
  const pair = (x: number, y: number) => `${decimal(x)},${decimal(y)}`;
  const [a, b, c] = points;
  let end = [tenths(average(b.x, c.x)), tenths(average(b.y, c.y))];
  const start = `M${pair(a.x, a.y)}Q${pair(b.x, b.y)} ${pair(end[0] / 10, end[1] / 10)}`;
  const absolute: string[] = [];
  const relative: string[] = [];
  for (let i = 2; i < points.length - 1; i++) {
    const next = [tenths(average(points[i].x, points[i + 1].x)), tenths(average(points[i].y, points[i + 1].y))];
    absolute.push(pair(next[0] / 10, next[1] / 10));
    relative.push(pair((next[0] - end[0]) / 10, (next[1] - end[1]) / 10));
    end = next;
  }
  const abs = `T${absolute.join(" ")}`;
  const rel = `t${relative.join(" ")}`;
  return `${start}${rel.length < abs.length ? rel : abs}Z`;
}

const tenths = (n: number) => Math.round(Number(n.toFixed(1)) * 10);

const decimal = (n: number) => Number(n.toFixed(1)).toString().replace(/^(-?)0\./, "$1.");

export const pathPoints = (d: string) => d.split(",").length - 1;

export type Shape = { color: number; d: string };

export const shapeBytes = (shape: Shape) => JSON.stringify(shape).length;

export function drawingUsage(shapes: Shape[]) {
  return shapes.reduce((usage, shape) => ({
    bytes: usage.bytes + shapeBytes(shape) + (usage.shapes ? 1 : 0),
    points: usage.points + pathPoints(shape.d),
    shapes: usage.shapes + 1,
  }), { bytes: 2, points: 0, shapes: 0 });
}

export function drawingFits(usage: ReturnType<typeof drawingUsage>, shape: Shape) {
  return usage.shapes < MAX_SHAPES && usage.points + pathPoints(shape.d) <= MAX_POINTS &&
    usage.bytes + shapeBytes(shape) + (usage.shapes ? 1 : 0) <= MAX_DRAWING_BYTES;
}

const NUMBER = String.raw`-?(?:\d{1,3}(?:\.\d)?|\.\d)`;
const POINT = `${NUMBER},${NUMBER}`;
const PATH = new RegExp(`^M${POINT} ?Q${POINT} ${POINT} ?[Tt](?:${POINT}(?: ${POINT})* ?)?Z$`);

const isShape = (shape: Shape) =>
  Number.isInteger(shape?.color) && shape.color >= 0 && shape.color < PALETTE.length && typeof shape.d === "string" && PATH.test(shape.d);

const isDrawing = (shapes: unknown): shapes is Shape[] =>
  Array.isArray(shapes) &&
  shapes.length > 0 &&
  shapes.length <= MAX_SHAPES &&
  shapes.every(isShape) &&
  shapes.reduce((total, shape) => total + pathPoints(shape.d), 0) <= MAX_POINTS;

export function parseDrawing(raw: string): Shape[] | null {
  if (!raw || raw.length > MAX_DRAWING_BYTES) return null;
  try {
    const shapes = JSON.parse(raw);
    return isDrawing(shapes) ? shapes.map(({ color, d }) => ({ color, d })) : null;
  } catch {
    return null;
  }
}

export const svg = (shapes: Shape[]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>${shapes.map((s) => `<path d="${s.d}" fill="${PALETTE[s.color][1]}"/>`).join("")}</svg>`;

export async function listEntries(db: Database) {
  const { results } = await db.prepare(`select ${ENTRY_COLUMNS} from entries order by created desc`).all<Entry>();
  return results;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function entryHtml(entry: Entry) {
  const name = escape(entry.name);
  const who = entry.site ? `<a href="${escape(entry.site)}" rel="nofollow ugc">${name}</a>` : name;
  const date = new Date(entry.created).toLocaleDateString("en-US", { timeZone: "UTC" });
  const message = entry.message ? `<p>${escape(entry.message)}</p>` : "";
  const art = entry.drawn ? `<img class="art" src="/api/drawing/${entry.id}" alt="drawing by ${name}" width="${WIDTH}" height="${HEIGHT}" loading="lazy">` : "";
  return `<article><p><b>${who}</b> <small>${date}</small></p>${message}${art}</article>`;
}

const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u2800\u3164\ufeff\uffa0]/g;

function clip(text: string, max: number) {
  let out = "";
  let count = 0;
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    if (count++ === max) break;
    out += segment;
  }
  return out;
}

const clean = (text: string) =>
  text
    .slice(0, 5000)
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(INVISIBLE, "")
    .replace(/(\p{M}{8})\p{M}+/gu, "$1");

export const cleanName = (raw: string) => clip(clean(raw).replace(/\s+/g, " ").trim(), 40);

export const cleanMessage = (raw: string) =>
  clip(
    clean(raw)
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    1000,
  );

export function cleanSite(raw: string) {
  const text = raw.trim();
  const url = URL.canParse(text) ? new URL(text) : null;
  const ok = url && /^https?:$/.test(url.protocol) && !url.username && !url.password && url.href.length <= 200;
  return ok ? url.href : null;
}

const field = (form: FormData, key: string) => String(form.get(key) ?? "");

export function readEntry(form: FormData) {
  const name = cleanName(field(form, "name"));
  const message = cleanMessage(field(form, "message"));
  const shapes = parseDrawing(field(form, "drawing"));
  if (!name || field(form, "phone").trim() || (!message && !shapes)) return null;
  return {
    name,
    site: cleanSite(field(form, "site")),
    message: message || null,
    drawing: shapes && svg(shapes),
  };
}
