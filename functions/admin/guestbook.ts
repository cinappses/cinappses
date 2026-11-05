import { entryHtml, listEntries, type Database } from "../../src/lib/guestbook.ts";

type Context = { request: Request; env: { DB: Database } };

const REPO = "cinappses/cinappses";

const style = `body{margin:0;min-height:100vh;background:hsl(42 100% 94%);color:hsl(18 29% 9%);font:15px/1.5 Seravek,"Gill Sans Nova",Ubuntu,Calibri,"DejaVu Sans",source-sans-pro,sans-serif}
header{display:flex;align-items:center;height:56px;padding:0 8px}
header a{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:4px;color:inherit;text-decoration:none}
header a:hover{background:hsl(38 85% 86%)}
.icon{font-family:"Material Symbols Outlined";font-size:20px;line-height:1}
main{min-height:calc(100vh - 56px);padding:16px 24px;background:hsl(40 100% 97%);border-top-left-radius:8px;margin-left:8px}
h1{margin:0 0 8px;font-size:20px}
ul{margin:0;padding:0}
li{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;padding:12px 8px;border-bottom:1px solid hsl(28 50% 72%);list-style:none}
p{margin:0 0 4px;overflow-wrap:anywhere;white-space:pre-line}
small{color:hsl(18 12% 40%)}
li a{color:hsl(22 65% 38%)}
.art{display:block;width:240px;height:auto;border:1px solid hsl(28 50% 72%);border-radius:4px}
button{font:inherit;padding:2px 12px;border:1px solid hsl(22 35% 45%);border-radius:4px;background:none;color:hsl(22 65% 38%);cursor:pointer}
button:hover{background:hsl(38 85% 86%)}
.empty{padding:32px 8px;color:hsl(18 12% 40%)}`;

const script = `const token = JSON.parse(localStorage.getItem("sveltia-cms.user") || "null")?.token;
if (!token) document.querySelector("ul").outerHTML = '<p class="empty"><a href="/admin/">log in to the cms</a> first, then come back here.</p>';
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
  const list = items.length ? items.join("") : '<p class="empty">no entries yet</p>';
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>guestbook | cinappses</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"><style>${style}</style><header><a href="/admin/"><span class="icon" aria-hidden="true">arrow_back</span>back</a></header><main><h1>Guestbook</h1><ul>${list}</ul></main><script>${script}</script>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
};

export const onRequestPost = async ({ request, env }: Context) => {
  if (!(await canEdit(request))) return new Response(null, { status: 403 });
  const id = Number((await request.formData()).get("id"));
  await env.DB.prepare("delete from entries where id = ?").bind(id).run();
  return new Response(null, { status: 204 });
};
