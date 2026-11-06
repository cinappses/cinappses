import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { dropdown } from "../public/admin/dropdown.js";

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

test("built pages render dropdown text as markdown", async () => {
  const root = process.env.TEST_FIXTURE;
  const html = await readFile(join(root, "dist/blog/dropdown.html"), "utf8");
  const [, inside] = html.match(/<details>([\s\S]*?)<\/details>/);

  assert.match(inside, /<summary>more &amp; more<\/summary>/);
  assert.match(inside, /<p>MOVIES: <strong>Clue<\/strong><\/p>/);
  assert.match(inside, /<p>GAMES: PMD2<\/p>/);
  assert.match(html, /<\/details>\s*<p>after<\/p>/);

});
