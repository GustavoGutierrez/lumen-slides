# Audit model

## Where the maths comes from

`scripts/wcag.mjs` imports `luminance`, `LIGHT_THRESHOLD` and `isLight` from `src/build.mjs`, the same
helpers that generate the deck CSS. There is no second implementation to drift from.

## Theme roles (`audit theme <id>`)

Every role is measured against `colors.background`.

| Role | Threshold | Gated |
|---|---|---|
| `foreground`, `muted`, `accent`, `secondary` | 4.5:1 | yes |
| `surface` | none | no — it is a second field, not ink on the first |
| `chart[0..3]` | 3:1 | yes — graphical objects |

## Template colours (`audit template <id>`)

The field is the `--background` declared in the template's `style.css`. A template that declares none
inherits the theme background and has nothing of its own to audit.

Every other hex literal in the file is measured against that field, keyed by the property that declares it:

| Property | Threshold |
|---|---|
| `color`, `--foreground`, `--muted`, `--accent`, `--secondary` | 4.5:1 |
| any other property (borders, shadows, fills) | 3:1 |

`--background`, `--surface`, `background` and `background-color` are skipped: they are the field itself.
CSS comments are stripped before parsing, so a measured ratio recorded in a comment never becomes a pair.
`rgba()` values are not measured — alpha compositing depends on what sits behind them.

## `fix`

Converts to OKLCh, holds H and C, and binary-searches L in the direction that raises contrast against the
field (down for a light field, up for a dark one). A perceptually uniform space is required: the same walk
in RGB shifts hue. Out-of-gamut results are clipped per channel and the returned ratio is measured back
from the clipped hex. When the endpoint of the walk still misses the target, `fix` returns
`ok: false` with the best reachable ratio rather than a colour that lost its identity.
