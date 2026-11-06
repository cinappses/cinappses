import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

test("built pages keep their accessibility markup", async () => {
  const out = join(process.env.TEST_FIXTURE, "dist");

  const pages = (await readdir(out, { recursive: true })).filter((path) => path.endsWith(".html") && !path.startsWith("admin"));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = await readFile(join(out, page), "utf8");
    assert.match(html, /<a class="skip" href="#content">/, page);
    assert.match(html, /<main [^>]*id="content" tabindex="0">/, page);
    assert.doesNotMatch(html, /href="javascript:/, page);
  }

  const gallery = await readFile(join(out, "gallery.html"), "utf8");
  assert.match(gallery, /<dialog aria-labelledby="caption">/);
  assert.match(gallery, /<form method="dialog"><button class="close">close<\/button><\/form>/);

  const guestbook = await readFile(join(out, "guestbook.html"), "utf8");
  assert.match(guestbook, /name="name"[^>]*autocomplete="name"/);
  assert.match(guestbook, /name="site"[^>]*autocomplete="url"/);
  assert.match(guestbook, /class="oops" role="status"/);

  const about = await readFile(join(out, "about.html"), "utf8");
  assert.match(about, /<div aria-live="polite"><p class="recent"/);

  const lost = await readFile(join(out, "404.html"), "utf8");
  assert.match(lost, /<title>not found \| cinappses<\/title>/);
});
