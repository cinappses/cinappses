const codes = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escape = (text) => String(text ?? "").replace(/[&<>]/g, (c) => codes[c]);
const unescape = (text) => text.replace(/&(lt|gt|amp);/g, (_, name) => ({ lt: "<", gt: ">", amp: "&" })[name]);

const toBlock = ({ title, body }) => {
  const text = String(body ?? "").trim();
  return [`<details>\n<summary>${escape(title).trim()}</summary>`, text, "</details>"].filter(Boolean).join("\n\n");
};

const toPreview = ({ title, body }) => {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = title ?? "";
  details.append(summary);
  for (const text of String(body ?? "").split(/\n{2,}/).filter((part) => part.trim())) {
    const p = document.createElement("p");
    p.textContent = text;
    details.append(p);
  }
  return details;
};

export const dropdown = {
  id: "dropdown",
  label: "Dropdown",
  icon: "expand_circle_down",
  fields: [
    { name: "title", label: "Title" },
    { name: "body", label: "Text", widget: "text", required: false },
  ],
  pattern: /^<details>\n<summary>(.*)<\/summary>\n\n(?:([\s\S]*?)\n\n)?<\/details>$/m,
  fromBlock: ([, title, body = ""]) => ({ title: unescape(title), body }),
  toBlock,
  toPreview,
};
