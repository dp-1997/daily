#!/usr/bin/env node
/* ============================================================
   The DJ · fetch.mjs

   Pulls fresh items from every feed in sources.json, refreshes the
   Lenny's Newsletter and podcast catalogues in data/, and writes the
   morning's candidate list to _build/candidates.json and
   _build/candidates.md for the editor (Claude) to curate.

   No dependencies. Node 18 or newer.

     node scripts/fetch.mjs                 normal morning run
     node scripts/fetch.mjs --hours 48      wider window for quiet days
     node scripts/fetch.mjs --full          rebuild the Lenny catalogue
     node scripts/fetch.mjs --no-catalogues feeds only
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const val = (f, d) => {
  const i = ARGS.indexOf(f);
  return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : d;
};

const sources = JSON.parse(readFileSync(join(ROOT, "sources.json"), "utf8"));
const HOURS = Number(val("--hours", sources.window_hours || 30));
const PER_SOURCE = sources.per_source_cap || 10;
const PER_TOPIC = sources.per_topic_cap || 30;
const SUMMARY = sources.summary_chars || 200;
const NEW_POD_HOURS = sources.podcast_new_hours || 36;
const NEW_LENNY_HOURS = sources.lenny_new_hours || 36;
const UNDATED_CAP = 8;
const EXCLUDE = (sources.exclude_titles || []).map((p) => new RegExp(p, "i"));
const BLOCKED = sources.blocked_hosts || [];
const MEDIA = /\.(mp4|mp3|m4a|mov|pdf|zip)(\?|$)/i;
const NOW = new Date();
const SINCE = new Date(NOW.getTime() - HOURS * 3600 * 1000);
const TZ = "Europe/London";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 TheDJ/1.0 (personal reader)";

/* ---------- Small helpers ---------- */

const fmt = (d, opts) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d);
const isoDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const TODAY = isoDay(NOW);
const INVISIBLE = /[\u200B-\u200F\u2060\uFEFF\u00AD]/g;
const hoursAgo = (iso) => (NOW - new Date(iso)) / 3600000;
const daysAgo = (iso) => (NOW - new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso)) / 86400000;

