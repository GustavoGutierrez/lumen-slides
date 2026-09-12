---
name: wcag
description: "Trigger: colour contrast, WCAG, accessible ink, theme or template colours. Measure, resolve and repair Lumen Slides colours with scripts/wcag.mjs."
license: Apache-2.0
metadata:
  author: GustavoGutierrez
  version: "1.0"
---

# WCAG colours

## Activation Contract

Load when choosing a text/background pair, editing a theme in `themes/` or a template `style.css`, or before shipping any colour.

## Hard Rules

- Never assert a shipped pair is accessible without running the tool and quoting its measured ratio; never compute a ratio by hand.
- The tool reports, it never vetoes. The author may deliberately ship a failing pair.
- Record a deliberate failure as a measured ratio in a CSS comment beside the declaration, as `templates/cover-cyan/style.css` does.
- `audit all` exits 1 on a gated failure. Fixing what it finds is the author's decision, never an automatic edit.

## Decision Gates

| Context | Threshold |
|---|---|
| Body copy, captions, labels, links | 4.5:1 |
| Display type, headings 24px+ or bold 19px+ | 3:1 |
| Rules, borders, icons, chart series, UI parts | 3:1 |
| AAA body copy, when asked for it | 7:1 |
| Field against field (surface vs background) | informational only |

## Execution Steps

Run from the project root. `npm run wcag -- <args>` is equivalent; `--json` gives machine output.

1. Measure pairs in one call: `node scripts/wcag.mjs contrast <fg> <bg> [<fg> <bg> ...]`.
2. New field: `node scripts/wcag.mjs ink <field>` returns the display ink and a supporting-copy ink at 4.5:1.
3. Colour below threshold: `node scripts/wcag.mjs fix <colour> <bg> [--target 4.5]` returns the nearest colour holding hue and chroma. Use it; never guess a darker hex.
4. After editing: `node scripts/wcag.mjs audit theme <id>` or `audit template <id>`.
5. Before shipping: `node scripts/wcag.mjs audit all`.

## Output Contract

Report each hex pair, its measured ratio to two decimals, and the threshold applied. Name every failing pair. Mark a deliberate failure as authored and show the CSS comment recording it. Never report a ratio the script did not print.

## References

- `references/audit-model.md` — role-to-threshold map, template field discovery, how `fix` walks OKLCh.
