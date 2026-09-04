#!/usr/bin/env node
/* ============================================================
   The Daily · build.mjs

   Turns editions/*.json into static pages:
     index.html               the latest edition
     editions/YYYY-MM-DD.html every edition, permanent
     archive.html             every edition, newest first
     sources.html             where the paper comes from

   No dependencies. Node 18 or newer.

     node scripts/build.mjs           build everything
     node scripts/build.mjs --check   validate editions only, no output
   ============================================================ */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const TZ = "Europe/London";
const site = JSON.parse(readFileSync(join(ROOT, "site.json"), "utf8"));
const sources = JSON.parse(readFileSync(join(ROOT, "sources.json"), "utf8"));

const SECTIONS = [
  { id: "ai", title: "AI" },
  { id: "technology", title: "Technology" },
  { id: "apple", title: "Apple" },
  { id: "film", title: "Film" },
  { id: "sport", title: "Sport" }
];
const SPORT_ORDER = ["Celtics", "Manchester United", "Patriots", "F1", "Red Sox"];

/* ---------- Helpers ---------- */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* Straight quotes become typographic ones in rendered copy. */
function typo(s) {
  return String(s ?? "")
    .replace(/(^|[\s(\[\u201C\u2018])"/g, "$1\u201C")
    .replace(/"/g, "\u201D")
    .replace(/(^|[\s(\[\u201C])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}
const t = (s) => esc(typo(s));

const fmt = (d, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d).replace(/\bSept\b/, "Sep");
const isoDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const noon = (day) => new Date(day + "T12:00:00Z");

function longDate(day) {
  return fmt(noon(day), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(",", "");
}
function shortDate(day) {
  return fmt(noon(day), { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "");
}
function monthYear(day) {
  if (!day) return "";
  return fmt(noon(day.slice(0, 10)), { month: "long", year: "numeric" });
}

/* When a story was published, relative to the edition day, London time. */
function whenLabel(published, editionDay) {
  if (!published) return "";
  const d = new Date(published);
  if (isNaN(d)) return "";
  const day = isoDay(d);
  if (day === editionDay) return fmt(d, { hour: "2-digit", minute: "2-digit" });
  const diff = (noon(editionDay) - noon(day)) / 86400000;
  if (diff <= 6) return fmt(d, { weekday: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");
  return fmt(d, { day: "numeric", month: "short" });
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}


/* ---------- Enrichment ----------
   The editor writes title, url and tldr. Everything the reader also
   wants (source, timestamp, the newsletter's subtitle, an episode's
   duration) is filled in here from this morning's candidates and the
   catalogues, then written back into the edition so it stays
   self-contained once _build/ is gone. */

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function urlKey(u) {
  try {
    const x = new URL(String(u).trim());
    return (x.origin + x.pathname).replace(/\/$/, "").toLowerCase();
  } catch {
    return String(u).trim().toLowerCase();
  }
}

const candidates = loadJson(join(ROOT, "_build", "candidates.json"), null);
const candByUrl = new Map();
if (candidates) for (const list of Object.values(candidates.topics || {})) for (const it of list) candByUrl.set(urlKey(it.url), it);
const lennyByUrl = new Map(loadJson(join(ROOT, "data", "lenny.json"), []).map((p) => [urlKey(p.url), p]));
const podByUrl = new Map();
for (const e of loadJson(join(ROOT, "data", "podcasts.json"), [])) {
  podByUrl.set(urlKey(e.url), e);
  if (e.apple) podByUrl.set(urlKey(e.apple), e);
}

function enrich(ed) {
  let changed = false;
  const fill = (obj, k, v) => {
    if ((obj[k] === undefined || obj[k] === null || obj[k] === "") && v !== undefined && v !== null && v !== "") {
      obj[k] = v;
      changed = true;
    }
  };
  const stories = [...(ed.front || [])];
  for (const s of ed.sections || []) stories.push(...(s.stories || []));
  if (ed.finally) stories.push(ed.finally);
  for (const s of stories) {
    if (!s || !s.url) continue;
    const c = candByUrl.get(urlKey(s.url));
    if (!c) continue;
    fill(s, "title", c.title);
    fill(s, "source", c.source);
    fill(s, "published", c.published);
  }
  if (ed.read && ed.read.url) {
    const p = lennyByUrl.get(urlKey(ed.read.url));
    if (p) {
      fill(ed.read, "title", p.title);
      fill(ed.read, "subtitle", p.subtitle);
      fill(ed.read, "published", p.date);
      fill(ed.read, "words", p.words);
      fill(ed.read, "minutes", p.minutes);
      if (ed.read.paid === undefined) {
        ed.read.paid = p.audience === "only_paid";
        changed = true;
      }
    }
  }
  for (const l of ed.listen || []) {
    if (!l || !l.url) continue;
    const e = podByUrl.get(urlKey(l.url));
    if (!e) continue;
    fill(l, "show", e.show);
    fill(l, "title", e.title);
    fill(l, "published", e.date);
    fill(l, "duration", e.duration);
    fill(l, "apple", e.apple);
  }
  return changed;
}

/* ---------- Validation ---------- */

function validate(ed, file) {
  const errs = [];
  const urls = new Map();
  const story = (s, where, opts = {}) => {
    if (!s || typeof s !== "object") return errs.push(`${where}: not an object`);
    for (const k of ["title", "url", "source", "tldr"]) {
      if (!s[k] || typeof s[k] !== "string") errs.push(`${where}: missing "${k}"`);
    }
    if (s.url && !/^https?:\/\/\S+$/i.test(s.url)) errs.push(`${where}: url does not look like a link`);
    if (s.url && candidates && !candByUrl.has(urlKey(s.url)) && !(s.source && s.published)) {
      errs.push(`${where}: url is not in this morning's candidates; stories come from _build/candidates.md`);
    }
    if (s.tldr && s.tldr.split(/\s+/).length > 60) errs.push(`${where}: tldr is over 60 words (${s.tldr.split(/\s+/).length})`);
    if (s.title && s.title.length > 140) errs.push(`${where}: title is over 140 characters`);
    if (/—/.test(`${s.title} ${s.tldr}`)) errs.push(`${where}: contains an em dash; use a comma, full stop or colon`);
    if (s.url) {
      if (urls.has(s.url)) errs.push(`${where}: duplicate url also at ${urls.get(s.url)}`);
      urls.set(s.url, where);
    }
    if (opts.tag && !s.tag) errs.push(`${where}: sport stories need a "tag" (${SPORT_ORDER.join(", ")})`);
    if (s.tag && opts.tag && !SPORT_ORDER.includes(s.tag)) errs.push(`${where}: unknown tag "${s.tag}"`);
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ed.date || "")) errs.push(`date must be YYYY-MM-DD`);
  if (file && ed.date && file !== `${ed.date}.json`) errs.push(`file name ${file} does not match date ${ed.date}`);
  if (!Array.isArray(ed.front) || ed.front.length < 1) errs.push("front needs at least one story");
  else ed.front.forEach((s, i) => story(s, `front[${i}]`));
  if (!Array.isArray(ed.sections)) errs.push("sections must be an array");
  else {
    const ids = new Set();
    ed.sections.forEach((sec, i) => {
      if (!SECTIONS.some((s) => s.id === sec.id)) errs.push(`sections[${i}]: unknown id "${sec.id}" (use ${SECTIONS.map((s) => s.id).join(", ")})`);
      if (ids.has(sec.id)) errs.push(`sections[${i}]: duplicate section "${sec.id}"`);
      ids.add(sec.id);
      if (!Array.isArray(sec.stories)) errs.push(`sections[${i}]: stories must be an array`);
      else sec.stories.forEach((s, j) => story(s, `sections[${i}:${sec.id}].stories[${j}]`, { tag: sec.id === "sport" }));
    });
  }
  if (!ed.read || typeof ed.read !== "object") errs.push("read (Lenny's Newsletter pick) is required");
  else for (const k of ["title", "url", "why"]) if (!ed.read[k]) errs.push(`read: missing "${k}"`);
  if (!Array.isArray(ed.listen) || ed.listen.length < 1) errs.push("listen needs at least one episode");
  else ed.listen.forEach((l, i) => { for (const k of ["show", "title", "url", "why"]) if (!l[k]) errs.push(`listen[${i}]: missing "${k}"`); });
  if (ed.finally) story(ed.finally, "finally");
  if (ed.note && typeof ed.note !== "string") errs.push("note must be a string");
  return errs;
}

/* ---------- Rendering ---------- */

function storyHtml(s, editionDay, opts = {}) {
  const when = whenLabel(s.published, editionDay);
  return `
        <li class="story${opts.lead ? " story-lead" : ""}">
          <h3 class="story-title"><a href="${esc(s.url)}" rel="noopener">${t(s.title)}</a></h3>
          <p class="story-tldr">${t(s.tldr)}</p>
          <p class="story-meta"><span class="story-source">${esc(s.source)}</span>${when ? `<span class="story-time">${esc(when)}</span>` : ""}</p>
        </li>`;
}

function storiesHtml(stories, editionDay, { grouped = false, lead = false } = {}) {
  if (!stories.length) return "";
  if (!grouped) {
    return `<ol class="stories">${stories.map((s, i) => storyHtml(s, editionDay, { lead: lead && i === 0 })).join("")}\n      </ol>`;
  }
  const order = [...SPORT_ORDER, ...stories.map((s) => s.tag).filter((t) => !SPORT_ORDER.includes(t))];
  const groups = new Map();
  for (const s of stories) {
    if (!groups.has(s.tag)) groups.set(s.tag, []);
    groups.get(s.tag).push(s);
  }
  return [...groups.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([tag, list]) => `
      <h3 class="group-h">${esc(tag)}</h3>
      <ol class="stories">${list.map((s) => storyHtml(s, editionDay)).join("")}
      </ol>`)
    .join("");
}

function pickReadHtml(r) {
  const meta = [];
  if (r.published) meta.push(monthYear(r.published));
  if (r.words) meta.push(`${Number(r.words).toLocaleString("en-GB")} words`);
  if (r.minutes) meta.push(`${r.minutes} min`);
  return `
        <article class="card glass pick">
          <p class="pick-kicker">Today's read · Lenny's Newsletter</p>
          <h3 class="pick-title"><a href="${esc(r.url)}" rel="noopener">${t(r.title)}</a></h3>
          ${r.subtitle ? `<p class="pick-sub">${t(r.subtitle)}</p>` : ""}
          <p class="pick-why">${t(r.why)}</p>
          <p class="pick-meta">${meta.map(esc).join(" · ")}${r.paid ? `${meta.length ? " · " : ""}<span class="tag">Paid</span>` : ""}</p>
        </article>`;
}

function pickListenHtml(l) {
  const show = sources.podcasts.find((p) => p.show === l.show);
  const meta = [];
  if (l.published) meta.push(monthYear(l.published));
  if (l.duration) meta.push(l.duration);
  const appleUrl = l.apple || show?.apple || "";
  const apple = appleUrl && urlKey(appleUrl) !== urlKey(l.url) ? `<a class="pick-alt" href="${esc(appleUrl)}" rel="noopener">Apple Podcasts</a>` : "";
  return `
        <article class="card glass pick">
          <p class="pick-kicker">Today's listen · ${esc(l.show)}</p>
          <h3 class="pick-title"><a href="${esc(l.url)}" rel="noopener">${t(l.title)}</a></h3>
          <p class="pick-why">${t(l.why)}</p>
          <p class="pick-meta">${meta.map(esc).join(" · ")}${apple ? `${meta.length ? " · " : ""}${apple}` : ""}</p>
        </article>`;
}

function menuHtml(ed, { editionPage = false } = {}) {
  const links = [];
  const anchor = (id, label) => links.push(`<a href="#${id}">${label}</a>`);
  if (ed) {
    anchor("front", "Front page");
    anchor("picks", "Read and listen");
    for (const s of SECTIONS) {
      const sec = ed.sections.find((x) => x.id === s.id);
      if (sec && sec.stories.length) anchor(s.id, s.title);
    }
  }
  links.push(`<a href="/archive">Archive</a>`);
  if (editionPage || !ed) links.push(`<a href="/">Today</a>`);
  return `
  <nav class="menu glass" aria-label="Sections">
    <div class="menu-inner">
      <div class="menu-links" inert>
        ${links.join("\n        ")}
        <span class="menu-divider" role="presentation"></span>
      </div>
      <button class="menu-trigger" type="button" aria-expanded="false">Sections</button>
    </div>
  </nav>`;
}

function page({ title, description, path, body, menu }) {
  return `<!doctype html>
<html lang="en-GB" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#16180f" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="noindex" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${esc(site.url + path)}" />
  <link rel="canonical" href="${esc(site.url + path)}" />
  <link rel="icon" href="/img/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="${esc(site.name)}" />
  <link rel="stylesheet" href="/css/site.css" />
  <link rel="stylesheet" href="/css/daily.css" />
</head>
<body>

  <main>${body}
  </main>
${menu}

  <script src="/js/daily.js"></script>
</body>
</html>
`;
}

function colophon(feedCount) {
  return `
    <footer class="colophon">
      <p>Curated each morning by Claude from ${feedCount} ungated sources, for <a href="${esc(site.owner_url)}">${esc(site.owner)}</a>. The summaries are the editor's; the reporting belongs to the outlets linked.</p>
      <p class="colophon-links"><a href="/archive">Archive</a><a href="/sources">Sources</a><a href="${esc(site.owner_url)}">damianpickett.com</a></p>
    </footer>`;
}

function editionHtml(ed, number, feedCount, { editionPage = false } = {}) {
  const day = ed.date;
  const sections = SECTIONS.map((def) => {
    const sec = ed.sections.find((x) => x.id === def.id);
    if (!sec || !sec.stories.length) return "";
    return `
    <section id="${def.id}" class="section" aria-labelledby="h-${def.id}">
      <h2 class="section-h" id="h-${def.id}">${esc(def.title)}</h2>
      ${storiesHtml(sec.stories, day, { grouped: def.id === "sport" })}
    </section>`;
  }).join("");

  const body = `
    <header class="masthead fade-in" style="--d: 0">
      <p class="masthead-kicker"><a href="${esc(site.owner_url)}">${esc(site.owner)}</a> · No. ${number}</p>
      <h1 class="page-title">${esc(site.name)}</h1>
      <p class="dateline">${esc(longDate(day))}</p>
      ${ed.note ? `<p class="standfirst">${t(ed.note)}</p>` : ""}
    </header>

    <section id="front" class="section front fade-in" style="--d: 1" aria-labelledby="h-front">
      <h2 class="section-h" id="h-front">Front page</h2>
      ${storiesHtml(ed.front, day, { lead: true })}
    </section>

    <section id="picks" class="section picks fade-in" style="--d: 2" aria-labelledby="h-picks">
      <h2 class="section-h" id="h-picks">Read and listen</h2>
      <div class="picks-grid">${pickReadHtml(ed.read)}${ed.listen.map(pickListenHtml).join("")}
      </div>
    </section>
${sections}
${ed.finally ? `
    <section id="finally" class="section finally" aria-labelledby="h-finally">
      <h2 class="section-h" id="h-finally">And finally</h2>
      ${storiesHtml([ed.finally], day)}
    </section>` : ""}
${colophon(feedCount)}`;

  return page({
    title: `${site.name} · ${shortDate(day)}`,
    description: ed.front[0] ? `${ed.front[0].title}. ${site.description}` : site.description,
    path: editionPage ? `/editions/${day}` : "/",
    body,
    menu: menuHtml(ed, { editionPage })
  });
}

function archiveHtml(editions, feedCount) {
  const rows = editions
    .map(
      (e) => `
        <li class="edition-row">
          <h2 class="edition-date"><a href="/editions/${esc(e.ed.date)}">${esc(longDate(e.ed.date))}</a></h2>
          <p class="edition-lead">No. ${e.number} · ${t(e.ed.front.map((s) => s.title).slice(0, 2).join(" · "))}</p>
        </li>`
    )
    .join("");
  const body = `
    <header class="masthead fade-in" style="--d: 0">
      <p class="masthead-kicker"><a href="/">${esc(site.name)}</a></p>
      <h1 class="page-title">Archive</h1>
      <p class="dateline">${editions.length} edition${editions.length === 1 ? "" : "s"}</p>
    </header>
    <section class="section fade-in" style="--d: 1">
      <ol class="editions">${rows}
      </ol>
    </section>
${colophon(feedCount)}`;
  return page({ title: `Archive · ${site.name}`, description: `Every edition of ${site.name}.`, path: "/archive", body, menu: menuHtml(null) });
}

function sourcesHtml(feedCount) {
  const groups = sources.topics
    .map((t) => {
      const items = t.feeds.map((f) => `<li><a href="${esc(f.site)}" rel="noopener">${esc(f.name)}</a><span class="source-host">${esc(host(f.site))}</span></li>`).join("");
      return `
      <div class="source-group">
        <h2 class="group-h">${esc(t.group ? `Sport · ${t.title}` : t.title)}</h2>
        <ul class="source-list">${items}</ul>
      </div>`;
    })
    .join("");
  const pods = sources.podcasts.map((p) => `<li><a href="${esc(p.site)}" rel="noopener">${esc(p.show)}</a><span class="source-host">${esc(p.host)}</span></li>`).join("");
  const body = `
    <header class="masthead fade-in" style="--d: 0">
      <p class="masthead-kicker"><a href="/">${esc(site.name)}</a></p>
      <h1 class="page-title">Sources</h1>
      <p class="dateline">${feedCount} feeds, one newsletter, three podcasts</p>
      <p class="standfirst">Every story links to the outlet that reported it. Sources are chosen for reliability and for being readable without a paywall; the exception is Lenny's Newsletter, which is worth it.</p>
    </header>
    <section class="section fade-in" style="--d: 1">${groups}
      <div class="source-group">
        <h2 class="group-h">Read</h2>
        <ul class="source-list"><li><a href="${esc(sources.lenny.site)}" rel="noopener">${esc(sources.lenny.name)}</a><span class="source-host">${esc(host(sources.lenny.site))}</span></li></ul>
      </div>
      <div class="source-group">
        <h2 class="group-h">Listen</h2>
        <ul class="source-list">${pods}</ul>
      </div>
    </section>
${colophon(feedCount)}`;
  return page({ title: `Sources · ${site.name}`, description: `Where ${site.name} comes from.`, path: "/sources", body, menu: menuHtml(null) });
}

/* ---------- Main ---------- */

const dir = join(ROOT, "editions");
mkdirSync(dir, { recursive: true });
const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const feedCount = sources.topics.reduce((n, t) => n + t.feeds.length, 0);

let failed = false;
const editions = [];
for (const [i, f] of files.entries()) {
  let ed;
  try {
    ed = JSON.parse(readFileSync(join(dir, f), "utf8"));
  } catch (err) {
    console.error(`✗ ${f}: invalid JSON (${err.message})`);
    failed = true;
    continue;
  }
  const enriched = enrich(ed);
  const errs = validate(ed, f);
  if (enriched && !errs.length && !CHECK) writeFileSync(join(dir, f), JSON.stringify(ed, null, 2) + "\n");
  if (errs.length) {
    failed = true;
    console.error(`✗ ${f}:`);
    for (const e of errs) console.error(`   ${e}`);
    continue;
  }
  editions.push({ ed, number: i + 1, file: f });
}

if (failed) {
  console.error("Build stopped: fix the edition(s) above.");
  process.exit(1);
}
if (!editions.length) {
  console.error("No editions found in editions/. Nothing to build.");
  process.exit(1);
}
if (CHECK) {
  console.log(`✓ ${editions.length} edition${editions.length === 1 ? "" : "s"} valid`);
  process.exit(0);
}

for (const e of editions) {
  writeFileSync(join(dir, `${e.ed.date}.html`), editionHtml(e.ed, e.number, feedCount, { editionPage: true }));
}
const latest = editions[editions.length - 1];
writeFileSync(join(ROOT, "index.html"), editionHtml(latest.ed, latest.number, feedCount));
writeFileSync(join(ROOT, "archive.html"), archiveHtml([...editions].reverse(), feedCount));
writeFileSync(join(ROOT, "sources.html"), sourcesHtml(feedCount));

const stories = latest.ed.front.length + latest.ed.sections.reduce((n, s) => n + s.stories.length, 0) + (latest.ed.finally ? 1 : 0);
console.log(`✓ Built ${editions.length} edition${editions.length === 1 ? "" : "s"}. Latest: ${latest.ed.date} (No. ${latest.number}), ${stories} stories, ${latest.ed.listen.length} listen pick${latest.ed.listen.length === 1 ? "" : "s"}.`);
