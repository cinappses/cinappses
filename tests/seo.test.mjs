import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { excerpt } from "../src/lib/excerpt.ts";

test("built pages carry link preview and search tags", async () => {
  const out = join(process.env.TEST_FIXTURE, "dist");

  const home = await readFile(join(out, "index.html"), "utf8");
  assert.match(home, /<link rel="canonical" href="https:\/\/cinappses.org\/">/);
  assert.match(home, /<meta property="og:image" content="https:\/\/cinappses.org\/og.png">/);
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);

  assert.match(home, /<title>cinappses \| art by Luci Lofthouse<\/title>/);
  assert.match(home, /"@type":"Person","name":"Luci Lofthouse"/);

  const gallery = await readFile(join(out, "gallery.html"), "utf8");
  const schema = JSON.parse(gallery.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.equal(schema["@type"], "ImageGallery");
  assert.ok(schema.image.length > 0);
  assert.ok(schema.image.some((image) => image.caption && gallery.includes(`alt="${image.caption}"`)));
  for (const image of schema.image) assert.match(image.contentUrl, /^https:\/\/cinappses.org\/_astro\//);

  const post = await readFile(join(out, "blog/dropdown.html"), "utf8");
  assert.match(post, /<meta property="og:type" content="article">/);
  assert.match(post, /<meta property="article:published_time" content="\d{4}-\d\d-\d\dT[^"]+">/);

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

test("excerpt strips markdown and trims to a word", () => {
  assert.equal(excerpt("## hi\n\n![a](/x.png) see [my **art**](/gallery)"), "hi see my art");
  assert.equal(excerpt(""), undefined);
  const long = excerpt("word ".repeat(60));
  assert.ok(long.length <= 160);
  assert.match(long, /word\.\.\.$/);
});
