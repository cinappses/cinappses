const { createElement: h, useState } = CMS.React;

const ICONS = {
  row: "M2 7h12v18H2zM16 7h12v18H16zM30 7h12v18H30z",
  column: "M12 2h20v13H12zM12 17h20v13H12z",
  grid: "M10 2h11v13H10zM23 2h11v13H23zM10 17h11v13H10zM23 17h11v13H23z",
  center: "M12 8h20v16H12z",
  left: "M2 4h16v20H2zM21 5h21v3H21zM21 11h21v3H21zM21 17h21v3H21z",
  right: "M26 4h16v20H26zM2 5h21v3H2zM2 11h21v3H2zM2 17h21v3H2z",
};
const LAYOUTS = [["row", "Row"], ["column", "Stack"], ["grid", "Grid"]];
const PLACES = [["center", "Center"], ["left", "Left of text"], ["right", "Right of text"]];
const SIZES = [["small", "Small"], ["medium", "Medium"], ["large", "Large"]];

const icon = (name) => h("svg", { viewBox: "0 0 44 32", "aria-hidden": true }, h("path", { d: ICONS[name] }));
const plainValue = (value) => value?.toJS?.() ?? value ?? {};
const source = (getAsset, image) => getAsset?.(image)?.url ?? image;

function Choice({ label, options, current, onPick, icons }) {
  return h("div", null,
    h("p", { className: "pb-label" }, label),
    h("div", { className: "pb-seg", role: "group", "aria-label": label },
      options.map(([value, text]) => h("button", {
        key: value,
        type: "button",
        "aria-pressed": current === value,
        onClick: () => onPick(value),
      }, icons ? icon(value) : null, text))));
}

function Drop({ single, empty, onFiles, onPick }) {
  const [over, setOver] = useState(false);
  const text = single ? "Drop a photo here or " : empty ? "Drop photos here or " : "Drop more photos here or ";
  return h("button", {
    type: "button",
    className: "pb-drop",
    "data-over": over,
    onClick: onPick,
    onDragOver: (e) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))); },
  }, text, h("b", null, single ? "choose a file" : "choose files"));
}

function Photo({ photo, index, count, src, ratio, onRatio, edit }) {
  const move = (to, label, glyph) => h("button", { type: "button", title: label, "aria-label": label, onClick: () => edit.move(index, to) }, glyph);
  return h("figure", { style: { "--r": ratio ?? 1 } },
    h("img", { src, alt: "", onLoad: (e) => onRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight) }),
    count > 1 ? h("div", { className: "pb-move" },
      index > 0 ? move(index - 1, "Move earlier", "‹") : null,
      index < count - 1 ? move(index + 1, "Move later", "›") : null) : null,
    h("button", { type: "button", className: "pb-remove", title: "Remove", "aria-label": "Remove", onClick: () => edit.remove(index) }, "×"),
    h("input", { className: "pb-caption", value: photo.caption ?? "", placeholder: "caption (optional)", onChange: (e) => edit.caption(index, e.target.value) }));
}

function Lines() {
  return h("div", { className: "pb-lines", "aria-hidden": true }, h("i"), h("i"), h("i"), h("i"));
}

export default function Board({ value, field, onChange, getAsset, addFile, pickFile }) {
  const single = Boolean(field.get("single"));
  const board = { layout: single ? "center" : "row", size: "large", photos: [], ...plainValue(value) };
  const [ratios, setRatios] = useState({});
  const update = (change) => onChange({ ...board, ...change });
  const setPhotos = (photos) => update({ photos: single ? photos.slice(-1) : photos });
  const add = (images) => setPhotos([...board.photos, ...images.map((image) => ({ image, caption: "" }))]);
  const edit = {
    remove: (i) => setPhotos(board.photos.filter((_, j) => j !== i)),
    caption: (i, caption) => setPhotos(board.photos.map((p, j) => (j === i ? { ...p, caption } : p))),
    move: (i, to) => {
      const list = [...board.photos];
      [list[i], list[to]] = [list[to], list[i]];
      setPhotos(list);
    },
  };
  const onFiles = async (files) => add(await Promise.all(files.map((file) => addFile(file))));
  const onPick = async () => {
    const picked = await pickFile({ kind: "image", multiple: !single, allowURL: false });
    add([picked ?? []].flat().map((p) => p.value));
  };
  const figures = board.photos.map((photo, index) => h(Photo, {
    key: photo.image + index,
    photo,
    index,
    count: board.photos.length,
    src: source(getAsset, photo.image),
    ratio: ratios[photo.image],
    onRatio: (r) => setRatios((all) => ({ ...all, [photo.image]: r })),
    edit,
  }));
  const layout = h("div", { className: "pb-layout", "data-layout": board.layout, "data-size": board.size, "data-count": figures.length }, figures);
  const placed = single && board.layout !== "center" ? h("div", { className: "pb-placed", "data-layout": board.layout }, layout, h(Lines)) : layout;
  const drop = single && figures.length ? null : h(Drop, { single, empty: !figures.length, onFiles, onPick });

  return h("div", { className: "pb" },
    h("div", { className: "pb-tools" },
      h(Choice, { label: single ? "Position" : "Layout", options: single ? PLACES : LAYOUTS, current: board.layout, onPick: (layout) => update({ layout }), icons: true }),
      h(Choice, { label: "Size", options: SIZES, current: board.size, onPick: (size) => update({ size }) })),
    h("div", { className: "pb-stage" }, figures.length ? placed : null, drop));
}
