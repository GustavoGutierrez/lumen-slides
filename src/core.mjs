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
  if (mime === 'image/svg+xml' && /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|url\s*\(/i.test(bytes.toString())) throw new Error(`SVG must be self-contained and passive: ${relative}`);
  return `data:${mime};base64,${bytes.toString('base64')}`;
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
  for (const s of deck.slides) {
    if (seen.has(s.id)) throw new Error(`Duplicate slide ${s.id}`); seen.add(s.id);
    const template = await json(path.join(ROOT, 'templates', id(s.layout), 'manifest.json'));
    for (const key of template.required) if (s[key] === undefined || s[key] === '') throw new Error(`${s.id}: layout ${s.layout} requires ${key}`);
    if (s.basis === 'evidence' && s.sourceIds.length === 0) throw new Error(`${s.id}: evidence requires a source`);
    for (const ref of s.sourceIds) if (!sourceIds.has(ref)) throw new Error(`${s.id}: unknown source ${ref}`);
    if (s.chart && s.chart.series.some(x => x.values.length !== s.chart.labels.length)) throw new Error(`${s.id}: chart lengths differ`);
    if (s.chart && !s.chart.unit.trim()) throw new Error(`${s.id}: chart unit is required`);
    if (s.diagram && /%%\{|^---|\bclick\s|<\/?[a-z]|javascript:/im.test(s.diagram.code)) throw new Error(`${s.id}: diagram directives, HTML and links are disabled`);
    if (s.image) await assetData(dir, s.image);
    if (s.layout === 'references' && s.sourceIds.length > 6) throw new Error(`${s.id}: split references into pages of up to six sources`);
    if (s.layout === 'columns' && s.items.length > 4) throw new Error(`${s.id}: columns supports at most four items`);
    const brand = await json(path.join(ROOT, 'brands', `${id(s.brand ?? template.brand ?? deck.brand)}.json`));
    if (brand.logo) await assetData(ROOT, brand.logo);
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
