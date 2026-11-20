import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REPOS = [
  "ericjuta/omp-optchat",
  "ericjuta/omp-jevify",
  "ericjuta/ate-nix",
  "ericjuta/isodia-mcp",
  "askgina/plugins",
  "askgina/os",
];

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

async function fetchJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ericjuta-profile-updater",
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function relDate(iso) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  const months = Math.floor(diffDays / 30);
  return `${months}mo ago`;
}

function truncate(s, max) {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

async function getLatestCommit(repo) {
  const commits = await fetchJson(
    `https://api.github.com/repos/${repo}/commits?per_page=1`
  );
  const c = commits[0];
  if (!c) return null;
  const msg = (c.commit?.message || "").split("\n")[0].trim();
  const date = c.commit?.committer?.date || c.commit?.author?.date;
  return {
    repo,
    sha: c.sha.slice(0, 7),
    url: c.html_url,
    msg,
    date,
  };
}

async function main() {
  const items = [];
  for (const repo of REPOS) {
    try {
      const c = await getLatestCommit(repo);
      if (c) items.push(c);
    } catch (err) {
      console.error(`warn: ${repo}: ${err.message}`);
    }
  }
  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  const shortName = (r) => r.replace(/^ericjuta\//, "");
  const nameCol = Math.max(...items.map((i) => shortName(i.repo).length), 15);
  const updated = new Date().toISOString().slice(0, 10);

  const lines = [
    `eric@london ~ % git log --public --latest  # updated ${updated}`,
    "",
    ...items.map((item, idx) => {
      const branch = idx === items.length - 1 ? "└─" : "├─";
      const label = shortName(item.repo);
      const pad = " ".repeat(Math.max(1, nameCol - label.length + 2));
      const repoUrl = `https://github.com/${item.repo}`;
      const age = relDate(item.date).padEnd(7, " ");
      const msg = escapeHtml(truncate(item.msg, 52));
      return `${branch} <a href="${repoUrl}">${escapeHtml(label)}</a>${pad}<a href="${item.url}">${item.sha}</a>  ${age}  ${msg}`;
    }),
  ];

  const block = `<pre>\n${lines.join("\n")}\n</pre>`;
  const readmePath = new URL("../README.md", import.meta.url);
  const readme = readFileSync(readmePath, "utf8");
  const start = "<!-- LIVE_LOG:START -->";
  const end = "<!-- LIVE_LOG:END -->";
  const sIdx = readme.indexOf(start);
  const eIdx = readme.indexOf(end);
  if (sIdx === -1 || eIdx === -1 || eIdx < sIdx) {
    throw new Error("Missing LIVE_LOG markers in README.md");
  }
  const next =
    readme.slice(0, sIdx + start.length) +
    "\n" +
    block +
    "\n" +
    readme.slice(eIdx);

  if (next !== readme) {
    writeFileSync(readmePath, next, "utf8");
    console.log("Updated README.md");
  } else {
    console.log("No changes");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
