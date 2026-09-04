# The Daily

Damian Pickett's morning paper. Once a morning an editor (Claude, running as a scheduled routine) reads the last day's news from a fixed list of ungated sources, picks what matters across film, AI, technology, Apple and five teams, writes a two-sentence summary of each, chooses a Lenny's Newsletter post and a podcast episode for the day, and publishes a static page in the style of [damianpickett.com](https://damianpickett.com).

No framework, no database, no dependencies. Two Node scripts, some JSON and static HTML on Vercel.

## How it works

```
sources.json ──▶ scripts/fetch.mjs ──▶ _build/candidates.md ──▶ the editor ──▶ editions/DATE.json
                                                                                     │
                                                              scripts/build.mjs ◀────┘
                                                                     │
                                          index.html · editions/DATE.html · archive.html · sources.html
```

- `sources.json`: every feed, grouped by topic, plus the newsletter and the podcasts. Edit this to change what the paper reads.
- `scripts/fetch.mjs`: fetches the feeds (RSS and Atom, parsed without a library), keeps the last 30 hours, drops anything used in the last seven editions, refreshes `data/lenny.json` (the newsletter's archive) and `data/podcasts.json` (every episode of the three shows), and writes `_build/candidates.md`.
- `ROUTINE.md`: the editor's instructions. The scheduled routine is told to read this file and follow it; the editorial rules live here, in the repository, not in the scheduler.
- `editions/YYYY-MM-DD.json`: one file per edition, the source of truth. The schema is in `ROUTINE.md`.
- `scripts/build.mjs`: validates every edition (and refuses to build a broken one), then renders the pages.
- `css/site.css` and the menu in `js/daily.js` are copied from damianpickett.com so the paper matches the site. `css/daily.css` holds the newspaper components.

## Run it locally

```
node scripts/fetch.mjs        # candidates for this morning
node scripts/build.mjs        # render every edition
npx serve -l 3456 .           # open http://localhost:3456
```

Node 18 or newer. `node scripts/build.mjs --check` validates without writing.

## Deploy

The repository root is the site, served at https://daily.damianpickett.com. Vercel deploys `main` on push; `.vercelignore` keeps the scripts, data and notes out of the deployment. Manual deploy: `npx vercel deploy --prod`.

## The routine

A Claude Code cloud routine runs every morning with the prompt "Read ROUTINE.md and do this morning's edition", against this repository. It commits the edition to `main`, which deploys. See `ROUTINE.md` for exactly what it does and how it fails safely.

## Design notes

- Mobile first: the paper is read on a phone before anything else. One column, the site's type scale, the glass sections menu for jumping around.
- Stories are a title, two sentences and the source. The whole row is the link. Read stories fade.
- The front page is the three stories that best represent the day. Read and listen come next, because they are the two things to carry into the day. Sections follow. The last item is always something good, in the BBC tradition of "and finally".
- Add to Home Screen on iPhone and it opens full screen.
