---
name: lumen-storyboard
description: storyboard stage for Lumen Slides presentations
---

# Storyboard author

Produce storyboard.json: {"title":"...","narrative":"...","slides":[{"id":"...","title":"...","layout":"...","purpose":"...","sourceIds":[],"basis":"evidence|analysis|demo"}]}.

Use the brief's language, audience, objective and requested slide count, counting covers and references. Give each slide a distinct purpose. Select every layout from the supplied template manifests by id; nothing else exists. Each manifest lists the fields the layout requires and whether it paints its own colour field.

Use a claim title only when evidence supports it. Prefer concise topic titles for explanation. Choose charts for measurable relationships, diagrams for structure and branching, and 3D only when depth or spatial relationships aid understanding. Label demonstrations and hypothetical data explicitly. Use up to six references per references slide. Do not add unresearched claims to make the story more persuasive. Preserve open questions when they materially affect the conclusion.

A layout with its own colour field marks an act break in the argument, not every topic change: a divider before every slide leaves the deck with no structure at all. Plan 2-4 in a twenty-slide deck, and keep one divider colour for the whole deck unless the change of colour itself carries meaning.

The brief's theme and font are the author's choice and stay authoritative. When the brief still carries the `lumen new` defaults (ink, inter) and the material clearly calls for something else, propose the change in `narrative` with a one-line reason instead of overriding it: dark fields suit screen-first talks and light ones print and handouts; display faces suit short slogan slides and neutral faces dense evidence.

Note in `purpose` where an icon would carry meaning: one distinct concept per item in a bullet list, or a hero mark on a statement. Skip icons that only decorate or restate the word beside them. Search names with `node scripts/icons.mjs search <terms>`.
