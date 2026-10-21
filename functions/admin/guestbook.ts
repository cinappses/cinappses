import { entryHtml, listEntries, type Database } from "../../src/lib/guestbook.ts";

type Context = { request: Request; env: { DB: Database } };

const REPO = "cinappses/cinappses";

const style = `body{margin:0 auto;max-width:640px;padding:16px;background:#fff3d6;color:#1d1410;font:17px/1.5 Seravek,"Gill Sans Nova",Ubuntu,Calibri,"DejaVu Sans",sans-serif}
li{border-top:2px dashed #f1a164;padding:8px 0;list-style:none}ul{padding:0}p{margin:0 0 4px;overflow-wrap:anywhere;white-space:pre-line}
.art{display:block;width:240px;height:auto;border:2px solid #1d1410}button{font:inherit;border:2px solid #1d1410;background:#fffaf0;cursor:pointer}`;

const script = `const token = JSON.parse(localStorage.getItem("sveltia-cms.user") || "null")?.token;
if (!token) document.querySelector("ul").outerHTML = '<p><a href="/admin/">log in to the cms</a> first, then come back here.</p>';
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!confirm("delete this entry?")) return;
  const res = await fetch(location.href, { method: "POST", body: new FormData(e.target), headers: { authorization: "Bearer " + token } });
  if (res.ok) e.target.parentElement.remove();
  else alert("couldn't delete that one");
});`;

async function canEdit(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return false;
  const res = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { authorization: `Bearer ${token}`, "user-agent": "cinappses" },
  });
  if (!res.ok) return false;
  const repo: { permissions?: { push?: boolean } } = await res.json();
  return repo.permissions?.push === true;
}

export const onRequestGet = async ({ env }: Context) => {
  const entries = await listEntries(env.DB);
  const items = entries.map((e) => `<li>${entryHtml(e)}<form><button name="id" value="${e.id}">delete</button></form></li>`);
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>guestbook | cinappses</title><style>${style}</style><h1>guestbook</h1><ul>${items.join("")}</ul><script>${script}</script>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!(await canEdit(request))) return new Response(null, { status: 403 });
  const id = Number((await request.formData()).get("id"));
  await env.DB.prepare("delete from entries where id = ?").bind(id).run();
  return new Response(null, { status: 204 });
};
