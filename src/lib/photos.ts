import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Element, ElementContent, RootContent } from "hast";
import { defineHastPlugin } from "satteri";
import sharp from "sharp";

const isImage = (node: ElementContent): node is Element => node.type === "element" && node.tagName === "img";

function inPhotos(siblings: readonly RootContent[], index: number) {
  const raw = siblings.slice(0, index).findLast((node) => node.type === "raw");
  return raw?.type === "raw" && raw.value.startsWith('<div class="photos" ');
}

async function size(src: string, url: URL | undefined) {
  const root = url ? dirname(fileURLToPath(url)) : ".";
  const file = decodeURI(src);
  const path = file.startsWith("/") ? join(process.cwd(), "public", file) : join(root, file);
  return (await sharp(path).metadata()).autoOrient;
}

async function ratio(src: string, url: URL | undefined) {
  const { width, height } = await size(src, url).catch(() => ({ width: 0, height: 0 }));
  return width && height ? (width / height).toFixed(3) : "1";
}

async function figure(img: Element, url: URL | undefined): Promise<Element> {
  const caption = String(img.properties.alt ?? "");
  const children: ElementContent[] = [{ ...img }];
  if (caption) children.push({ type: "element", tagName: "figcaption", properties: {}, children: [{ type: "text", value: caption }] });
  return { type: "element", tagName: "figure", properties: { style: `--r: ${await ratio(String(img.properties.src), url)}` }, children };
}

export default defineHastPlugin({
  name: "photos",
  element: {
    filter: ["p"],
    async visit(node, ctx) {
      const images = node.children.filter(isImage);
      if (!images.length || !inPhotos(ctx.parent(node).children, ctx.indexOf(node) ?? 0)) return;
      ctx.replaceNode(node, await Promise.all(images.map((img) => figure(img, ctx.fileURL))));
    },
  },
});
