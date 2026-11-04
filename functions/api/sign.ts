import { packDrawing } from "../../src/lib/drawing-storage.ts";
import { ENTRY_COLUMNS, entryHtml, readEntry, type Database, type Entry } from "../../src/lib/guestbook.ts";

export const onRequestPost = async ({ request, env }: { request: Request; env: { DB: Database } }) => {
  const back = Response.redirect(new URL("/guestbook", request.url).href, 303);
  const fragment = request.headers.has("x-fragment");
  const entry = readEntry(await request.formData());
  if (!entry) return fragment ? new Response(null, { status: 400 }) : back;
  const row = await env.DB.prepare(`insert into entries (name, site, message, drawing, created) values (?, ?, ?, ?, ?) returning ${ENTRY_COLUMNS}`)
    .bind(entry.name, entry.site, entry.message, entry.drawing ? await packDrawing(entry.drawing) : null, Date.now())
    .first<Entry>();
  if (!fragment) return back;
  return new Response(entryHtml(row!), { status: 201, headers: { "content-type": "text/html; charset=utf-8" } });
};
