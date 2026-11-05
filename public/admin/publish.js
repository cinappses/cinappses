const api = "https://api.github.com";
const repo = `${api}/repos/cinappses/cinappses`;
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

export const view = ({ state, count }) =>
  ({
    unknown: { text: "", label: "publish", busy: false },
    waiting: { text: `${count} saved, live in a minute`, label: "publish now", busy: false },
    updating: { text: "updating the site...", label: "publishing...", busy: true },
    live: { text: "site is up to date", label: "published", busy: true },
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
  const res = await fetch(path.startsWith("/graphql") ? api + path : repo + path, {
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
  const input = {
    branch: { repositoryNameWithOwner: "cinappses/cinappses", branchName: "main" },
    message: { headline: "chore: publish changes" },
    expectedHeadOid: object.sha,
    fileChanges: {},
  };
  const query = "mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }";
  const { errors } = await github("/graphql", { method: "POST", body: JSON.stringify({ query, variables: { input } }) });
  if (errors) throw new Error(errors[0].message);
};

export const start = () => {
  const note = document.createElement("span");
  note.className = "publish-bar";
  note.style.cssText = "align-items: center; gap: 12px; white-space: nowrap;";
  const link = document.createElement("a");
  link.href = "/admin/guestbook";
  link.title = "guestbook";
  link.setAttribute("aria-label", "guestbook");
  const text = document.createElement("span");
  text.className = "publish-note";
  note.append(link, text);
  const button = document.createElement("button");
  let current = { state: "unknown" };
  let timer;
  let tried;
  let run = 0;

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
    run += 1;
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
    const mine = ++run;
    const next = await fetchCommits().then((commits) => status({ commits, now: Date.now() }), () => current);
    if (mine !== run) return;
    current = settle(next, tried);
    if (current.ready) return go();
    render();
    timer = setTimeout(refresh, current.state === "live" ? 60_000 : 15_000);
  };

  button.onclick = go;

  const place = () => {
    if (!token()) return;
    const assets = document.querySelector('button[aria-label="Assets"]');
    if (assets && !note.isConnected) {
      link.className = assets.className.replace("select-button", "");
      link.innerHTML = `<span class="${assets.querySelector(".icon")?.className}" aria-hidden="true">menu_book</span>`;
      (assets.closest(".wrapper") ?? assets).after(note);
    }
    const native = document.querySelector('button[data-label="Publish Changes"]');
    if (!native || button.isConnected) return;
    button.className = native.className.replace("secondary", "primary");
    button.innerHTML = native.innerHTML;
    native.style.display = "none";
    native.before(button);
    refresh();
  };

  new MutationObserver(place).observe(document.body, { childList: true, subtree: true });
  addEventListener("focus", () => button.isConnected && current.state !== "updating" && refresh());
};
