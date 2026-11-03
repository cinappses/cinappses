import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { photo, photos } from "../public/admin/photos.js";

const run = promisify(execFile);

const parse = (markdown, component = photos) => component.fromBlock(markdown.match(component.pattern)).board;
const block = (board, component = photos) => component.toBlock({ board });

test("photos block survives a round trip through the editor", () => {
  const value = {
    layout: "grid",
    size: "medium",
    photos: [
      { image: "img/one.png", caption: "a [tricky] *caption* \\ _with_ `marks` & <b>" },
      { image: "/uploads/my file.png", caption: "" },
    ],
  };
  const markdown = block(value);
  assert.deepEqual(parse(`before\n\n${markdown}\n\nafter`), value);
  assert.equal(block(parse(markdown)), markdown);
});

test("photo and photos blocks only match their own layouts", () => {
  const single = block({ layout: "right", size: "medium", photos: [{ image: "img/a.png", caption: "a" }] }, photo);
  const many = block({ layout: "grid", size: "small", photos: [{ image: "img/a.png", caption: "" }] });
  assert.match(single, photo.pattern);
  assert.doesNotMatch(single, photos.pattern);
  assert.match(many, photos.pattern);
  assert.doesNotMatch(many, photo.pattern);
  assert.equal(parse(single, photo).layout, "right");
});

test("empty blocks fall back to each component's default layout", () => {
  assert.match(block({}, photo), /data-layout="center"/);
  const markdown = block({});
  assert.equal(markdown, '<div class="photos" data-layout="row" data-size="large">\n\n</div>');
  assert.deepEqual(parse(markdown), { layout: "row", size: "large", photos: [] });
});

test("photos block skips entries without an image", () => {
  const markdown = block({ photos: [{ caption: "nothing yet" }, { image: "img/a.png" }] });
  assert.deepEqual(parse(markdown).photos, [{ image: "img/a.png", caption: "" }]);
});

test("built posts turn photos blocks into captioned figures", async (t) => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const root = await mkdtemp(join(project, "node_modules/.photos-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["src", "public", "package.json", "astro.config.mjs", "tsconfig.json"]) {
    await cp(join(project, path), join(root, path), { recursive: true });
  }

  const posts = join(root, "src/content/posts");
  await mkdir(join(posts, "img"), { recursive: true });
  await mkdir(join(root, "public/uploads"), { recursive: true });
  const image = (width, height) => sharp({ create: { width, height, channels: 3, background: "#9cc59a" } }).png();
  await image(600, 300).jpeg().withMetadata({ orientation: 6 }).toFile(join(posts, "img/tall.jpg"));
  await image(800, 400).toFile(join(root, "public/uploads/wide.png"));

  const markdown = block({
    layout: "row",
    size: "large",
    photos: [
      { image: "img/tall.jpg", caption: "tall *one*" },
      { image: "/uploads/wide.png", caption: "" },
    ],
  });
  await writeFile(join(posts, "photos.md"), `---\ntitle: photos\ndate: 2026-11-03\n---\n![plain](img/tall.jpg)\n\n${markdown}\n`);

  await run(process.execPath, [join(project, "node_modules/astro/bin/astro.mjs"), "build"], { cwd: root, timeout: 120_000 });
  const html = await readFile(join(root, "dist/blog/photos.html"), "utf8");
  const [, inside] = html.match(/<div class="photos" data-layout="row" data-size="large">([\s\S]*?)<\/div>/);
  const figures = [...inside.matchAll(/<figure style="--r: ([\d.]+)">([\s\S]*?)<\/figure>/g)];

  assert.equal(figures.length, 2);
  assert.equal(figures[0][1], "0.500");
  assert.match(figures[0][2], /<img[^>]+src="\/_astro\/tall\.[^"]+"/);
  assert.match(figures[0][2], /<figcaption>tall \*one\*<\/figcaption>/);
  assert.equal(figures[1][1], "2.000");
  assert.match(figures[1][2], /src="\/uploads\/wide\.png"/);
  assert.doesNotMatch(figures[1][2], /figcaption/);
  assert.doesNotMatch(inside, /<p>/);
  assert.match(html, /<p><img[^>]+alt="plain"/);
});
