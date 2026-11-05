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
  assert.deepEqual(view({ state: "waiting", count: 3 }), { text: "3 saved, live in a minute", label: "publish now", busy: false });
  assert.equal(view({ state: "updating" }).busy, true);
  assert.equal(view({ state: "live" }).busy, true);
  assert.deepEqual(view({ state: "failed" }), { text: "didn't go through", label: "try again", busy: false });
});

test("publishing adds an empty commit on main with the signed in token", async (t) => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: () => JSON.stringify({ token: "gho_x" }) };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url).replace("https://api.github.com", ""), method: init.method ?? "GET", body: init.body && JSON.parse(init.body), auth: init.headers.authorization });
    const replies = { "/repos/cinappses/cinappses/git/ref/heads/main": { object: { sha: "head" } }, "/graphql": { data: {} } };
    return Response.json(replies[calls.at(-1).url] ?? {});
  };
  t.after(() => {
    globalThis.fetch = realFetch;
    delete globalThis.localStorage;
  });

  await publish();
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ["GET /repos/cinappses/cinappses/git/ref/heads/main", "POST /graphql"]);
  assert.deepEqual(calls[1].body.variables.input, {
    branch: { repositoryNameWithOwner: "cinappses/cinappses", branchName: "main" },
    message: { headline: "chore: publish changes" },
    expectedHeadOid: "head",
    fileChanges: {},
  });
  assert.ok(calls.every((c) => c.auth === "token gho_x"));
});

test("a refused commit surfaces as an error even though github answers 200", async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url) => Response.json(String(url).endsWith("/graphql") ? { errors: [{ message: "protected branch" }] } : { object: { sha: "head" } });
  t.after(() => {
    globalThis.fetch = realFetch;
    delete globalThis.localStorage;
  });
  await assert.rejects(publish(), /protected branch/);
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

test("a slow refresh does not mark a publish in progress as failed", async (t) => {
  const made = [];
  const el = () => {
    const e = { style: {}, isConnected: false, append() {}, after() {}, before(button) { button.isConnected = true; }, setAttribute() {}, closest: () => null, querySelector: () => null };
    made.push(e);
    return e;
  };
  const native = { ...el(), className: "secondary", innerHTML: "" };
  let observe;
  let focus;
  const pending = [];
  const later = () => new Promise((resolve) => pending.push(resolve));
  const real = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout };
  Object.assign(globalThis, {
    document: { createElement: el, querySelector: () => native, body: {} },
    MutationObserver: class { constructor(f) { observe = f; } observe() {} },
    addEventListener: (_, f) => { focus = f; },
    localStorage: { getItem: () => JSON.stringify({ token: "gho_x" }) },
    setTimeout: () => 0,
    fetch: async (url) => (String(url) === "/version.txt" ? new Response("live") : later()),
  });
  t.after(() => {
    Object.assign(globalThis, real);
    for (const k of ["document", "MutationObserver", "addEventListener", "localStorage"]) delete globalThis[k];
  });
  const { start } = await import("../public/admin/publish.js?overlap");
  const flush = () => new Promise((r) => setImmediate(r));
  const waiting = () => Response.json({ commits: [commit("[skip ci] a", 5)] });

  start();
  observe();
  await flush();
  focus();
  await flush();
  pending.shift()(waiting());
  await flush();
  pending.shift()(waiting());
  await flush();
  assert.equal(made[3].textContent, "updating the site...");
});
