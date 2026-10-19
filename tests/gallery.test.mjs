import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

test("gallery builds responsive images with inline placeholders", async (t) => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const root = await mkdtemp(join(project, "node_modules/.gallery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["src", "public", "package.json", "astro.config.mjs", "tsconfig.json"]) {
    await cp(join(project, path), join(root, path), { recursive: true });
  }
  const art = join(root, "src/content/art");
  await rm(art, { recursive: true });
  await mkdir(join(art, "img"), { recursive: true });

  const originals = new Map();
  for (const [name, width, height, format] of [
    ["portrait", 1400, 2800, "png"],
    ["landscape", 2800, 1400, "jpeg"],
    ["small", 200, 300, "png"],
  ]) {
    const original = await sharp({ create: { width, height, channels: 4, background: "#f1a164" } })
      .toFormat(format).toBuffer();
    originals.set(name, { width, height });
    await writeFile(join(art, `img/${name}.${format}`), original);
    await writeFile(join(art, `${name}.md`), `---\ntitle: ${name}\nimage: img/${name}.${format}\ndate: 2026-10-18\n---\n`);
  }
  await run(process.execPath, [join(project, "node_modules/astro/bin/astro.mjs"), "build"], {
    cwd: root,
    timeout: 90_000,
  });

  const html = await readFile(join(root, "dist/gallery.html"), "utf8");
  const buttons = [...html.matchAll(/<button\b[^>]*data-full="[^"]+"[^>]*>/g)];
  assert.equal(buttons.length, originals.size);
  for (const [button] of buttons) {
    const attrs = Object.fromEntries([...button.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const { width, height } = originals.get(attrs["data-cap"]);
    const [, placeholder] = attrs["data-placeholder"].match(/^data:image\/webp;base64,(.+)$/);
    const tiny = await sharp(Buffer.from(placeholder, "base64")).metadata();
    assert.equal(tiny.format, "webp");
    assert.equal(Math.max(tiny.width, tiny.height), Math.min(24, Math.max(width, height)));
    assert.ok(Math.abs(tiny.width / tiny.height - width / height) < 0.1);
    const candidates = attrs["data-srcset"].split(", ");
    assert.ok(candidates.length > 0);
    for (const candidate of candidates) {
      const [url, descriptor] = candidate.split(" ");
      const metadata = await sharp(await readFile(join(root, "dist", url))).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(metadata.width, Number.parseInt(descriptor));
      assert.ok(metadata.width <= width);
      assert.ok(metadata.height <= height);
      assert.ok(Math.max(metadata.width, metadata.height) <= 2401);
      assert.ok(Math.abs(metadata.width / metadata.height - width / height) < 0.01);
    }
    if (width < 800) assert.equal(candidates.length, 1);
    assert.match(attrs["data-sizes"], /vh/);
  }
  const thumbnails = [...html.matchAll(/<img\b[^>]*srcset="[^"]+"[^>]*>/g)];
  assert.equal(thumbnails.length, originals.size);
  for (const [thumbnail] of thumbnails) {
    const srcset = thumbnail.match(/srcset="([^"]+)"/)[1];
    for (const candidate of srcset.split(", ")) {
      const [url, descriptor] = candidate.split(" ");
      const metadata = await sharp(await readFile(join(root, "dist", url))).metadata();
      assert.equal(metadata.width, Number.parseInt(descriptor));
      assert.equal(metadata.width, metadata.height);
    }
  }
  assert.doesNotMatch(html, /download/);
  assert.equal(await readFile(join(root, "dist/_headers"), "utf8"),
    "/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n");
});
