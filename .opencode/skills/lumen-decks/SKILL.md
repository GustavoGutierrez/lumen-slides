---
name: lumen-decks
description: Research, compose, validate and export presentations in a Lumen Slides project. Use when working on its decks, templates or portable exports.
---

# Lumen decks

Resolve paths from the Lumen project root containing `bin/lumen.mjs`. Read `AGENTS.md` and the selected deck's `brief.json`. Preserve the requested audience, count, branding and language.

1. Put source documents, notes, images and data in `decks/<id>/resources/`. Run `node bin/lumen.mjs research decks/<id>` to index resources and produce source queries. Read actual sources before citing them. Web tools come from the host agent; without them use supplied material and retain unanswered questions.
2. Follow the role instructions in `agents/research.md`, `agents/storyboard.md`, `agents/compose.md` and `agents/review.md`. Write the corresponding JSON artifacts in the deck directory, or generate a task with `prompt` and import output with `accept`. Headless orchestration is available through `run --agent <name>` when its CLI and permissions are configured.
3. Use `schemas/deck.schema.json`. Read `docs/EXTENDING.md` only when changing presentation capabilities. Keep unsupported assertions out of factual slides and preserve evidence versus illustrative examples.
4. Run `validate`, `build`, then `verify` against the deck. Inspect the rendered slides or screenshots for text fit and visual hierarchy. Do not treat schema validation as a factual or visual review. Fix concrete failures and rerun the affected check.
5. Run `pdf` for a static copy and `pack` for the recipient. Verify that index.html opens offline, that charts and diagrams appear, and that the PDF has one page per slide. The HTML is interactive; the PDF records a fixed state.

Use the existing project scripts instead of rewriting export logic. Runtime libraries, fonts and assets must be embedded locally. Never include credentials, private source documents or provider transcripts in the recipient package. This skill is project-scoped and does not require installing a global skill.