function whenLabel(d) {
  if (!d) return "undated";
  if (isoDay(d) === TODAY) return fmt(d, { hour: "2-digit", minute: "2-digit" });
  return fmt(d, { weekday: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™", pound: "£", euro: "€",
  laquo: "«", raquo: "»", bull: "•", middot: "·", times: "×", deg: "°", eacute: "é", egrave: "è", uuml: "ü",
  ouml: "ö", auml: "ä", ntilde: "ñ", ccedil: "ç", agrave: "à", aacute: "á", oacute: "ó", iacute: "í", uacute: "ú", zwnj: "", zwj: ""
};

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const unwrap = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

/* HTML or XML fragment to plain text. Decodes twice because many feeds
   double-escape HTML inside description elements. */
function text(s) {
  if (!s) return "";
  let t = unwrap(s);
  t = decode(t);
  t = t.replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = decode(t);
  return t.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")) || attrs.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? m[1] : "";
}

function atomLink(block) {
  const links = [...block.matchAll(/<(?:atom:)?link\b([^>]*?)\/?>/gi)].map((m) => m[1]);
  let alt = null;
  let any = null;
  for (const attrs of links) {
    const href = attr(attrs, "href");
    if (!href) continue;
    const rel = attr(attrs, "rel");
    if (!rel || rel === "alternate") alt = alt ?? href;
    any = any ?? href;
  }
  return alt ?? any;
}

/* The best picture a feed item offers, if any. */
function itemImage(block) {
  let best = "";
  let bestW = -1;
  for (const m of block.matchAll(/<media:content\b([^>]*)>/gi)) {
    const url = attr(m[1], "url");
    if (!url) continue;
    const type = attr(m[1], "type");
    const medium = attr(m[1], "medium");
    if (type && !/^image\//i.test(type)) continue;
    if (medium && medium !== "image") continue;
    const w = Number(attr(m[1], "width") || 0);
    if (w > bestW) {
      best = url;
      bestW = w;
    }
  }
  if (!best) {
    const t = block.match(/<media:thumbnail\b([^>]*)>/i);
    if (t) best = attr(t[1], "url");
  }
  if (!best) {
    const e = block.match(/<enclosure\b([^>]*)>/i);
    if (e && /^image\//i.test(attr(e[1], "type"))) best = attr(e[1], "url");
  }
  if (!best) {
    const it = block.match(/<itunes:image\b([^>]*)>/i);
    if (it) best = attr(it[1], "href");
  }
  if (!best) {
    const html = decode(decode(unwrap(tag(block, "content:encoded") || tag(block, "description") || tag(block, "content") || tag(block, "summary") || "")));
    for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
      const src = attr(m[1], "src");
      if (!src) continue;
      const w = Number(attr(m[1], "width") || 0);
      if (w && w < 80) continue;
      if (/pixel|tracker|feedburner|1x1|\.gif(\?|$)|emoji|gravatar|badge|icon|spacer|avatar/i.test(src)) continue;
      best = src;
      break;
    }
  }
  best = decode(best || "").replace(INVISIBLE, "").trim();
  if (best.startsWith("//")) best = "https:" + best;
  return /^https?:\/\//i.test(best) ? best : "";
}

function truncate(s, n) {
  if (!s || s.length <= n) return s || "";
  const cut = s.slice(0, n);
  const at = cut.lastIndexOf(" ");
  return (at > n * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:]+$/, "") + "…";
}

function host(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normUrl(u) {
  try {
    const x = new URL(u.replace(INVISIBLE, "").trim());
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) {
      if (/^(utm_|at_|ref$|source$|ftag|cmpid|ncid|sr_share|mc_cid|mc_eid|guccounter|guce_referrer|ns_|ocid)/i.test(k)) x.searchParams.delete(k);
    }
    let s = x.toString();
    if (s.endsWith("/") && x.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return u.trim();
  }
}

const isBlocked = (u) => {
  const h = host(u);
  return BLOCKED.some((b) => h === b || h.endsWith("." + b));
};

const isHomepage = (u) => {
  try {
    const x = new URL(u);
    return x.pathname === "/" || x.pathname === "";
  } catch {
    return true;
  }
};

const titleKey = (t) => text(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function duration(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  let secs = 0;
  if (/^\d+$/.test(s)) secs = Number(s);
  else if (/^\d+:\d+(:\d+)?$/.test(s)) {
    const p = s.split(":").map(Number);
    secs = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  } else return s;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/* JavaScript's date parser rejects European zone abbreviations that
   some UK feeds use (Sky Sports: "BST"). */
const ZONES = { BST: "+0100", IST: "+0100", CET: "+0100", CEST: "+0200", WET: "+0000", WEST: "+0100", EET: "+0200", EEST: "+0300" };
const fixZone = (s) => s.replace(/\s(BST|IST|CET|CEST|WET|WEST|EET|EEST)$/i, (m, z) => " " + ZONES[z.toUpperCase()]);

/* ---------- Network ---------- */

/* Some publishers refuse a browser-like user agent from a data centre
   but accept a plain feed-reader one, or the reverse, so a 403 is
   retried down a short ladder of identities before giving up. */
const AGENTS = [
  UA,
  "TheDJ/1.0 (+https://daily.damianpickett.com; personal RSS reader; damianpickett.com)",
  "Mozilla/5.0 (compatible; FeedFetcher-TheDJ/1.0; +https://daily.damianpickett.com)"
];

async function get(url, { timeout = 20000, accept } = {}) {
  let lastErr = null;
  for (const [i, agent] of AGENTS.entries()) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": agent,
          accept: accept || "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5",
          "accept-language": "en-GB,en;q=0.9"
        },
        signal: ctrl.signal,
        redirect: "follow"
      });
      if (res.ok) return await res.text();
      lastErr = new Error(`HTTP ${res.status}`);
      if (![403, 429, 503].includes(res.status) || i === AGENTS.length - 1) throw lastErr;
    } catch (err) {
      lastErr = err;
      if (i === AGENTS.length - 1 || !/HTTP (403|429|503)/.test(String(err.message))) throw err;
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

/* ---------- Feed parsing (RSS 2.0, RSS 1.0 and Atom) ---------- */

function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = isAtom
    ? xml.match(/<entry[\s>][\s\S]*?<\/entry\s*>/gi) || []
    : xml.match(/<item[\s>][\s\S]*?<\/item\s*>/gi) || [];
  return blocks
    .map((b) => {
      const title = text(tag(b, "title") || "");
      let link = isAtom ? atomLink(b) : text(tag(b, "link") || "");
      if (!link) {
        const g = tag(b, "guid");
        if (g && /^https?:/i.test(text(g))) link = text(g);
      }
      if (!link) link = atomLink(b) || "";
      link = (link || "").replace(INVISIBLE, "").trim();
      if (!/^https?:\/\//i.test(link)) link = "";
      const guid = text(tag(b, "guid") || tag(b, "id") || "") || link;
      const dateRaw = tag(b, "pubDate") || tag(b, "published") || tag(b, "dc:date") || tag(b, "updated");
      let published = dateRaw ? new Date(fixZone(text(dateRaw))) : null;
      if (published && isNaN(published)) published = null;
      const summaryRaw = tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content") || "";
      const summary = text(summaryRaw);
      const dur = tag(b, "itunes:duration");
      return { title, link, guid, published, summary, duration: duration(dur ? text(dur) : ""), image: itemImage(b) };
    })
    .filter((it) => it.title);
}

/* ---------- Previous editions: what has already run ---------- */

function loadEditions() {
  const dir = join(ROOT, "editions");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function storiesOf(ed) {
  const out = [...(ed.front || [])];
  for (const s of ed.sections || []) out.push(...(s.stories || []));
  if (ed.finally) out.push(ed.finally);
  return out;
}

const editions = loadEditions();
const usedStoryUrls = new Set();
for (const ed of editions.slice(-7)) for (const s of storiesOf(ed)) if (s?.url) usedStoryUrls.add(normUrl(s.url));
const recentReads = editions.filter((e) => daysAgo(e.date) <= 120 && e.read?.url).map((e) => ({ date: e.date, url: e.read.url, title: e.read.title || "" }));
const recentListens = [];
for (const e of editions.filter((e) => daysAgo(e.date) <= 30)) for (const l of e.listen || []) recentListens.push({ date: e.date, show: l.show || "", title: l.title || "", url: l.url });

/* ---------- Fetch the feeds ---------- */

const failed = [];
const feedJobs = [];
for (const topic of sources.topics) for (const feed of topic.feeds) feedJobs.push({ topic, feed });

console.log(`The DJ · fetching ${feedJobs.length} feeds · window ${HOURS}h · ${fmt(NOW, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} (London)`);

const results = await pool(feedJobs, 8, async ({ topic, feed }) => {
  try {
    const xml = await get(feed.url);
    const items = parseFeed(xml);
    if (!items.length) throw new Error("no items parsed");
    return { topic, feed, items };
  } catch (err) {
    failed.push({ topic: topic.id, name: feed.name, url: feed.url, error: String(err.message || err) });
    return { topic, feed, items: [] };
  }
});

const seen = new Set();
const topics = {};
const undatedFeeds = [];
let excludedUsed = 0;
let excludedNoise = 0;

for (const topic of sources.topics) {
  const list = [];
  for (const r of results.filter((r) => r.topic.id === topic.id)) {
    const usable = r.items.filter((it) => it.link && !MEDIA.test(it.link));
    let fresh = usable
      .filter((it) => it.published && it.published >= SINCE && it.published <= new Date(NOW.getTime() + 3600 * 1000))
      .sort((a, b) => b.published - a.published);
    let undated = false;
    if (!fresh.length && usable.length && !usable.some((it) => it.published)) {
      /* A feed with no dates at all (Formula1.com): trust its order. */
      fresh = usable.slice(0, UNDATED_CAP);
      undated = true;
      undatedFeeds.push(r.feed.name);
    }
    let n = 0;
    for (const it of fresh) {
      if (n >= PER_SOURCE) break;
      const url = normUrl(it.link);
      if (seen.has(url)) continue;
      seen.add(url);
      if (usedStoryUrls.has(url)) {
        excludedUsed++;
        continue;
      }
      if (isBlocked(url) || EXCLUDE.some((re) => re.test(it.title))) {
        excludedNoise++;
        continue;
      }
      n++;
      list.push({
        title: truncate(it.title, 160),
        url,
        source: r.feed.name,
        tier: r.feed.tier,
        topic: topic.id,
        published: it.published ? it.published.toISOString() : null,
        when: undated ? "undated" : whenLabel(it.published),
        summary: truncate(it.summary, SUMMARY),
        image: it.image || ""
      });
    }
  }
  const dated = list.filter((it) => it.published).sort((a, b) => b.published.localeCompare(a.published)).slice(0, PER_TOPIC);
  const undatedItems = list.filter((it) => !it.published).slice(0, UNDATED_CAP);
  topics[topic.id] = [...dated, ...undatedItems];
}

/* ---------- Catalogues: Lenny's Newsletter and the podcasts ---------- */

mkdirSync(join(ROOT, "data"), { recursive: true });
let lenny = [];
let podcasts = [];

async function refreshLenny(full) {
  const path = join(ROOT, "data", "lenny.json");
  const known = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const byId = new Map(known.map((p) => [p.id, p]));
  let offset = 0;
  let pages = 0;
  while (offset <= 4000) {
    const raw = await get(sources.lenny.archive_api.replace("{offset}", offset), { accept: "application/json" });
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) break;
    let added = 0;
    for (const p of arr) {
      if (!p.canonical_url) continue;
      const fresh = {
        id: p.id,
        title: text(p.title || ""),
        subtitle: text(p.subtitle || ""),
        url: p.canonical_url,
        date: (p.post_date || "").slice(0, 10),
        type: p.type,
        audience: p.audience,
        words: p.wordcount || null,
        minutes: p.podcast_duration ? Math.round(p.podcast_duration / 60) : null,
        image: p.cover_image || ""
      };
      if (!byId.has(p.id)) added++;
      byId.set(p.id, { ...(byId.get(p.id) || {}), ...fresh });
    }
    pages++;
    offset += 50;
    if (!full && (added === 0 || pages >= 2)) break;
  }
  const posts = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(path, JSON.stringify(posts, null, 1));
  return posts;
}

/* Apple's lookup API gives a per-episode Apple Podcasts link and artwork
   for the 200 most recent episodes of a show, which matters for Founders,
   whose feed carries no episode links at all. */
async function appleEpisodes(show) {
  const m = (show.apple || "").match(/id(\d+)/);
  const out = { map: new Map(), artwork: "" };
  if (!m) return out;
  const raw = await get(`https://itunes.apple.com/lookup?id=${m[1]}&entity=podcastEpisode&limit=200`, { accept: "application/json" });
  for (const e of JSON.parse(raw).results || []) {
    if (e.kind === "podcast" || e.wrapperType === "track" && e.kind !== "podcast-episode") {
      if (!out.artwork && e.artworkUrl600) out.artwork = e.artworkUrl600;
      continue;
    }
    if (e.kind !== "podcast-episode" || !e.trackViewUrl) continue;
    const info = { url: e.trackViewUrl.replace(/\?uo=\d+$/, ""), title: e.trackName || "", artwork: e.artworkUrl600 || "" };
    if (e.episodeGuid) out.map.set("g:" + e.episodeGuid, info);
    if (e.trackName) out.map.set("t:" + titleKey(e.trackName), info);
  }
  return out;
}

/* YouTube's channel feed lists a show's latest 15 uploads. Episodes are
   matched to videos by title, or by guest name plus release date when
   the channel retitles them. Older episodes get a search link instead. */
async function youtubeVideos(show) {
  if (!show.youtube_channel) return [];
  const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${show.youtube_channel}`);
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const b = m[1];
    const id = text(tag(b, "yt:videoId") || "");
    const t = text(tag(b, "title") || "");
    const p = text(tag(b, "published") || "");
    return { id, title: t, date: p.slice(0, 10), url: `https://www.youtube.com/watch?v=${id}` };
  }).filter((v) => v.id && v.title);
}

const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "how", "why", "what", "who", "his", "her", "their", "our", "your", "you", "are", "was", "were", "into", "over", "about", "after", "before", "podcast", "episode", "founders", "acquired", "david", "senra", "part", "full", "interview"]);
const words = (t) => new Set(titleKey(t).split(" ").filter((w) => w.length >= 3 && !STOP.has(w)));

