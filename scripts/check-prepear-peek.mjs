/*
  Checks the Prepear peek bookmarklet (src/prepear/peek.ts, issue #14) on a fake Prepear page in Chromium:
  it records the page's API calls (fetch and XMLHttpRequest), and the file it saves leaves out the sign-in token,
  cookies, secret-named values, signed links and email addresses, while keeping the recipe text.

  Usage: npm run check:peek   (no server needed: it serves its own fake page)
*/
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { transformWithOxc } from 'vite';

// Playwright is installed on the machine, not in the project (as for check:ui), so it's found the CommonJS way
const { chromium } = createRequire(import.meta.url)('playwright');

const source = fs.readFileSync(new URL('../src/prepear/peek.ts', import.meta.url), 'utf8');
const js = (await transformWithOxc(source, 'peek.ts', { lang: 'ts' })).code;
// the same thing the Import from Prepear page does: the function's own source, called at once
const fn = js.slice(js.indexOf('function prepearPeek'));
const bookmarklet = `(${fn})()`;

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzNDU2Nzg5MCJ9.abcdefghijklmnopqrstuvwxyz0123456789';
const EMAIL = 'cook@example.com';
const html = `<!doctype html><title>Prepear</title><script src="/app.js"></script><a href="/recipe/12345">r</a><a href="/cookbook/abcdef0123456789abcdef">c</a>`;
const app = `localStorage.setItem('authToken', '${TOKEN}'); localStorage.setItem('prefs', JSON.stringify({ sort: 'new', email: '${EMAIL}' })); const api = '/api/v2/recipes?page=';`;
const recipe = {
  id: 12345, name: 'Kebabs', author: 'Ina', source: 'https://example.com/kebabs',
  ingredients: Array.from({ length: 12 }, (_, i) => ({ amount: '1', unit: 'tsp', name: `spice ${i}` })),
  owner: { email: EMAIL, accessToken: 'zzz-secret' },
  image: 'https://images.example.com/p/abc.jpg?X-Amz-Signature=deadbeefcafe',
};
const server = http.createServer((req, res) => {
  const send = (type, body) => { res.setHeader('content-type', type); res.end(body); };
  if (req.url === '/') { res.setHeader('set-cookie', 'sid=sessionvalue123; Path=/'); return send('text/html', html); }
  if (req.url === '/app.js') return send('application/javascript', app);
  if (req.url.startsWith('/api/v2/recipes/')) return send('application/json', JSON.stringify(recipe));
  if (req.url.startsWith('/api/v2/recipes')) return send('application/json', JSON.stringify({ items: Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Recipe ${i}`, description: 'x'.repeat(400) })) }));
  res.statusCode = 404; res.end();
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const problems = [];
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  await page.goto(base);
  await page.evaluate(bookmarklet);
  await page.evaluate(async (t) => {
    for (const n of [1, 2, 3, 4]) await fetch(`/api/v2/recipes?page=${n}`, { headers: { Authorization: `Bearer ${t}` } });
    await new Promise((r) => { const x = new XMLHttpRequest(); x.open('GET', `/api/v2/recipes/12345?access_token=${t}`); x.setRequestHeader('X-Auth-Token', t); x.onloadend = r; x.send(); });
    await new Promise((r) => setTimeout(r, 300));
  }, TOKEN);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-save]')]);
  const file = path.join(os.tmpdir(), 'prepear-peek-check.json');
  await download.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  const peek = JSON.parse(text);

  for (const [what, secret] of [['token', 'abcdefghijklmnopqrstuvwxyz0123456789'], ['email', EMAIL], ['cookie value', 'sessionvalue123'], ['secret-named value', 'zzz-secret'], ['link signature', 'deadbeefcafe']])
    if (text.includes(secret)) problems.push(`the file contains the ${what}`);
  if (download.suggestedFilename() !== 'prepear-peek.json') problems.push(`saved as ${download.suggestedFilename()}`);
  if (peek.callPatterns['GET ' + new URL(base).host + '/api/v2/recipes?page'] !== 4) problems.push(`call patterns: ${JSON.stringify(peek.callPatterns)}`);
  if (peek.calls.length !== 4) problems.push(`${peek.calls.length} calls kept, expected 3 samples of the list and the recipe`);
  const detail = peek.calls.find((c) => c.via === 'xhr');
  if (detail?.response?.author !== 'Ina' || detail?.response?.ingredients?.length !== 12) problems.push('the recipe answer lost its author or ingredients');
  if (!/^Bearer <hidden/.test(peek.calls[0]?.requestHeaders?.authorization)) problems.push(`the sign-in header reads ${peek.calls[0]?.requestHeaders?.authorization}`);
  const list = peek.calls[0]?.response?.items;
  if (!list || list.length > 31 || list.length < 5) problems.push(`a page of 30 recipes kept ${list?.length} items`);
  if (!peek.cookieNames.includes('sid') || !peek.routes.some((r) => r.endsWith('/recipe/:id'))) problems.push('cookie names or routes missing');
  if (!peek.code.apiAddresses.some((a) => a.includes('/api/v2/recipes'))) problems.push('the API address in the page code was not found');
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('✓ the peek records the calls and leaves out tokens, cookies and email addresses');
