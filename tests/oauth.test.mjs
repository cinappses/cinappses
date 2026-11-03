import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet as auth } from "../functions/oauth/auth.ts";
import { onRequestGet as callback } from "../functions/oauth/callback.ts";

const env = { GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "secret" };

test("sign in sends people to github with a state cookie", () => {
  const res = auth({ request: new Request("https://cinappses.org/oauth/auth?provider=github&scope=repo"), env });
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get("location"));
  assert.equal(to.origin + to.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(to.searchParams.get("client_id"), "client");
  assert.equal(to.searchParams.get("redirect_uri"), "https://cinappses.org/oauth/callback");
  assert.equal(to.searchParams.get("scope"), "repo");
  const state = to.searchParams.get("state");
  assert.match(res.headers.get("set-cookie"), new RegExp(`^oauth_state=${state}; Path=/oauth; .*HttpOnly; Secure`));
});

test("the callback hands the token to the cms only when the state matches", async (t) => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    sent.push({ url: String(input), body: JSON.parse(init.body) });
    return Response.json(init.body.includes('"good"') ? { access_token: "gho_abc</script>" } : { error: "bad_verification_code" });
  };
  t.after(() => (globalThis.fetch = realFetch));
  const call = (query, cookie) =>
    callback({ request: new Request(`https://cinappses.org/oauth/callback?${query}`, { headers: cookie ? { cookie } : {} }), env }).then((r) => r.text());

  assert.match(await call("code=good&state=s1"), /authorization:github:error:/);
  assert.match(await call("code=good&state=s1", "oauth_state=other"), /authorization:github:error:/);
  assert.equal(sent.length, 0);

  const ok = await call("code=good&state=s1", "theme=x; oauth_state=s1");
  assert.match(ok, /authorization:github:success:/);
  assert.match(ok, /gho_abc\\u003c\/script>/);
  assert.doesNotMatch(ok, /gho_abc<\/script>/);
  assert.match(ok, /const origin = "https:\/\/cinappses.org"/);
  assert.deepEqual(sent[0], { url: "https://github.com/login/oauth/access_token", body: { client_id: "client", client_secret: "secret", code: "good" } });

  assert.match(await call("code=bad&state=s1", "oauth_state=s1"), /authorization:github:error:.*didn't accept/);
});
