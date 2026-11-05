import assert from "node:assert/strict";
import { test } from "node:test";
import { publish, settle, status, view } from "../public/admin/publish.js";

const now = Date.parse("2026-11-04T12:00:00Z");
const commit = (message, minutesAgo = 1) => ({
  sha: message,
  commit: { message, committer: { date: new Date(now - minutesAgo * 60_000).toISOString() } },
});

test("nothing after the live commit means the site is up to date", () => {
  assert.deepEqual(status({ commits: [], now }), { state: "live" });
});

test("cms saves after the live commit are counted as waiting", () => {
  const commits = [commit("[skip ci] Update Art “train”"), commit("[skip ci] Update Art “rain”")];
  assert.deepEqual(status({ commits, now }), { state: "waiting", count: 2, head: "[skip ci] Update Art “rain”", ready: true });
});

test("a newer save still waits even while an earlier build runs", () => {
  const commits = [commit("chore: publish changes"), commit("[skip ci] Update Files “tags”")];
  assert.equal(status({ commits, now }).count, 1);
});

test("saves are ready to go live once a minute passes without another", () => {
  assert.equal(status({ commits: [commit("[skip ci] a", 0.5)], now }).ready, false);
  assert.equal(status({ commits: [commit("[skip ci] a", 1)], now }).ready, true);
});

test("a save that was already tried shows as failed instead of trying again", () => {
  const waiting = { state: "waiting", count: 1, head: "a", ready: true };
  assert.deepEqual(settle(waiting, "a"), { state: "failed", head: "a" });
  assert.equal(settle(waiting, "b"), waiting);
  assert.equal(settle(waiting, undefined), waiting);
  assert.deepEqual(settle({ state: "updating" }, "a"), { state: "updating" });
});

test("a building commit is updating until it is too old, then failed", () => {
  assert.deepEqual(status({ commits: [commit("chore: publish changes", 2)], now }), { state: "updating" });
  assert.deepEqual(status({ commits: [commit("chore: publish changes", 11)], now }), { state: "failed" });
});

test("an unknown live commit leaves the button usable", () => {
  assert.deepEqual(status({ commits: undefined, now }), { state: "unknown" });
  assert.equal(view({ state: "unknown" }).busy, false);
});

test("the button says what it will do", () => {
  assert.deepEqual(view({ state: "waiting", count: 3 }), { text: "3 saved, going live in a minute", label: "put 3 changes on the site", busy: false });
  assert.equal(view({ state: "waiting", count: 1 }).label, "put 1 change on the site");
  assert.equal(view({ state: "updating" }).busy, true);
  assert.equal(view({ state: "live" }).busy, true);
  assert.deepEqual(view({ state: "failed" }), { text: "didn't go through", label: "try again", busy: false });
});

test("publishing adds an empty commit on main with the signed in token", async (t) => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: () => JSON.stringify({ token: "gho_x" }) };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url).replace("https://api.github.com/repos/cinappses/cinappses", ""), method: init.method ?? "GET", body: init.body && JSON.parse(init.body), auth: init.headers.authorization });
    const replies = { "/git/ref/heads/main": { object: { sha: "head" } }, "/git/commits/head": { tree: { sha: "tree" } }, "/git/commits": { sha: "new" } };
    return Response.json(replies[calls.at(-1).url] ?? {});
  };
  t.after(() => {
    globalThis.fetch = realFetch;
    delete globalThis.localStorage;
  });

  await publish();
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ["GET /git/ref/heads/main", "GET /git/commits/head", "POST /git/commits", "PATCH /git/refs/heads/main"]);
  assert.deepEqual(calls[2].body, { message: "chore: publish changes", tree: "tree", parents: ["head"] });
  assert.deepEqual(calls[3].body, { sha: "new" });
  assert.ok(calls.every((c) => c.auth === "token gho_x"));
});

test("a rejected push surfaces as an error", async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async () => new Response("", { status: 403 });
  t.after(() => {
    globalThis.fetch = realFetch;
    delete globalThis.localStorage;
  });
  await assert.rejects(publish());
});
