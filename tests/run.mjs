import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { dropdown as editorDropdown } from "../public/admin/dropdown.js";
import { photos as editorPhotos } from "../public/admin/photos.js";

const run = promisify(execFile);
const project = fileURLToPath(new URL("../", import.meta.url));
const block = (board) => editorPhotos.toBlock({ board });

async function applings(root) {
  const applings = join(root, "src/content/applings");
  await rm(applings, { recursive: true });
  await mkdir(join(applings, "img"), { recursive: true });
  await cp(join(project, "src/assets/logo.png"), join(applings, "img/custom.png"));

  const images = new Map([
    ["missing", ""],
    ["empty", 'image: ""\n'],
    ["null", "image: null\n"],
    ["custom", "image: img/custom.png\n"],
  ]);
  for (const [name, image] of images) {
    await writeFile(join(applings, `${name}.md`), `---\nname: "${name}"\n${image}---\n`);
  }
}

async function gallery(root) {
  const art = join(root, "src/content/art");
  await rm(art, { recursive: true });
  await mkdir(join(art, "img"), { recursive: true });

  for (const [name, width, height, format, tags] of [
    ["portrait", 1400, 2800, "png", "[comic]"],
    ["landscape", 2800, 1400, "jpeg", "[sketch, illustration]"],
    ["small", 200, 300, "png", "[]"],
  ]) {
    const original = await sharp({ create: { width, height, channels: 4, background: "#f1a164" } })
      .toFormat(format).toBuffer();
    await writeFile(join(art, `img/${name}.${format}`), original);
    await writeFile(join(art, `${name}.md`), `---\ntitle: ${name}\nimage: img/${name}.${format}\ndate: 2026-10-18\ncaption: ${name}\ntags: ${tags}\n---\n`);
  }
  await writeFile(join(root, "src/data/tags.json"), JSON.stringify({ tags: ["illustration", "background", "comic"] }));
}

async function photos(root) {
  const posts = join(root, "src/content/posts");
  await mkdir(join(posts, "img"), { recursive: true });
  await mkdir(join(root, "public/uploads"), { recursive: true });
  const image = (width, height) => sharp({ create: { width, height, channels: 3, background: "#9cc59a" } }).png();
  await image(600, 300).jpeg().withMetadata({ orientation: 6 }).toFile(join(posts, "img/tall.jpg"));
  await image(800, 400).toFile(join(root, "public/uploads/wide.png"));

  const markdown = block({
    layout: "row",
    size: "large",
    photos: [
      { image: "img/tall.jpg", caption: "tall *one*" },
      { image: "/uploads/wide.png", caption: "" },
    ],
  });
  await writeFile(join(posts, "photos.md"), `---\ntitle: photos\ndate: 2026-11-03\n---\n![plain](img/tall.jpg)\n\n${markdown}\n`);
}

async function dropdown(root) {
  const markdown = editorDropdown.toBlock({ title: "more & more", body: "MOVIES: **Clue**\n\nGAMES: PMD2" });
  await writeFile(join(root, "src/content/posts/dropdown.md"), `---\ntitle: dropdown\ndate: 2026-11-04\n---\n${markdown}\n\nafter\n`);
}

const root = await mkdtemp(join(project, "node_modules/.fixture-"));
try {
  for (const path of ["src", "public", "package.json", "astro.config.mjs", "tsconfig.json"]) {
    await cp(join(project, path), join(root, path), {
      recursive: true,
      filter: (from) => !from.includes("/src/content/"),
    });
  }
  for (const collection of ["art", "applings", "posts", "pages", "status", "scans"]) {
    await mkdir(join(root, "src/content", collection), { recursive: true });
  }
  for (const name of ["home", "about", "comic"]) {
    await writeFile(join(root, "src/content/pages", `${name}.md`), `---\ntitle: ${name}\n---\nfixture\n`);
  }
  await writeFile(join(root, "src/content/status/fixture.md"), "---\ndate: 2026-11-04\n---\nfixture\n");
  await applings(root);
  await gallery(root);
  await photos(root);
  await dropdown(root);
  await run(process.execPath, [join(project, "node_modules/astro/bin/astro.mjs"), "build"], { cwd: root, timeout: 120_000 });
  const files = (await readdir(join(project, "tests"))).filter((name) => name.endsWith(".test.mjs"));
  const { stdout, stderr } = await run(process.execPath, ["--test", ...files.map((name) => join(project, "tests", name))], {
    cwd: project,
    env: { ...process.env, TEST_FIXTURE: root },
  });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
} catch (error) {
  process.stderr.write(error.stdout ?? "");
  process.stderr.write(error.stderr ?? "");
  process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
