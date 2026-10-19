import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

test("built pages keep their accessibility markup", async (t) => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const out = await mkdtemp(join(project, "node_modules/.a11y-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await run(process.execPath, [join(project, "node_modules/astro/bin/astro.mjs"), "build", "--outDir", out], {
    cwd: project,
    timeout: 120_000,
  });

  const pages = (await readdir(out, { recursive: true })).filter((path) => path.endsWith(".html") && !path.startsWith("admin"));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = await readFile(join(out, page), "utf8");
    assert.equal(html.match(/<h1\b/g)?.length, 1, page);
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
  assert.match(guestbook, /class="thanks" role="status"/);

  const about = await readFile(join(out, "about.html"), "utf8");
  assert.match(about, /<div aria-live="polite"><p class="recent"/);
});
