import assert from "node:assert/strict";
import { test } from "node:test";
import { hasCodeChanges } from "../scripts/code-changes.mjs";

test("content batches and empty publish commits need no regression tests", () => {
  assert.equal(hasCodeChanges([]), false);
  assert.equal(hasCodeChanges(["src/content/posts/new.md", "src/content/art/img/new.png", "src/data/tags.json", "public/uploads/new.png"]), false);
});

test("code and unknown paths keep regression tests enabled", () => {
  for (const path of ["src/content.config.ts", "src/pages/about.astro", "public/admin/config.yml", "src/data/tags.json.bak", "package-lock.json", ".github/workflows/ci.yml"]) {
    assert.equal(hasCodeChanges(["src/content/pages/about.md", path]), true, path);
  }
});
