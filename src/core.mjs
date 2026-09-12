import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const json = async p => JSON.parse(await fs.readFile(p, 'utf8'));
export const hash = b => createHash('sha256').update(b).digest('hex');
export const stable = value => JSON.stringify(sort(value), null, 2) + '\n';
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
export const writeJSON = async (p, v) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, stable(v)); };
export const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function id(value) { if (!/^[a-z][a-z0-9-]*$/.test(value ?? '')) throw new Error(`Invalid identifier: ${value}`); return value; }
export async function safeFile(base, relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Expected relative asset path: ${relative}`);
  const [b, p] = await Promise.all([fs.realpath(base), fs.realpath(path.resolve(base, relative))]);
  if (p !== b && !p.startsWith(b + path.sep)) throw new Error(`Asset outside allowed directory: ${relative}`);
  return p;
}
export async function assetData(base, relative, font = false) {
  const p = await safeFile(base, relative);
  const types = font ? { '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf' } : { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml' };
  const mime = types[path.extname(p).toLowerCase()];
  if (!mime) throw new Error(`Unsupported local asset: ${relative}`);
  const bytes = await fs.readFile(p);
  if (bytes.length > 12 * 1024 * 1024) throw new Error(`Asset exceeds 12 MiB: ${relative}`);
  // Logos stay images; active SVG content and remote references are not accepted.
  if (mime === 'image/svg+xml' && active(bytes.toString())) throw new Error(`SVG must be self-contained and passive: ${relative}`);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}
const active = markup => /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|url\s*\(/i.test(markup);
const iconSets = { 'tabler':'node_modules/@tabler/icons/icons/outline', 'tabler-filled':'node_modules/@tabler/icons/icons/filled', 'brand':'node_modules/simple-icons/icons' };
// Icons are spliced inline, not inlined as an <img>: an SVG document inside <img> cannot read the page
// custom properties, so currentColor would never follow the theme. The reference is agent-authored input.
export async function iconSVG(reference) {
  const [prefix, name, ...rest] = String(reference ?? '').split(':');
  const dir = iconSets[prefix];
  if (!dir || rest.length) throw new Error(`Unknown icon set: ${reference}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name ?? '')) throw new Error(`Invalid icon name: ${reference}`);
  const base = path.join(ROOT, dir);
  try { await fs.access(path.join(base, `${name}.svg`)); } catch { throw new Error(`Unknown icon: ${reference}`); }
  const file = await safeFile(base, `${name}.svg`);
  const markup = (await fs.readFile(file, 'utf8')).replace(/\s+/g, ' ').trim();
  // A package upgrade could ship an SVG the image path would have rejected; hold the same bar here.
  if (active(markup)) throw new Error(`Icon must be self-contained and passive: ${reference}`);
  const open = markup.match(/^<svg\b([^>]*)>/i);
  if (!open || !markup.endsWith('</svg>')) throw new Error(`Unsupported icon markup: ${reference}`);
  const attrs = Object.fromEntries([...open[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(m => [m[1].toLowerCase(), m[2]]));
  if (!attrs.viewbox) throw new Error(`Icon without viewBox: ${reference}`);
  // Size comes from CSS, colour from the theme, and the label from the surrounding text.
  const body = markup.slice(open[0].length, -'</svg>'.length).replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');
  const keep = ['stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].filter(k => attrs[k] !== undefined).map(k => ` ${k}="${escape(attrs[k])}"`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escape(attrs.viewbox)}" fill="${attrs.fill === 'none' ? 'none' : 'currentColor'}"${keep} class="icon" aria-hidden="true" focusable="false">${body}</svg>`;
}
export async function checkSchema(name, value) {
  const ajv = new Ajv({ allErrors:true, strict:true }); addFormats(ajv);
  const validate = ajv.compile(await json(path.join(ROOT, `schemas/${name}.schema.json`)));
  if (!validate(value)) throw new Error(`${name}: ${ajv.errorsText(validate.errors, { separator:'\n' })}`);
}
export async function validateDeck(dir) {
  const deck = await json(path.join(dir, 'deck.json'));
  await checkSchema('deck', deck);
  const seen = new Set(), sourceIds = new Set();
  for (const s of deck.sources) {
    if (sourceIds.has(s.id)) throw new Error(`Duplicate source ${s.id}`); sourceIds.add(s.id);
    const u = new URL(s.url);
    if (!['https:', 'http:'].includes(u.protocol) && !(s.kind === 'local' && u.protocol === 'urn:')) throw new Error(`Unsupported source URL ${s.id}`);
  }
  for (const key of ['theme', 'font', 'brand']) id(deck[key]);
  await fs.access(path.join(ROOT, 'themes', `${deck.theme}.json`));
  const fonts = await json(path.join(ROOT, 'config/fonts.json'));
  if (!fonts[deck.font]) throw new Error(`Unknown font ${deck.font}`);
  for (const [index, s] of deck.slides.entries()) {
    if (seen.has(s.id)) throw new Error(`Duplicate slide ${s.id}`); seen.add(s.id);
    // Auto-animate tweens a pair, so the opening slide has no previous state to morph from.
    if (index === 0 && (s.transition ?? deck.transition) === 'morph') throw new Error(`${s.id}: morph needs a previous slide; the first slide cannot use it`);
    const template = await json(path.join(ROOT, 'templates', id(s.layout), 'manifest.json'));
    for (const key of template.required) if (s[key] === undefined || s[key] === '') throw new Error(`${s.id}: layout ${s.layout} requires ${key}`);
    if (s.basis === 'evidence' && s.sourceIds.length === 0) throw new Error(`${s.id}: evidence requires a source`);
    for (const ref of s.sourceIds) if (!sourceIds.has(ref)) throw new Error(`${s.id}: unknown source ${ref}`);
    if (s.chart && s.chart.series.some(x => x.values.length !== s.chart.labels.length)) throw new Error(`${s.id}: chart lengths differ`);
    if (s.chart && !s.chart.unit.trim()) throw new Error(`${s.id}: chart unit is required`);
    if (s.diagram && /%%\{|^---|\bclick\s|<\/?[a-z]|javascript:/im.test(s.diagram.code)) throw new Error(`${s.id}: diagram directives, HTML and links are disabled`);
    if (s.image) await assetData(dir, s.image);
    // The light twin only ever replaces an image, so it is meaningless on its own.
    if (s.imageOnLight && !s.image) throw new Error(`${s.id}: imageOnLight requires image`);
    if (s.imageOnLight) await assetData(dir, s.imageOnLight);
    if (s.layout === 'references' && s.sourceIds.length > 6) throw new Error(`${s.id}: split references into pages of up to six sources`);
    if (s.layout === 'columns' && s.items.length > 4) throw new Error(`${s.id}: columns supports at most four items`);
    const brand = await json(path.join(ROOT, 'brands', `${id(s.brand ?? template.brand ?? deck.brand)}.json`));
    if (brand.logo) await assetData(ROOT, brand.logo);
    if (brand.logoOnLight) await assetData(ROOT, brand.logoOnLight);
  }
  return deck;
}
export async function listFiles(dir, prefix = '') {
  const result = [];
  for (const e of (await fs.readdir(path.join(dir, prefix), { withFileTypes:true })).sort((a,b)=>a.name.localeCompare(b.name, 'en'))) {
    if (e.isSymbolicLink()) throw new Error(`Symlinks are not indexed: ${e.name}`);
    const p = path.posix.join(prefix, e.name);
    if (e.isDirectory()) result.push(...await listFiles(dir, p)); else if (e.isFile()) result.push(p);
  }
  return result;
}
