import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, id, validateDeck, writeJSON } from '../src/core.mjs';
import { buildDeck, isLight } from '../src/build.mjs';

// The six section dividers the author picked, so a deck can change the colour of a break.
const SECTIONS = ['section-olive', 'section-teal', 'section-violet', 'section-raspberry', 'section-crimson', 'section-blue'];
const ROLES = ['background', 'foreground', 'muted', 'accent', 'secondary', 'surface'];

// WCAG 2.1 relative luminance and contrast, so the guard does not depend on a network tool.
const channel = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16 & 255) + 0.7152 * channel(n >> 8 & 255) + 0.0722 * channel(n & 255); };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Each template owns its palette, so the guard reads the shipped CSS instead of a copy of it.
async function field(layout) {
  const css = await fs.readFile(path.join(ROOT, 'templates', layout, 'style.css'), 'utf8');
  const block = css.match(new RegExp(`section\\.layout-${layout}\\{([^}]*)\\}`))?.[1];
  assert.ok(block, `${layout} must re-declare the palette on its own section`);
  return Object.fromEntries([...block.matchAll(/--([a-z]+):(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
}

// The suite owns its brand fixture: depending on a client's brand file would couple
// the test to whichever deck happens to live in the repo.
const MARK = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20" viewBox="0 0 60 20"><rect width="60" height="20" fill="#fff"/></svg>';
async function brandFixture(t) {
  const name = `t-section-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(ROOT, 'assets/sections-test');
  await fs.mkdir(dir, { recursive:true });
  await fs.writeFile(path.join(dir, `${name}.svg`), MARK);
  await fs.writeFile(path.join(dir, `${name}-on-light.svg`), MARK.replace('#fff', '#000'));
  await writeJSON(path.join(ROOT, `brands/${name}.json`), { id:name, name:'TEST BRAND', logo:`assets/sections-test/${name}.svg`, logoOnLight:`assets/sections-test/${name}-on-light.svg` });
  t.after(async () => {
    await fs.rm(path.join(ROOT, `brands/${name}.json`), { force:true });
    await fs.rm(path.join(dir, `${name}.svg`), { force:true });
    await fs.rm(path.join(dir, `${name}-on-light.svg`), { force:true });
    await fs.rm(dir, { recursive:true, force:true }).catch(()=>{});
  });
  return name;
}

// One slide per divider, written from scratch: no deck in the repo has to carry these layouts.
async function fixture(t) {
  const brand = await brandFixture(t);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-section-'));
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  await writeJSON(path.join(dir, 'deck.json'), {
    schemaVersion:'1.0', id:'section-fixture', title:'Section dividers', lang:'es', author:'Lumen',
    theme:'prisma', font:'inter', brand, sources:[],
    slides:SECTIONS.map((layout, i) => ({ id:layout, layout, title:`Bloque ${i+1}`, eyebrow:`Parte 0${i+1}`, body:'El campo de color separa los bloques del relato.', subtitle:'Apoyo secundario', basis:'demo', sourceIds:[] }))
  });
  return dir;
}

test('every section divider ships a manifest with a valid id and no required field', async () => {
  for (const layout of SECTIONS) {
    const manifest = await json(path.join(ROOT, 'templates', layout, 'manifest.json'));
    assert.equal(id(manifest.id), layout);
    assert.deepEqual(manifest.required, []);
    assert.equal(typeof manifest.name, 'string');
  }
});

test('every section divider declares its own complete colour field', async () => {
  for (const layout of SECTIONS) {
    const vars = await field(layout);
    for (const role of ROLES) assert.ok(vars[role], `${layout} leaves --${role} to the theme`);
    assert.equal(vars.surface, vars.background, `${layout} surface must stay on the field`);
    // src/style.css declares .reveal p.eyebrow{color:var(--accent)}; a plain two-class rule loses to it
    // and the chip text would come out in the chip's own ink.
    const css = await fs.readFile(path.join(ROOT, 'templates', layout, 'style.css'), 'utf8');
    assert.match(css, new RegExp(`\\.reveal \\.${layout}-content p\\.eyebrow\\{[^}]*color:var\\(--background\\)`), `${layout} must outrank the base eyebrow colour`);
  }
});

// The regression guard: it stops a later colour landing in the set with unreadable ink.
test('every section divider keeps its ink readable over its own field', async () => {
  for (const layout of SECTIONS) {
    const { background:bg, foreground:fg, muted, accent } = await field(layout);
    // The display h2 is 63px, so it answers to the large-text floor.
    assert.ok(contrast(fg, bg) >= 3, `${layout} h2 ink ${fg} on ${bg} is ${contrast(fg, bg).toFixed(2)}:1`);
    // .lead and the whole footer draw with --muted, .secondary-copy with --accent: ordinary text.
    assert.ok(contrast(muted, bg) >= 4.5, `${layout} supporting copy ${muted} on ${bg} is ${contrast(muted, bg).toFixed(2)}:1`);
    assert.ok(contrast(accent, bg) >= 4.5, `${layout} accent ${accent} on ${bg} is ${contrast(accent, bg).toFixed(2)}:1`);
    // The eyebrow is a chip of the ink carrying the field back as text, so it is the same pair inverted.
    assert.ok(contrast(bg, fg) >= 4.5, `${layout} eyebrow chip is ${contrast(bg, fg).toFixed(2)}:1`);
  }
});

test('a deck validates with every section divider', async t => {
  const dir = await fixture(t);
  const deck = await validateDeck(dir);
  assert.deepEqual(deck.slides.map(s => s.layout), SECTIONS);
});

test('the build carries every section field colour into the rendered deck', async t => {
  const dir = await fixture(t);
  const built = await buildDeck(dir);
  const html = await fs.readFile(path.join(built.out, 'index.html'), 'utf8');
  for (const layout of SECTIONS) {
    const { background } = await field(layout);
    assert.match(html, new RegExp(`<section id="${layout}" class="layout-${layout}"`));
    assert.match(html, new RegExp(`section\\.layout-${layout}\\{[^}]*--background:${background}`));
    // Reveal paints the margin around the slide from the body, and its controls sit outside the section.
    assert.ok(html.includes(`body:has(.slides>section.present.layout-${layout}){background:${background}`), `${layout} must paint the outer margin`);
    assert.match(html, new RegExp(`section\\.present\\.layout-${layout}\\) \\.reveal \\.controls\\{color:#`));
  }
});

// A dark field is not "the default case": under a light theme themeCSS() swaps in the dark-ink twin,
// which is chosen for the theme page and not for this field, so both halves of the set need an override.
test('every section divider pins the brand mark its own field needs', async () => {
  for (const layout of SECTIONS) {
    const { background } = await field(layout);
    const css = await fs.readFile(path.join(ROOT, 'templates', layout, 'style.css'), 'utf8');
    const [logo, onLight] = isLight(background) ? ['none', 'inline'] : ['inline', 'none'];
    assert.match(css, new RegExp(`section\\.layout-${layout} \\.brand-logo\\{display:${logo}\\}`), `${layout} must pin .brand-logo to ${logo}`);
    assert.match(css, new RegExp(`section\\.layout-${layout} \\.brand-logo-on-light\\{display:${onLight}\\}`), `${layout} must pin .brand-logo-on-light to ${onLight}`);
  }
});
