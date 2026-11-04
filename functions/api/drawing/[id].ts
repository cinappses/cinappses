import { unpackDrawing } from "../../../src/lib/drawing-storage.ts";
import type { Database } from "../../../src/lib/guestbook.ts";

export const onRequestGet = async ({ params, env }: { params: { id: string }; env: { DB: Database } }) => {
  const row = await env.DB.prepare("select drawing from entries where id = ?").bind(Number(params.id)).first<{ drawing: string | null }>();
  if (!row?.drawing) return new Response(null, { status: 404 });
  return new Response(await unpackDrawing(row.drawing), { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable" } });
};
