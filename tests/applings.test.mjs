import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

test("applings fall back to a site asset when their image is absent or cleared", async () => {
  const root = process.env.TEST_FIXTURE;
  const html = await readFile(join(root, "dist/about.html"), "utf8");
  const rendered = new Map([...html.matchAll(/<button\b[^>]*data-name="([^"]+)"[^>]*>\s*<img\b[^>]*src="([^"]+)"/g)]
    .map((match) => [match[1], match[2]]));

  assert.equal(rendered.size, 4);
  assert.match(rendered.get("missing"), /appling-placeholder/);
  assert.equal(rendered.get("empty"), rendered.get("missing"));
  assert.equal(rendered.get("null"), rendered.get("missing"));
  assert.ok(rendered.get("custom"));
  assert.notEqual(rendered.get("custom"), rendered.get("missing"));
  for (const src of new Set(rendered.values())) {
    assert.ok((await readFile(join(root, "dist", src))).length);
  }
});
