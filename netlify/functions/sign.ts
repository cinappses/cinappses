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

export default async (req: Request) => {
  const back = new URL("/guestbook/?signed", req.url);
  const body = req.method === "POST" ? entry(await req.formData()) : null;
  if (!body) return Response.redirect(new URL("/guestbook/", req.url), 303);
  const path = `src/content/guestbook/${Date.now()}.md`;
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "user-agent": "cinappses" },
    body: JSON.stringify({ message: "guestbook: new entry", content: Buffer.from(body).toString("base64") }),
  });
  return res.ok ? Response.redirect(back, 303) : new Response("couldn't sign, try again later", { status: 502 });
};

export const config = { path: "/api/sign" };
