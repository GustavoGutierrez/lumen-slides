import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, json, id, validateDeck, writeJSON } from '../src/core.mjs';
import { buildDeck } from '../src/build.mjs';

const THEME = 'prisma-claro';
const INVERTED = ['cover-cyan', 'section-orange'];
const ROLES = ['background', 'foreground', 'muted', 'accent', 'secondary', 'surface'];

// WCAG 2.1 relative luminance and contrast, so the guard does not depend on a network tool.
const channel = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16 & 255) + 0.7152 * channel(n >> 8 & 255) + 0.0722 * channel(n & 255); };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-theme-'));
  await fs.cp(path.join(ROOT, 'decks/demo'), dir, { recursive:true, filter:s => !s.includes(`${path.sep}output`) && !s.includes(`${path.sep}runs`) });
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  const deck = await json(path.join(dir, 'deck.json'));
  deck.theme = THEME;
  deck.slides = [
    { id:'portada', layout:'cover-cyan', title:'Prisma claro', eyebrow:'Lumen', subtitle:'Un espectro sobre blanco', basis:'demo', sourceIds:[] },
    { id:'corte', layout:'section-orange', title:'Segunda parte', eyebrow:'Bloque 02', body:'El campo naranja separa los bloques del relato.', basis:'demo', sourceIds:[] },
    ...deck.slides.filter(s => s.layout === 'bullets' || s.layout === 'chart').slice(0, 2)
  ];
  await writeJSON(path.join(dir, 'deck.json'), deck);
  return dir;
}

test('the light theme declares every colour role and exactly four chart colours', async () => {
  const theme = await json(path.join(ROOT, 'themes', `${THEME}.json`));
  assert.equal(id(theme.id), THEME);
  assert.deepEqual(Object.keys(theme.colors).sort(), [...ROLES].sort());
  assert.equal(theme.chart.length, 4);
  assert.equal(new Set(theme.chart).size, 4);
  for (const value of [...Object.values(theme.colors), ...theme.chart]) assert.match(value, /^#[0-9a-f]{6}$/);
  assert.match(theme.name, / \/ /);
});

test('the light theme stays readable: body copy, headings and every chart colour clear WCAG', async () => {
  const { colors, chart } = await json(path.join(ROOT, 'themes', `${THEME}.json`));
  const bg = colors.background;
  assert.ok(contrast(colors.muted, bg) >= 4.5, `muted ${colors.muted} on ${bg} is ${contrast(colors.muted, bg).toFixed(2)}:1`);
  assert.ok(contrast(colors.foreground, bg) >= 7, `foreground ${colors.foreground} on ${bg} is ${contrast(colors.foreground, bg).toFixed(2)}:1`);
  assert.ok(contrast(colors.accent, bg) >= 4.5, `accent ${colors.accent} on ${bg} is ${contrast(colors.accent, bg).toFixed(2)}:1`);
  for (const c of chart) assert.ok(contrast(c, bg) >= 3, `chart ${c} on ${bg} is ${contrast(c, bg).toFixed(2)}:1`);
  assert.notEqual(colors.surface, bg);
  assert.ok(contrast(colors.foreground, colors.surface) >= 7, `foreground on surface is ${contrast(colors.foreground, colors.surface).toFixed(2)}:1`);
  assert.ok(contrast(colors.muted, colors.surface) >= 4.5, `muted on surface is ${contrast(colors.muted, colors.surface).toFixed(2)}:1`);
});

test('the inverted templates declare their own readable field', async () => {
  for (const layout of INVERTED) {
    const manifest = await json(path.join(ROOT, 'templates', layout, 'manifest.json'));
    assert.equal(id(manifest.id), layout);
    const css = await fs.readFile(path.join(ROOT, 'templates', layout, 'style.css'), 'utf8');
    const field = css.match(new RegExp(`section\\.layout-${layout}\\{([^}]*)\\}`))?.[1];
    assert.ok(field, `${layout} must re-declare the palette on its own section`);
    const vars = Object.fromEntries([...field.matchAll(/--([a-z]+):(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
    for (const role of ROLES) assert.ok(vars[role], `${layout} leaves --${role} to the theme`);
    assert.ok(contrast(vars.muted, vars.background) >= 4.5, `${layout} muted is ${contrast(vars.muted, vars.background).toFixed(2)}:1`);
    assert.ok(contrast(vars.accent, vars.background) >= 4.5, `${layout} accent is ${contrast(vars.accent, vars.background).toFixed(2)}:1`);
    assert.ok(contrast(vars.foreground, vars.background) >= 3, `${layout} foreground is ${contrast(vars.foreground, vars.background).toFixed(2)}:1`);
  }
});

test('a deck on the light theme validates with both inverted layouts', async t => {
  const dir = await fixture(t);
  const deck = await validateDeck(dir);
  assert.equal(deck.theme, THEME);
  assert.deepEqual(deck.slides.slice(0, 2).map(s => s.layout), INVERTED);
});

test('the build carries the inverted field colours into the rendered deck', async t => {
  const dir = await fixture(t);
  const built = await buildDeck(dir);
  const html = await fs.readFile(path.join(built.out, 'index.html'), 'utf8');
  assert.match(html, /\[data-theme="prisma-claro"\]\{[^}]*--background:#ffffff/);
  assert.match(html, /<section id="portada" class="layout-cover-cyan"/);
  assert.match(html, /<section id="corte" class="layout-section-orange"/);
  assert.match(html, /section\.layout-cover-cyan\{[^}]*--background:#6bd9ec/);
  assert.match(html, /section\.layout-section-orange\{[^}]*--background:#ec5512/);
});
