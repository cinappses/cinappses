import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import sharp from "sharp";

const placeholders = new Map<string, Promise<Buffer>>();

export async function galleryImage(image: ImageMetadata) {
  const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const widths = [...new Set([800, 1600, 2400].map((edge) =>
    Math.round(image.width * Math.min(1, edge / Math.max(image.width, image.height))),
  ))];
  const variants = await Promise.all(widths.map((width) =>
    getImage({ src: image, width, format: "webp", quality: 85 }),
  ));
  const { fsPath } = image as ImageMetadata & { fsPath: string };
  if (!placeholders.has(fsPath)) placeholders.set(fsPath, sharp(fsPath).resize(24, 24, { fit: "inside" }).webp({ quality: 50 }).toBuffer());
  const placeholder = await placeholders.get(fsPath)!;

  return {
    width,
    height,
    src: variants[0]!.src,
    srcset: variants.map((variant, i) => `${variant.src} ${widths[i]}w`).join(", "),
    sizes: `min(${width}px, 960px, calc(92vw - 36px), ${72 * image.width / image.height}vh)`,
    placeholder: `data:image/webp;base64,${placeholder.toString("base64")}`,
  };
}