function matchVideo(ep, videos) {
  const k = titleKey(ep.title);
  let best = null;
  let bestScore = 0;
  for (const v of videos) {
    const vk = titleKey(v.title);
    if (vk === k || (k.length > 24 && (vk.includes(k) || k.includes(vk)))) return v;
    const a = words(ep.title);
    const b = words(v.title);
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    const dayDiff = ep.date && v.date ? Math.abs((new Date(ep.date) - new Date(v.date)) / 86400000) : 99;
    const score = shared + (dayDiff <= 3 ? 1 : 0);
    if (shared >= 2 && dayDiff <= 5 && score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

async function refreshPodcasts() {
  const path = join(ROOT, "data", "podcasts.json");
  const known = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const key = (e) => `${e.show}::${e.guid || e.url}`;
  const byKey = new Map(known.map((e) => [key(e), e]));
  for (const show of sources.podcasts) {
    let apple = { map: new Map(), artwork: "" };
    let videos = [];
    try {
      apple = await appleEpisodes(show);
    } catch (err) {
      failed.push({ topic: "podcasts", name: `${show.show} (Apple lookup)`, url: show.apple, error: String(err.message || err) });
    }
    try {
      videos = await youtubeVideos(show);
    } catch (err) {
      failed.push({ topic: "podcasts", name: `${show.show} (YouTube feed)`, url: show.youtube || "", error: String(err.message || err) });
    }
    try {
      const xml = await get(show.feed);
      const items = parseFeed(xml);
      if (!items.length) throw new Error("no episodes parsed");
      for (const it of items) {
        const a = apple.map.get("g:" + it.guid) || apple.map.get("t:" + titleKey(it.title));
        const ownPage = it.link && !isHomepage(it.link) && !/megaphone\.fm|transistor\.fm/i.test(host(it.link)) ? normUrl(it.link) : "";
        const e = {
          show: show.show,
          title: truncate(it.title, 180),
          url: ownPage || a?.url || show.apple,
          page: ownPage,
          apple: a?.url || "",
          artwork: a?.artwork || it.image || apple.artwork || "",
          guid: it.guid,
          date: it.published ? it.published.toISOString().slice(0, 10) : "",
          duration: it.duration,
          summary: truncate(it.summary, 300)
        };
        const v = matchVideo(e, videos);
        const prev = byKey.get(key(e));
        const merged = prev ? { ...prev, ...e } : e;
        merged.apple = e.apple || prev?.apple || "";
        merged.artwork = e.artwork || prev?.artwork || "";
        merged.youtube = v ? v.url : prev?.youtube || "";
        byKey.set(key(e), merged);
      }
    } catch (err) {
      failed.push({ topic: "podcasts", name: show.show, url: show.feed, error: String(err.message || err) });
    }
  }
  const eps = [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(path, JSON.stringify(eps, null, 1));
  return eps;
}

if (!has("--no-catalogues")) {
  try {
    lenny = await refreshLenny(has("--full"));
  } catch (err) {
    failed.push({ topic: "lenny", name: "Lenny's archive API", url: sources.lenny.archive_api, error: String(err.message || err) });
    const p = join(ROOT, "data", "lenny.json");
    if (existsSync(p)) lenny = JSON.parse(readFileSync(p, "utf8"));
  }
  podcasts = await refreshPodcasts();
} else {
  const lp = join(ROOT, "data", "lenny.json");
  const pp = join(ROOT, "data", "podcasts.json");
  if (existsSync(lp)) lenny = JSON.parse(readFileSync(lp, "utf8"));
  if (existsSync(pp)) podcasts = JSON.parse(readFileSync(pp, "utf8"));
}

const recentListenUrls = new Set(recentListens.map((l) => l.url));
const newEpisodes = podcasts.filter((e) => e.date && daysAgo(e.date) <= NEW_POD_HOURS / 24 && !recentListenUrls.has(e.url));
const latestPerShow = sources.podcasts.map((s) => podcasts.find((e) => e.show === s.show)).filter(Boolean);
const showCounts = {};
for (const e of podcasts) showCounts[e.show] = (showCounts[e.show] || 0) + 1;
const recentReadUrls = new Set(recentReads.map((r) => r.url));
const lennyUnused = lenny.filter((p) => !recentReadUrls.has(p.url));
const lennyNew = lennyUnused.filter((p) => p.date && daysAgo(p.date) <= NEW_LENNY_HOURS / 24);
const lennyLatest = lennyUnused.slice(0, 12);

/* ---------- Write the candidate files ---------- */

mkdirSync(join(ROOT, "_build"), { recursive: true });

const feedFailures = failed.filter((f) => f.topic !== "podcasts" && f.topic !== "lenny");
const out = {
  generated_at: NOW.toISOString(),
  date: TODAY,
  window_hours: HOURS,
  feeds: { total: feedJobs.length, ok: feedJobs.length - feedFailures.length, failed, undated: undatedFeeds },
  excluded_already_used: excludedUsed,
  excluded_noise: excludedNoise,
  topics,
  podcasts: { new_episodes: newEpisodes, latest: latestPerShow, recent_picks: recentListens, catalogue: showCounts },
  lenny: { new_posts: lennyNew, recent_picks: recentReads, catalogue_count: lenny.length, latest_unused: lennyLatest }
};
writeFileSync(join(ROOT, "_build", "candidates.json"), JSON.stringify(out, null, 1));

const epLine = (e) => `- ${e.show} · **${e.title}** · ${e.date} · ${e.duration || "?"}${e.youtube ? " · YouTube" : ""}\n  ${e.summary ? e.summary + "\n  " : ""}${e.url}`;
const md = [];
md.push(`# Candidates · ${fmt(NOW, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`);
md.push("");
md.push(`Generated ${fmt(NOW, { hour: "2-digit", minute: "2-digit" })} London time. Window: last ${HOURS} hours. Feeds OK: ${out.feeds.ok}/${out.feeds.total}. Excluded: ${excludedUsed} already used in the last 7 editions, ${excludedNoise} paywalled or noise.`);
if (failed.length) md.push(`Failed: ${failed.map((f) => `${f.name} (${f.error})`).join("; ")}.`);
if (undatedFeeds.length) md.push(`Undated feeds, shown newest first as published: ${undatedFeeds.join(", ")}.`);
md.push("");
for (const topic of sources.topics) {
  const list = topics[topic.id] || [];
  md.push(`## ${topic.group ? "Sport · " : ""}${topic.title} · ${list.length} candidate${list.length === 1 ? "" : "s"}`);
  md.push("");
  if (!list.length) md.push("(nothing in the window)");
  for (const it of list) {
    md.push(`- **${it.title}** · ${it.source} · ${it.when}`);
    if (it.summary) md.push(`  ${it.summary}`);
    md.push(`  ${it.url}`);
  }
  md.push("");
}
md.push(`## Podcasts · new since the last edition (${NEW_POD_HOURS} hours) · ${newEpisodes.length}`);
md.push("");
if (!newEpisodes.length) md.push("(none: recommend a back-catalogue episode from data/podcasts.json)");
for (const e of newEpisodes) md.push(epLine(e));
md.push("");
md.push("Latest episodes of each show not yet recommended, newest first:");
for (const show of sources.podcasts) {
  const eps = podcasts.filter((e) => e.show === show.show && !recentListenUrls.has(e.url)).slice(0, 4);
  md.push(`- ${show.show}:`);
  for (const e of eps) md.push(`  - ${e.date} · **${e.title}** · ${e.duration || "?"}${e.youtube ? " · YouTube" : ""} · ${e.url}`);
}
md.push("");
md.push(`Catalogue in data/podcasts.json: ${Object.entries(showCounts).map(([s, n]) => `${s} ${n}`).join(", ")} episodes. Search it with grep rather than reading it whole.`);
md.push("");
md.push(`## Lenny's Newsletter · ${lenny.length} posts in data/lenny.json`);
md.push("");
md.push(`New in the last ${NEW_LENNY_HOURS} hours: ${lennyNew.length ? "" : "none, so recommend a back-catalogue post."}`);
for (const p of lennyNew) md.push(`- ${p.date} · **${p.title}** · ${p.subtitle} · ${p.audience === "only_paid" ? "paid" : "free"} · ${p.type}\n  ${p.url}`);
md.push("");
md.push("Newest posts not yet recommended:");
for (const p of lennyLatest) md.push(`- ${p.date} · **${p.title}** · ${p.subtitle} · ${p.audience === "only_paid" ? "paid" : "free"} · ${p.type}\n  ${p.url}`);
md.push("");
md.push("## Already recommended · do not repeat");
md.push("");
if (!recentReads.length && !recentListens.length) md.push("(nothing yet)");
for (const r of recentReads) md.push(`- Read · ${r.date} · ${r.title} · ${r.url}`);
for (const l of recentListens) md.push(`- Listen · ${l.date} · ${l.show} · ${l.title} · ${l.url}`);
md.push("");
writeFileSync(join(ROOT, "_build", "candidates.md"), md.join("\n"));

const counts = sources.topics.map((t) => `${t.title} ${topics[t.id].length}`).join(" · ");
const withImages = Object.values(topics).flat().filter((it) => it.image).length;
console.log(`Feeds OK ${out.feeds.ok}/${out.feeds.total}${failed.length ? ` · failed: ${failed.map((f) => f.name).join(", ")}` : ""}${undatedFeeds.length ? ` · undated: ${undatedFeeds.join(", ")}` : ""}`);
console.log(`Candidates: ${counts} · with feed images: ${withImages}`);
console.log(`Excluded: ${excludedUsed} already used · ${excludedNoise} paywalled or noise`);
console.log(`Lenny catalogue: ${lenny.length} posts (${lennyNew.length} new) · podcast episodes: ${podcasts.length} (${newEpisodes.length} new, ${podcasts.filter((e) => e.youtube).length} with YouTube links)`);
console.log("Wrote _build/candidates.md and _build/candidates.json");
