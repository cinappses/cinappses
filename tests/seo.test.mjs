import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

test("built pages carry link preview and search tags", async (t) => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const out = await mkdtemp(join(project, "node_modules/.seo-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await run(process.execPath, [join(project, "node_modules/astro/bin/astro.mjs"), "build", "--outDir", out], {
    cwd: project,
    timeout: 120_000,
  });

  const home = await readFile(join(out, "index.html"), "utf8");
  assert.match(home, /<link rel="canonical" href="https:\/\/cinappses.org\/">/);
  assert.doesNotMatch(home, /og:image/);

  const about = await readFile(join(out, "about.html"), "utf8");
  assert.match(about, /<link rel="canonical" href="https:\/\/cinappses.org\/about">/);
  assert.match(about, /<meta property="og:title" content="about \| cinappses">/);

  const lost = await readFile(join(out, "404.html"), "utf8");
  assert.match(lost, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(lost, /rel="canonical"/);

  const sitemap = await readFile(join(out, "sitemap-0.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/cinappses.org\/gallery<\/loc>/);
  assert.doesNotMatch(sitemap, /404/);
});
