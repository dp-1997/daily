import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const original = JSON.parse(readFileSync(join(root, "tests/fixtures/edition.json"), "utf8"));

function render(change = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), "dj-navigation-"));
  try {
    mkdirSync(join(dir, "scripts"));
    mkdirSync(join(dir, "editions"));
    for (const file of ["scripts/build.mjs", "site.json", "sources.json"]) copyFileSync(join(root, file), join(dir, file));
    const edition = structuredClone(original);
    change(edition);
    writeFileSync(join(dir, `editions/${edition.date}.json`), JSON.stringify(edition));
    execFileSync(process.execPath, [join(dir, "scripts/build.mjs")], { env: { ...process.env, DAILY_OFFLINE: "1" }, stdio: "pipe" });
    return { edition, html: readFileSync(join(dir, "index.html"), "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function checkDestinations(html) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate element IDs make deep links ambiguous");
  for (const [, destination] of html.matchAll(/\bhref="#([^"]+)"/g)) {
    assert.ok(destination === "all" || ids.includes(destination), `missing target: ${destination}`);
  }
}

test("every section and team shortcut has a unique real destination", () => {
  const { html } = render();
  checkDestinations(html);
  assert.match(html, /href="#listen" data-view-link>Listen/);
  assert.match(html, /id="sport-manchester-united"/);
});

test("focused navigation preserves every story and recommendation in the HTML", () => {
  const { edition, html } = render();
  const stories = [...edition.front, ...edition.sections.flatMap(s => s.stories), edition.finally];
  assert.equal([...html.matchAll(/class="story(?:\s|\")/g)].length, stories.length);
  for (const item of [...stories, edition.read, ...edition.listen]) {
    const escaped = item.url.replaceAll("&", "&amp;");
    // A podcast may prefer its verified YouTube URL over its catalogue URL.
    assert.ok(html.includes(escaped) || (item.youtube && html.includes(item.youtube.replaceAll("&", "&amp;"))));
  }
  assert.doesNotMatch(html, /<section[^>]*data-edition-panel[^>]*\bhidden\b/);
  assert.match(html, /class="sections-fallback"/);
});

test("quiet days omit empty topics, absent teams and the optional closing story", () => {
  const { html } = render(edition => {
    edition.sections.find(s => s.id === "ai").stories = [];
    edition.sections.find(s => s.id === "sport").stories = [];
    delete edition.finally;
  });
  checkDestinations(html);
  assert.doesNotMatch(html, /href="#(?:ai|sport|finally|sport-[^"]+)"/);
  assert.doesNotMatch(html, /Straight to your team/);
  assert.match(html, /href="#film"/);
});

test("an edition without images still renders the full navigation and content", () => {
  const { html } = render(edition => {
    for (const item of [...edition.front, ...edition.sections.flatMap(s => s.stories), edition.finally, edition.read]) item.image = "";
    for (const item of edition.listen) item.artwork = "";
  });
  checkDestinations(html);
  assert.doesNotMatch(html, /<img\b/);
  assert.match(html, /id="section-picker"/);
});
