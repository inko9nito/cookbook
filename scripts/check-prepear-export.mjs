/*
  Checks the Prepear export bookmarklet (src/prepear/export.ts, issue #14) against a fake Prepear in Chromium.
  The fake answers in the shapes the peek showed (docs/PLAN.md §6), with made-up recipes:
  - 40 recipes over two pages of 35; a cookbook and a meal plan that also name recipes missing from the list,
  - an edited copy (Prepear's "adapted") that a cookbook names by its own id: one answer covers both ids,
  - a recipe that fails twice before answering (tried again) and one that's gone (listed as failed).
  Then the page reloads and the bookmarklet runs again: it carries on from what it kept, asking Prepear for nothing new.

  Usage: npm run check:export   (no server needed: it serves its own fake Prepear)
*/
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transformWithOxc } from 'vite';

const { chromium } = createRequire(import.meta.url)('playwright');

const source = fs.readFileSync(new URL('../src/prepear/export.ts', import.meta.url), 'utf8');
const js = (await transformWithOxc(source, 'export.ts', { lang: 'ts' })).code;
// BOOKMARKLET=<file> checks a bookmarklet as the built app hands it out (javascript:…) instead of the source
const bookmarklet = process.env.BOOKMARKLET
  ? decodeURIComponent(fs.readFileSync(process.env.BOOKMARKLET, 'utf8').trim().replace(/^javascript:/, ''))
  : `(${js.slice(js.indexOf('function prepearExport'))})()`;

const ids = Array.from({ length: 40 }, (_, i) => `r${i}`);
const asked = {};
let flaky = 0;
const recipe = (id) => ({
  adapted: id === 'r5' ? { recipe: { id: 'a5', title: 'Recipe 5, my version' }, meta: {} } : null,
  original: { recipe: { id, title: `Recipe ${id}`, ingredients: [{ title: '', ingredients: [{ amount: '1', measurement: 'cup', ingredient_name: 'rice' }] }] }, meta: { preferred_adapted_id: id === 'r5' ? 'a5' : null } },
});
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  asked[url.pathname] = (asked[url.pathname] || 0) + 1;
  if (url.pathname === '/cook/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Prepear</title><p>signed in'); }
  if (url.pathname === '/api/v3/profiles/cook') return json({ profile: { id: 'u1', slug: 'cook' }, recipes: { total: 40, results: [] }, library: { total: 1, results: [{ id: 'p1', title: 'Plan' }] }, cookbooks: { total: 1, results: [{ id: 'c1', title: 'Soups' }] } });
  if (url.pathname === '/api/v3/profiles/u1/recipes') {
    const skip = Number(url.searchParams.get('skip')), limit = Number(url.searchParams.get('limit'));
    return json({ total: 40, results: ids.slice(skip, skip + limit).map((id) => ({ id, title: `Recipe ${id}` })) });
  }
  if (url.pathname === '/api/v3/cookbooks/c1') return json({ cookbook: { id: 'c1', title: 'Soups', sections: [{ title: 'Hot', recipes: ['r1', 'a5', 'extra1'] }], uncategorizedRecipes: ['r3'] }, recipes: {} });
  if (url.pathname === '/api/v2/plans/p1') return json({ plan: { id: 'p1', title: 'Plan', weeks: [{ days: [{ meals: [] }, { meals: [{ mealTime: 0, recipeId: 'r2' }, { mealTime: 6, recipeId: 'extra2' }] }] }] } });
  const m = /^\/api\/v3\/recipes\/(\w+)$/.exec(url.pathname);
  if (m) {
    if (m[1] === 'r9') return json({ error: 'gone' }, 404);
    if (m[1] === 'r7' && flaky++ < 2) return json({ error: 'busy' }, 503);
    return json(recipe(m[1]));
  }
  json({ error: 'no' }, 404);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/cook/`;

const problems = [];
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  const runAndSave = async (file) => {
    await page.evaluate(bookmarklet);
    await page.waitForFunction(() => !document.querySelector('[data-save]')?.disabled, null, { timeout: 30000 });
    const status = await page.locator('[data-status]').textContent();
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-save]')]);
    const out = path.join(os.tmpdir(), file);
    await download.saveAs(out);
    return { status, name: download.suggestedFilename(), data: JSON.parse(fs.readFileSync(out, 'utf8')) };
  };

  await page.goto(base);
  const first = await runAndSave('prepear-export-check-1.json');
  const d = first.data;
  if (!/^prepear-export-\d{4}-\d\d-\d\d\.json$/.test(first.name)) problems.push(`saved as ${first.name}`);
  if (d.format !== 'prepear-export' || d.profile.id !== 'u1') problems.push('wrong format or profile');
  if (d.recipeList.length !== 40) problems.push(`the list has ${d.recipeList.length} recipes, expected 40 (two pages)`);
  const got = Object.keys(d.recipes).sort();
  // 40 listed, minus r9 (gone), plus extra1 and extra2; a5 is r5's own copy, so it isn't asked for separately
  const expected = [...ids.filter((id) => id !== 'r9'), 'extra1', 'extra2'].sort();
  if (got.join() !== expected.join()) problems.push(`recipes kept: ${got.join()}`);
  if (asked['/api/v3/recipes/a5']) problems.push('the edited copy was asked for again, though its original answer covers it');
  if (asked['/api/v3/recipes/r7'] !== 3) problems.push(`the busy recipe was asked ${asked['/api/v3/recipes/r7']} times, expected 3 (two refusals, then an answer)`);
  if (d.failed.length !== 1 || d.failed[0].id !== 'r9') problems.push(`failed: ${JSON.stringify(d.failed)}`);
  if (d.cookbooks.c1?.cookbook?.sections?.[0]?.title !== 'Hot' || d.plans.p1?.plan?.title !== 'Plan') problems.push('the cookbook or plan is missing');
  if (!/^Done: 41 recipes, 1 cookbook, 1 meal plan\. 1 couldn’t be read/.test(first.status)) problems.push(`the panel says "${first.status}"`);

  // a reload, then the bookmarklet again: everything comes from what it kept
  const before = JSON.stringify(asked);
  await page.reload();
  delete asked['/cook/'];
  const askedBefore = JSON.parse(before); delete askedBefore['/cook/'];
  const second = await runAndSave('prepear-export-check-2.json');
  const newAsks = Object.entries(asked).filter(([k, v]) => k !== '/cook/' && v !== askedBefore[k] && !k.endsWith('/r9'));
  if (newAsks.length) problems.push(`after a reload it asked Prepear again for ${newAsks.map(([k]) => k).join(', ')}`);
  if (Object.keys(second.data.recipes).length !== 41) problems.push(`the second run kept ${Object.keys(second.data.recipes).length} recipes`);
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('✓ the export reads every recipe, cookbook and plan, tries busy ones again, and carries on after a reload');
