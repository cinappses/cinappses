type Env = { GITHUB_REPO: string; GITHUB_TOKEN: string };

const field = (form: FormData, key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);

function entry(form: FormData) {
  const name = field(form, "name", 40);
  const message = field(form, "message", 1000);
  const site = field(form, "site", 200);
  if (!name || !message || field(form, "phone", 1)) return null;
  const lines = ["---", `name: ${JSON.stringify(name)}`, `date: ${new Date().toISOString()}`];
  if (/^https?:\/\//.test(site)) lines.push(`site: ${JSON.stringify(site)}`);
  return [...lines, `message: ${JSON.stringify(message)}`, "---", ""].join("\n");
}

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  const body = request.method === "POST" ? entry(await request.formData()) : null;
  if (!body) return Response.redirect(new URL("/guestbook/", request.url).href, 303);
  const path = `src/content/guestbook/${Date.now()}.md`;
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, "user-agent": "cinappses" },
    body: JSON.stringify({ message: "guestbook: new entry", content: base64(body) }),
  });
  return res.ok
    ? Response.redirect(new URL("/guestbook/?signed", request.url).href, 303)
    : new Response("couldn't sign, try again later", { status: 502 });
};
