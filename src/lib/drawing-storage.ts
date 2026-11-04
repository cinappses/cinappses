const PREFIX = "gzip:";

export async function packDrawing(svg: string) {
  const compressed = await new Response(new Blob([svg]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const packed = PREFIX + btoa(binary);
  return packed.length < svg.length ? packed : svg;
}

export async function unpackDrawing(drawing: string) {
  if (!drawing.startsWith(PREFIX)) return drawing;
  const bytes = Uint8Array.from(atob(drawing.slice(PREFIX.length)), (c) => c.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
