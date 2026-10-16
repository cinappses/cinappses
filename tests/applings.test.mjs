import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

test("applings fall back to a site asset when their image is absent or cleared", async (t) => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const root = await mkdtemp(join(tmpdir(), "cinappses-applings-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const path of ["src", "public", "package.json", "astro.config.mjs", "tsconfig.json"]) {
    await cp(join(project, path), join(root, path), { recursive: true });
  }
  await symlink(join(project, "node_modules"), join(root, "node_modules"), "dir");

  const applings = join(root, "src/content/applings");
  await rm(applings, { recursive: true });
  await mkdir(join(applings, "img"), { recursive: true });
  await cp(join(project, "src/assets/doll.png"), join(applings, "img/custom.png"));

  const images = new Map([
    ["missing", ""],
    ["empty", 'image: ""\n'],
    ["null", "image: null\n"],
    ["custom", "image: img/custom.png\n"],
  ]);
  for (const [name, image] of images) {
    await writeFile(join(applings, `${name}.md`), `---\nname: "${name}"\n${image}---\n`);
  }

  await run(process.execPath, [join(project, "node_modules/astro/bin/astro.mjs"), "build"], {
    cwd: root,
    timeout: 60_000,
  });

  const html = await readFile(join(root, "dist/about/index.html"), "utf8");
  const rendered = new Map([...html.matchAll(/<a\b[^>]*data-name="([^"]+)"[^>]*>\s*<img\b[^>]*src="([^"]+)"/g)]
    .map((match) => [match[1], match[2]]));

  assert.equal(rendered.size, images.size);
  assert.match(rendered.get("missing"), /appling-placeholder/);
  assert.equal(rendered.get("empty"), rendered.get("missing"));
  assert.equal(rendered.get("null"), rendered.get("missing"));
  assert.ok(rendered.get("custom"));
  assert.notEqual(rendered.get("custom"), rendered.get("missing"));
  for (const src of new Set(rendered.values())) {
    assert.ok((await readFile(join(root, "dist", src))).length);
  }
});
