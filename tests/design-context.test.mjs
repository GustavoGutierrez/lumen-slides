import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, json, writeJSON } from '../src/core.mjs';
import { promptFor } from '../src/harness.mjs';

const run = promisify(execFile);
const CLI = path.join(ROOT, 'scripts/icons.mjs');
// The CLI is exercised as a process so the exit code is part of the contract, not an internal return value.
const icons = (...args) => run(process.execPath, [CLI, ...args], { cwd:ROOT, maxBuffer:8 * 1024 * 1024 });

// The suite builds its own deck: binding these assertions to decks/demo would make an unrelated
// content edit fail the design-context guard.
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-design-'));
  t.after(() => fs.rm(dir, { recursive:true, force:true }));
  await writeJSON(path.join(dir, 'brief.json'), {
    topic:'Design context fixture', audience:'Technical readers', topics:['software'],
    objective:'Exercise the prompt context', slideCount:6, language:'en',
    theme:'ink', font:'inter', brand:'lumen', dateCutoff:'2026-01-01', researchMode:'local-only' });
  await writeJSON(path.join(dir, 'research.json'), {
    summary:'Fixture research', sources:[{ id:'s1', title:'Fixture source', url:'https://example.org/a', publisher:'Example', kind:'documentation', retrieved:'2026-01-01' }],
    claims:[{ id:'c1', statement:'A fixture claim.', sourceIds:['s1'], confidence:'high' }], openQuestions:[] });
  await writeJSON(path.join(dir, 'storyboard.json'), {
    title:'Fixture', narrative:'A fixture narrative.',
    slides:[{ id:'cover', title:'Fixture', layout:'cover', purpose:'Open the deck', sourceIds:[], basis:'analysis' }] });
  return dir;
}

// The injected payload is the tail of the prompt, so the structural assertions read it back as data
// instead of pattern-matching serialised text.
const contextOf = prompt => JSON.parse(prompt.slice(prompt.indexOf('\nINPUT DATA\n') + '\nINPUT DATA\n'.length));
const templateIds = async () => (await fs.readdir(path.join(ROOT, 'templates'), { withFileTypes:true })).filter(e => e.isDirectory()).map(e => e.name).sort();
const themeIds = async () => (await fs.readdir(path.join(ROOT, 'themes'))).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();

test('the storyboard prompt lists every template that exists on disk', async t => {
  const dir = await fixture(t);
  const prompt = await promptFor('storyboard', dir);
  for (const id of await templateIds()) assert.ok(prompt.includes(`"${id}"`), `storyboard prompt never names the template ${id}`);
});

test('the storyboard prompt says which templates paint their own colour field', async t => {
  const dir = await fixture(t);
  const { layouts } = contextOf(await promptFor('storyboard', dir));
  // Derived from the shipped CSS, exactly as the injected fact must be.
  for (const id of await templateIds()) {
    const css = await fs.readFile(path.join(ROOT, 'templates', id, 'style.css'), 'utf8').catch(() => '');
    const layout = layouts.find(l => l.id === id);
    assert.ok(layout, `storyboard prompt never names the template ${id}`);
    assert.equal(layout.field, /--background\s*:\s*#[0-9a-f]{3,8}/i.test(css), `${id} declares the wrong colour field fact`);
    assert.equal(typeof layout.name, 'string');
    assert.ok(Array.isArray(layout.required), `${id} must carry its required fields`);
  }
});

test('the compose prompt lists every theme and every font', async t => {
  const dir = await fixture(t);
  const { themes, fonts } = contextOf(await promptFor('compose', dir));
  assert.deepEqual(themes.map(t => t.id).sort(), await themeIds());
  assert.deepEqual(fonts.map(f => f.id).sort(), Object.keys(await json(path.join(ROOT, 'config/fonts.json'))).sort());
  for (const entry of [...themes, ...fonts]) assert.equal(typeof entry.name, 'string', `${entry.id} arrives without a readable name`);
});

test('both prompts point at the icon search instead of carrying the catalogue', async t => {
  const dir = await fixture(t);
  for (const stage of ['storyboard', 'compose']) {
    const prompt = await promptFor(stage, dir);
    assert.ok(prompt.includes('scripts/icons.mjs search'), `${stage} prompt does not name the icon search command`);
    // Obscure catalogue entries no role file would ever cite: their presence means the catalogue leaked in.
    for (const name of ['a-b-2', 'ironing-3', 'zeppelin', 'brand-tiktok']) assert.ok(!prompt.includes(name), `${stage} prompt carries the icon catalogue (${name})`);
  }
  assert.ok((await promptFor('storyboard', dir)).length < 20_000, 'the storyboard prompt grew past a sane size');
  assert.ok((await promptFor('compose', dir)).length < 64_000, 'the compose prompt grew past a sane size');
});

test('search ranks the icon whose name carries the term first', async () => {
  const agent = JSON.parse((await icons('search', 'agent', '--json')).stdout);
  assert.equal(agent.results[0].ref, 'tabler:ai-agent');
  assert.equal(agent.results[0].category, 'Development');
  assert.ok(agent.results.length <= 12, 'search returns twelve results by default');
  const pipeline = JSON.parse((await icons('search', 'pipeline', '--json')).stdout);
  assert.ok(pipeline.results.some(r => r.ref === 'tabler:pipeline'), 'search pipeline never finds tabler:pipeline');
  const limited = JSON.parse((await icons('search', 'agent', '--limit', '3', '--json')).stdout);
  assert.equal(limited.results.length, 3);
});

test('search reaches every prefix the resolver accepts', async () => {
  const brand = JSON.parse((await icons('search', 'anthropic', '--json')).stdout);
  assert.equal(brand.results[0].ref, 'brand:anthropic');
  const filled = JSON.parse((await icons('search', 'star', '--json')).stdout);
  assert.ok(filled.results.some(r => r.ref === 'tabler:star'));
  assert.ok(filled.results.some(r => r.ref.startsWith('tabler-filled:')), 'the filled set is unreachable from search');
});

test('has verifies a batch and reports only the fabricated reference', async () => {
  const ok = JSON.parse((await icons('has', 'tabler:ai-agent', 'tabler-filled:star', 'brand:anthropic', '--json')).stdout);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.missing, []);
  const failed = await icons('has', 'tabler:ai-agent', 'tabler:does-not-exist', '--json').then(() => null, e => e);
  assert.ok(failed, 'has must exit non-zero when a reference is missing');
  assert.equal(failed.code, 1);
  const report = JSON.parse(failed.stdout);
  assert.equal(report.ok, false);
  assert.deepEqual(report.missing, ['tabler:does-not-exist']);
});

test('categories counts the whole reachable catalogue', async () => {
  const { stdout } = await icons('categories', '--json');
  const report = JSON.parse(stdout);
  const files = async d => (await fs.readdir(path.join(ROOT, d))).filter(f => f.endsWith('.svg')).length;
  const expected = await files('node_modules/@tabler/icons/icons/outline') + await files('node_modules/@tabler/icons/icons/filled') + await files('node_modules/simple-icons/icons');
  assert.equal(report.total, expected);
  assert.equal(report.categories.reduce((n, c) => n + c.count, 0), expected);
  assert.ok(report.categories.every(c => c.category && c.count > 0));
});

test('importing the module runs no CLI and sets no exit code', async () => {
  const { stdout, stderr } = await run(process.execPath, ['-e', "const u=await import('./scripts/icons.mjs');process.stdout.write(String(process.exitCode)+' '+String(typeof u.search))"], { cwd:ROOT });
  assert.equal(stderr, '');
  assert.equal(stdout, 'undefined function');
});
