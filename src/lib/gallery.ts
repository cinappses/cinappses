import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";

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
  const preview = await getImage({ src: image, width: Math.min(320, image.width), format: "webp" });

  return {
    width,
    height,
    src: variants[0]!.src,
    srcset: variants.map((variant, i) => `${variant.src} ${widths[i]}w`).join(", "),
    sizes: `min(${width}px, 960px, calc(92vw - 36px), ${72 * image.width / image.height}vh)`,
    preview: preview.src,
    original: image.src,
  };
}
