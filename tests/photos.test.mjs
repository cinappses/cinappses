import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { photo, photos } from "../public/admin/photos.js";


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

test("built posts turn photos blocks into captioned figures", async () => {
  const root = process.env.TEST_FIXTURE;
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
