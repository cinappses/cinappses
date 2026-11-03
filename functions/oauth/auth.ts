type Context = { request: Request; env: { GITHUB_CLIENT_ID: string } };

export const onRequestGet = ({ request, env }: Context) => {
  const state = crypto.randomUUID();
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: new URL("/oauth/callback", request.url).href,
    scope: "repo",
    state,
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      location: url.href,
      "set-cookie": `oauth_state=${state}; Path=/oauth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
};
