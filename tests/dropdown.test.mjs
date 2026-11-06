import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { dropdown } from "../public/admin/dropdown.js";

const run = promisify(execFile);
const parse = (markdown) => dropdown.fromBlock(markdown.match(dropdown.pattern));

test("dropdown block survives a round trip through the editor", () => {
  const value = { title: "more <stuff> & things", body: "MOVIES: *Clue*\n\nGAMES: [PMD2](https://example.com)" };
  const markdown = dropdown.toBlock(value);
  assert.deepEqual(parse(`before\n\n${markdown}\n\nafter`), value);
  assert.equal(dropdown.toBlock(parse(markdown)), markdown);
});

test("dropdown block keeps an empty body and trims stray space", () => {
  const markdown = dropdown.toBlock({ title: " hi ", body: "\n  \n" });
  assert.equal(markdown, "<details>\n<summary>hi</summary>\n\n</details>");
  assert.deepEqual(parse(markdown), { title: "hi", body: "" });
});

test("two dropdowns in a row stay separate", () => {
  const one = dropdown.toBlock({ title: "one", body: "a" });
  const two = dropdown.toBlock({ title: "two", body: "b" });
  assert.deepEqual(parse(`${one}\n\n${two}`), { title: "one", body: "a" });
});

test("built pages render dropdown text as markdown", async (t) => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const root = await mkdtemp(join(project, "node_modules/.dropdown-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["src", "public", "package.json", "astro.config.mjs", "tsconfig.json"]) {
    await cp(join(project, path), join(root, path), { recursive: true, filter: (from) => !from.includes("/src/content/art/") });
  }

  const markdown = dropdown.toBlock({ title: "more & more", body: "MOVIES: **Clue**\n\nGAMES: PMD2" });
  await writeFile(join(root, "src/content/posts/dropdown.md"), `---\ntitle: dropdown\ndate: 2026-11-04\n---\n${markdown}\n\nafter\n`);

  await run(process.execPath, [join(project, "node_modules/astro/bin/astro.mjs"), "build"], { cwd: root, timeout: 120_000 });
  const html = await readFile(join(root, "dist/blog/dropdown.html"), "utf8");
  const [, inside] = html.match(/<details>([\s\S]*?)<\/details>/);

  assert.match(inside, /<summary>more &amp; more<\/summary>/);
  assert.match(inside, /<p>MOVIES: <strong>Clue<\/strong><\/p>/);
  assert.match(inside, /<p>GAMES: PMD2<\/p>/);
  assert.match(html, /<\/details>\s*<p>after<\/p>/);

  const about = await readFile(join(root, "dist/about.html"), "utf8");
  assert.match(about, /<details>\s*<summary>Here's a bunch more stuff I like!<\/summary>/);
  assert.doesNotMatch(about, /&lt;details&gt;/);
});
