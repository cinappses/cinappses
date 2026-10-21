import { entryHtml, listEntries, type Database } from "../src/lib/guestbook.ts";

type Context = { request: Request; env: { DB: Database }; next: (input: string) => Promise<Response> };

export const onRequestGet = async ({ request, env, next }: Context) => {
  const [page, entries] = await Promise.all([next(request.url), listEntries(env.DB)]);
  const list = `<div class="entries">${entries.map(entryHtml).join("")}</div>`;
  const html = (await page.text()).replace('<div class="entries"></div>', () => list);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
};
