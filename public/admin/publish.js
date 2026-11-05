const repo = "https://api.github.com/repos/cinappses/cinappses";
const patience = 10 * 60 * 1000;
const quiet = 60 * 1000;
const skipped = (c) => c.commit.message.includes("[skip ci]");

export const status = ({ commits, now }) => {
  if (!commits) return { state: "unknown" };
  if (!commits.length) return { state: "live" };
  const head = commits.at(-1);
  const age = now - Date.parse(head.commit.committer.date);
  if (skipped(head)) return { state: "waiting", count: commits.filter(skipped).length, head: head.sha, ready: age >= quiet };
  return { state: age < patience ? "updating" : "failed" };
};

export const settle = (current, tried) =>
  current.state === "waiting" && current.head === tried ? { state: "failed", head: tried } : current;

const plural = (n) => `${n} change${n === 1 ? "" : "s"}`;

export const view = ({ state, count }) =>
  ({
    unknown: { text: "", label: "put changes on the site", busy: false },
    waiting: { text: `${count} saved, going live in a minute`, label: `put ${plural(count)} on the site`, busy: false },
    updating: { text: "updating the site...", label: "updating...", busy: true },
    live: { text: "site is up to date", label: "put changes on the site", busy: true },
    failed: { text: "didn't go through", label: "try again", busy: false },
  })[state];

const token = () => {
  try {
    return JSON.parse(localStorage.getItem("sveltia-cms.user") ?? "null")?.token;
  } catch {
    return undefined;
  }
};

const github = async (path, init = {}) => {
  const res = await fetch(repo + path, {
    ...init,
    cache: "no-store",
    headers: { authorization: `token ${token()}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
};

const fetchCommits = async () => {
  const live = (await fetch("/version.txt", { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""))).trim();
  if (!live) return undefined;
  return (await github(`/compare/${live}...main`)).commits;
};

export const publish = async () => {
  const { object } = await github("/git/ref/heads/main");
  const { tree } = await github(`/git/commits/${object.sha}`);
  const body = JSON.stringify({ message: "chore: publish changes", tree: tree.sha, parents: [object.sha] });
  const made = await github("/git/commits", { method: "POST", body });
  await github("/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: made.sha }) });
};

export const start = () => {
  const box = document.createElement("span");
  box.style.cssText = "display: inline-flex; align-items: center; gap: 12px;";
  const text = document.createElement("span");
  text.style.whiteSpace = "nowrap";
  const link = document.createElement("a");
  link.href = "/admin/guestbook";
  link.textContent = "guestbook";
  link.style.color = "inherit";
  const button = document.createElement("button");
  box.append(link, text, button);
  let current = { state: "unknown" };
  let timer;
  let tried;

  const render = () => {
    const v = view(current);
    text.textContent = v.text;
    text.style.color = current.state === "failed" ? "hsl(2 60% 42%)" : "hsl(18 12% 40%)";
    (button.querySelector(".label") ?? button).textContent = v.label;
    button.disabled = v.busy;
    button.setAttribute("aria-disabled", String(v.busy));
  };

  const go = async () => {
    clearTimeout(timer);
    tried = current.head;
    current = { state: "updating" };
    render();
    await publish().catch(() => {
      current = { state: "failed", head: tried };
      render();
    });
    timer = setTimeout(refresh, 5_000);
  };

  const refresh = async () => {
    clearTimeout(timer);
    const next = await fetchCommits().then((commits) => status({ commits, now: Date.now() }), () => current);
    current = settle(next, tried);
    if (current.ready) return go();
    render();
    timer = setTimeout(refresh, current.state === "live" ? 60_000 : 15_000);
  };

  button.onclick = go;

  const place = () => {
    const native = document.querySelector('button[data-label="Publish Changes"]');
    if (!native || box.isConnected || !token()) return;
    button.className = native.className.replace("secondary", "primary");
    button.innerHTML = native.innerHTML;
    native.style.display = "none";
    native.before(box);
    refresh();
  };

  new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
  addEventListener("focus", () => box.isConnected && current.state !== "updating" && refresh());
};
