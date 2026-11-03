type Context = { request: Request; env: { GITHUB_CLIENT_ID: string; GITHUB_CLIENT_SECRET: string } };

const cookie = (request: Request, name: string) =>
  request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1];

async function exchange(code: string, env: Context["env"]) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "cinappses" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const data: { access_token?: string } = res.ok ? await res.json() : {};
  return data.access_token;
}

function reply(origin: string, result: { token: string } | { error: string }) {
  const status = "token" in result ? "success" : "error";
  const message = `authorization:github:${status}:${JSON.stringify({ provider: "github", ...result })}`;
  const json = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
  const script = `const origin = ${json(origin)};
addEventListener("message", (e) => {
  if (e.origin === origin && e.data === "authorizing:github") opener.postMessage(${json(message)}, origin);
});
opener.postMessage("authorizing:github", origin);`;
  return new Response(`<!doctype html><meta charset="utf-8"><title>signing in</title><script>${script}</script>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": "oauth_state=; Path=/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    },
  });
}

export const onRequestGet = async ({ request, env }: Context) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || state !== cookie(request, "oauth_state")) return reply(url.origin, { error: "sign in expired, try again" });
  const token = await exchange(code, env);
  return reply(url.origin, token ? { token } : { error: "github didn't accept the sign in" });
};
