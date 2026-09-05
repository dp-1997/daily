# Make your own morning paper

Use The DJ as a working blueprint for a paper about your interests. Keep the page structure you like, then change its editorial brief, sources and appearance with Claude Code.

This is a working personal site, so some choices are in JavaScript as well as JSON. Changing the feed list alone will not rename the sections or replace the newsletter integration. The map below identifies the places to change together.

## 1. Create your own copy

Open [the repository](https://github.com/dp-1997/daily), choose **Use this template → Create a new repository**, and select your own GitHub account as the owner. Use only the default branch. Choose the name and visibility you want; a private repository keeps your editorial preferences out of public GitHub browsing.

A template creates a separate repository with the files and a fresh history. It does not transfer the original owner's hosting connection or scheduled routine. See [GitHub's template instructions](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template).

Open your new repository in Claude Code, locally or on the web, and paste the [starter prompt](STARTER-PROMPT.md). If you are using ordinary Claude chat, it can help choose the brief, but use Claude Code with access to your copy to edit, run and publish it. If Claude cannot access the repository, give it the downloaded repository files and move the build into Claude Code when access is ready.

Before a push, check `git remote -v`: `origin` must be your new repository. Do not point your deployment or routine at `dp-1997/daily`. If cloning the original manually, create your own remote before publishing any changes.

## 2. Check the starting point

The scripts require Node 18 or newer. Use a currently supported Node release for a new setup. There are no project packages to install.

```sh
node scripts/build.mjs --check
DAILY_OFFLINE=1 node scripts/build.mjs
npx serve -l 3456 .
```

Open `http://localhost:3456`. `npx serve` downloads a preview server if it is not already available; it is not a site dependency. The included editions are examples of Damian's paper. The offline build is enough to inspect its layout. It does not test today's feeds or create a new edition.

## 3. Choose the paper before editing

Tell Claude the name, sections and their order; the sources you already trust; subjects you want more or less of; tone and reading length; colours, typography and visual references; and the time and timezone you want it ready.

Choose whether to keep the front page, a daily read, podcast picks and the closing good story. You do not need to know feed URLs. Claude should find and test the public RSS or Atom endpoints behind your chosen publications, and explain any gaps before substituting sources.

## 4. Change the connected pieces

| What you want to change | Files and details |
| --- | --- |
| Name and identity | `site.json`, `package.json`, `manifest.webmanifest`, icons in `img/`, README and routine. `scripts/build.mjs` also contains the literal footer label `damianpickett.com`. Replace it, or remove the personal-site link if you do not have one. |
| Sections and order | `sources.json` topic IDs plus `SECTIONS` in `scripts/build.mjs`; update the routine's counts and JSON schema together. Rendering and the menu use `SECTIONS`, not the order of feed topics. |
| Sports teams | Feed topics and `group` in `sources.json`, `SPORT_ORDER`, sport grouping and validation in `scripts/build.mjs`, and the routine's tags. Remove or adapt this special handling if you do not want sport. |
| Sources and exclusions | `sources.json`: feed name, site, URL, topic, caps, time window and `blocked_hosts`. Also inspect the noise filters in `scripts/fetch.mjs` and editorial exclusions in `ROUTINE.md`; Damian's exclusions may hide stories you want. |
| Daily read | `sources.lenny`, `refreshLenny()` and candidate text in `scripts/fetch.mjs`, `data/lenny.json`, read enrichment, validation, `pickReadHtml()` and `sourcesHtml()` in `scripts/build.mjs`, and `ROUTINE.md`. The existing adapter expects Substack archive fields. An ordinary RSS newsletter needs a small adapter change, not just a replacement URL. |
| Podcasts | `sources.json` podcast objects and `ROUTINE.md`. The builder requires one episode per configured show, not a fixed three. Update the sources-page wording, which currently says three podcasts. Removing listening entirely also requires changing validation and rendering. |
| Listening destination | `pickListenHtml()` in `scripts/build.mjs` prefers YouTube, then the episode URL, with Apple Podcasts links. Change the preference if you listen elsewhere. |
| Editorial voice | `ROUTINE.md`: replace the audience biography, interests, selection, exclusions, summary style and recommendation rules. Its 45-word target is stricter than the current validator's 60-word ceiling. Its front-page count is also stricter than the validator's minimum of one. Keep prose rules and any changed checks consistent. |
| Appearance | `css/site.css` and `css/daily.css`; `js/daily.js` for menu behaviour. The page template has `class="dark"` and a fixed theme colour in `scripts/build.mjs`; update these, the manifest colours and icons together for a different theme. Keep phone safe areas and reduced-motion behaviour. |
| Section navigation | `sectionLinksHtml()` and `editionNavigationHtml()` in `scripts/build.mjs`, the edition-view block in `js/daily.js`, and the navigation styles in `css/daily.css`. Shortcuts and counts follow non-empty `SECTIONS`; sport links also use `SPORT_ORDER`. Keep hash links and the full-paper fallback working. |
| Date and schedule | `TZ` in both scripts, the date command and completion rules in `ROUTINE.md`, and your own scheduler setting. Confirm the next displayed run time and daylight-saving behaviour rather than copying Damian's cron. |
| Site address and publishing | `site.json`, your hosting project's GitHub connection and production branch, and the publish step in your own `ROUTINE.md`. The copied `vercel.json` and `.vercelignore` describe routing and exclusions, not an account connection. |

