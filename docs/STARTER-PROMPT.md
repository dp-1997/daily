# Starter prompt for Claude

Copy the text below into Claude Code after creating your own repository from The DJ template.

---

I want to build my own version of Damian's personal morning paper, The DJ: https://github.com/dp-1997/daily. I like its structure and layout. Use it as the starting codebase, keeping the calm, mobile-first newspaper experience, and help me make the content and visual design my own.

First read CLAUDE.md, README.md, docs/MAKE-YOUR-OWN.md and ROUTINE.md in my copy. Inspect site.json, sources.json and the two scripts. Tell me briefly which files you read, how the system works, and which choices are currently specific to Damian. If you do not have repository access, say so and help me connect my own copy before claiming to edit or run anything.

Start by asking me a small set of questions about:

- The paper's name, sections and their order, and what I want to avoid.
- Publications, websites, newsletters or people I trust. Help me find and test suitable public feeds where I only know the names.
- Whether I want a daily read, podcast recommendations and a closing good story, and which sources or shows they should use.
- Colours, typography, visual references and the parts of the existing layout I want to keep.
- How much I want to read, the editorial tone, and when it should be ready in my timezone.

Use my answers to write a short brief, then implement a first version in my own repository. Keep the existing static HTML/CSS/JavaScript approach and the editorial routine stored in the repository. Map my choices into the source configuration, rendering, validation and routine together. Pay particular attention to hard-coded sections, sports tags, Lenny's Newsletter integration, podcast requirements, YouTube preference, theme and footer branding. Do not assume changing a JSON file updates all of these.

Preserve the original editions as examples outside the active edition folder before replacing them in my copy. Refresh the relevant catalogues so Damian's recommendations do not leak into mine. Keep every summary grounded in an actual fetched source, with its exact URL, and keep the validation and failure handling.

Verify that the repository and publishing targets belong to me. Do not change or push to dp-1997/daily, use Damian's hosting project, or run his scheduled routine. Use my own GitHub, hosting and Claude accounts. Explain any account steps, site visibility and ongoing cost before enabling services or scheduling.

Build one real sample edition and show me a preview. Run the build and validation, check mobile and desktop behaviour, keyboard access, reduced motion, missing images and empty sections. After I have reviewed it, help me deploy my own site and configure my own Claude cloud routine. Run it once and verify the published page before saying the daily system is ready.

Finish by updating my README and ROUTINE.md, keeping CLAUDE.md and AGENTS.md identical, and telling me what works, where my site lives, and any remaining setup or source failures. Ask the initial questions first, then work through the build with me.
