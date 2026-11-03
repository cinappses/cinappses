const markdown = (text) => String(text ?? "").replace(/[!-/:-@[-`{-~]/g, "\\$&");
const plain = (text) => text.replace(/\\([!-/:-@[-`{-~])/g, "$1");

const toBlock = ({ layout, size = "large", photos = [] }) =>
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

const toPreview = ({ layout, size = "large", photos = [] }, getAsset) => {
  const figures = photos.filter((p) => p?.image).map(({ image, caption }) =>
    `<figure><img src="${html(getAsset?.(image) ?? image)}" alt="${html(caption)}">${caption ? `<figcaption>${html(caption)}</figcaption>` : ""}</figure>`);
  const box = document.createElement("div");
  box.innerHTML = `<div class="photos" data-layout="${layout}" data-size="${size}">${figures.join("")}</div>`;
  for (const img of box.querySelectorAll("img")) {
    img.onload = () => img.parentElement.style.setProperty("--r", img.naturalWidth / img.naturalHeight);
  }
  return box.firstElementChild;
};

const pattern = (layouts) =>
  new RegExp(`^<div class="photos" data-layout="(${layouts})" data-size="(small|medium|large)">\\n\\n((?:!\\[.*\\]\\(<.*>\\)\\n\\n)*)<\\/div>$`, "m");

const component = (id, label, single, layouts, fallback) => ({
  id,
  label,
  icon: single ? "image" : "photo_library",
  mode: "dialog",
  summary: `${label}: {{board.photos.0.caption}}`,
  fields: [{ name: "board", label, required: false, widget: "photo-board", single, default: { layout: fallback, size: "large", photos: [] } }],
  pattern: pattern(layouts),
  fromBlock: (match) => ({ board: fromBlock(match) }),
  toBlock: ({ board }) => toBlock({ layout: fallback, ...board }),
  toPreview: ({ board }, getAsset) => toPreview({ layout: fallback, ...board }, getAsset),
});

export const photo = component("photo", "Photo", true, "center|left|right", "center");
export const photos = component("photos", "Photos", false, "row|column|grid", "row");