The renderer always builds every JSON edition in `editions/`. When changing sections or shows, first preserve the original edition examples under `docs/examples/` in your own copy, with a Git commit as recovery. Remove those specific example JSON and HTML files from the active `editions/` folder once you are ready to replace them. Create your first valid edition before building again: an empty edition folder deliberately fails. This avoids validating old sections or podcast picks against your new configuration, or publishing Damian's archive as yours.

If replacing the newsletter, start a fresh catalogue or clear only the old `data/lenny.json` after preserving it in your copy's history; the adapter otherwise merges old entries. Refresh `data/podcasts.json` after changing shows and remove the old `_build/` candidate cache before the first personalised fetch. Never do this cleanup in the original repository.

## 5. Prove one edition, then connect publishing

Fetch your chosen sources with `node scripts/fetch.mjs`. Inspect `_build/candidates.md`, write one edition using your adapted routine, then run `node scripts/build.mjs` and `node scripts/build.mjs --check`. Check that the output has your sections, working source links, correct read/listen labels and your identity throughout. Keep the existing page until a replacement builds successfully.

Preview at phone and desktop widths. Check long headlines, missing images, an empty section, the archive, sources page, keyboard menu operation and reduced motion. Then check it on your actual phone.

Run `npm test` for the navigation regression checks. Update their frozen fixture in `tests/fixtures/` and expectations if you change the edition schema, sections or shows. Bump `ASSET_VERSION` in the builder after CSS or JavaScript changes and rebuild so deployed pages use the new assets.

For the same deployment approach, import **your** repository as a new Vercel static-site project. The published pages are committed at the repository root. Configure it to serve that root with no install or build step, and use `main` as the production branch. Do not configure Vercel to curate a paper: Claude generates and commits the finished pages before deployment. Verify `/`, `/archive`, `/sources` and an edition URL on your new domain. Update `site.json` to that address and rebuild so canonical and share links are yours.

A private GitHub repository does not make the deployed site private. Choose site access deliberately. GitHub stores your code and editions; Claude reads your brief and fetched candidates; the host serves your summaries and source links; article images are loaded from publishers. Check hosting and Claude plan allowances before enabling a daily run. There is no separate model API key required by these scripts.

## 6. Set up your own morning routine

Create it in your own Claude account at [Claude Code routines](https://claude.ai/code/routines), selecting only your repository. Connect your GitHub account. Use a cloud routine if it should run with your laptop closed. Set your preferred time and check the displayed next run. Allow the feed, catalogue and article-image domains in the environment, or choose Full network access. Remove unrelated connectors. Runs consume your Claude allowance. See [Anthropic's routine documentation](https://code.claude.com/docs/en/routines).

Keep the scheduler prompt short:

> Read CLAUDE.md, then follow ROUTINE.md to produce and publish this morning's edition of this repository's paper. Work only in this repository and publish only to the destination defined in its adapted routine. Report any failure without claiming publication succeeded.

The original routine pushes to `main`. Verify that your account's branch permissions allow this and that hosting deploys that branch. A denied direct push needs a deliberate publishing arrangement, such as a reviewed pull request; do not bypass it or force-push. Run once manually and verify the edition, GitHub commit and live deployment before relying on the schedule. A successful routine status alone does not prove publication. [Routine branch permissions and run inspection](https://code.claude.com/docs/en/routines#repositories-and-branch-permissions).

Some publishers block cloud requests even when local fetching works. Report failed feeds and publish only when enough real candidates remain. If none remain after the wider-window retry, preserve the previous edition and report the failure.

## Ready means

- Your own repository, identity, sources and design are in place.
- The README explains your setup and `ROUTINE.md` describes your paper.
- A first personalised edition validates and looks right on your phone.
- Your hosting project serves that edition at your chosen address.
- Your own cloud routine has completed a verified publication, and its next run is correct.

The blueprint provides the starting system. These last steps must be completed in your accounts with your choices.
