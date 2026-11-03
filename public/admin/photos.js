const markdown = (text) => String(text ?? "").replace(/[!-/:-@[-`{-~]/g, "\\$&");
const plain = (text) => text.replace(/\\([!-/:-@[-`{-~])/g, "$1");

const toBlock = ({ layout = "row", size = "large", photos = [] }) =>
  [
    `<div class="photos" data-layout="${layout}" data-size="${size}">`,
    ...photos.filter((p) => p?.image).map(({ image, caption }) => `![${markdown(caption)}](<${image}>)`),
    "</div>",
  ].join("\n\n");

const fromBlock = ([, layout, size, body]) => ({
  layout,
  size,
  photos: [...body.matchAll(/!\[((?:\\.|[^\\\]])*)\]\(<([^>]*)>\)/g)].map(([, caption, image]) => ({
    image,
    caption: plain(caption),
  })),
});

const codes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const html = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => codes[c]);

const toPreview = ({ layout = "row", size = "large", photos = [] }, getAsset) => {
  const figures = photos.filter((p) => p?.image).map(({ image, caption }) =>
    `<figure><img src="${html(getAsset?.(image) ?? image)}" alt="${html(caption)}">${caption ? `<figcaption>${html(caption)}</figcaption>` : ""}</figure>`);
  const box = document.createElement("div");
  box.innerHTML = `<div class="photos" data-layout="${layout}" data-size="${size}">${figures.join("")}</div>`;
  for (const img of box.querySelectorAll("img")) {
    img.onload = () => img.parentElement.style.setProperty("--r", img.naturalWidth / img.naturalHeight);
  }
  return box.firstElementChild;
};

export default {
  id: "photos",
  label: "Photos",
  icon: "photo_library",
  trigger: "button",
  fields: [
    {
      name: "layout",
      label: "Layout",
      widget: "select",
      default: "row",
      options: [
        { label: "Side by side", value: "row" },
        { label: "Stacked", value: "column" },
        { label: "Grid", value: "grid" },
        { label: "Next to the text, on the left", value: "left" },
        { label: "Next to the text, on the right", value: "right" },
      ],
    },
    {
      name: "size",
      label: "Size",
      widget: "select",
      default: "large",
      options: [
        { label: "Small", value: "small" },
        { label: "Medium", value: "medium" },
        { label: "Large", value: "large" },
      ],
    },
    {
      name: "photos",
      label: "Photos",
      label_singular: "Photo",
      widget: "list",
      summary: "{{fields.caption}}",
      fields: [
        { name: "image", label: "Image", widget: "image", choose_url: false },
        { name: "caption", label: "Caption", required: false },
      ],
    },
  ],
  pattern: /^<div class="photos" data-layout="(row|column|grid|left|right)" data-size="(small|medium|large)">\n\n((?:!\[.*\]\(<.*>\)\n\n)*)<\/div>$/m,
  fromBlock,
  toBlock,
  toPreview,
};
