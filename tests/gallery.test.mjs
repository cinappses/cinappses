import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";

test("gallery builds responsive images with inline placeholders", async () => {
  const root = process.env.TEST_FIXTURE;
  const originals = new Map([["portrait", { width: 1400, height: 2800 }], ["landscape", { width: 2800, height: 1400 }], ["small", { width: 200, height: 300 }]]);
  const html = await readFile(join(root, "dist/gallery.html"), "utf8");
  const filters = [...html.matchAll(/data-tag="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(filters, ["", "illustration", "comic"]);
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
  assert.match(await readFile(join(root, "dist/_headers"), "utf8"),
    /^\/_astro\/\*\n  Cache-Control: public, max-age=31536000, immutable\n/);
});
