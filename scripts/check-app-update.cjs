/*
  Checks Settings → Version's refresh icon against what happens on the phone (issue: the home-screen app kept an old
  version after a deploy). Builds the app twice (versions aaaaaaa and bbbbbbb), serves the first, opens it, then
  publishes the second and lets the service worker take it in the background, as the home-screen app does when it
  comes to the front. Tapping the icon must then load the new version, not say there's nothing newer.

  Usage: npm run check:update   (builds into a temporary folder and serves it itself)
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cookbook-update-'));
const build = (version) => {
  const out = path.join(tmp, version);
  execSync(`npx vite build --outDir ${out} --emptyOutDir`, { cwd: root, env: { ...process.env, COMMIT_REF: version }, stdio: 'ignore' });
  return out;
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

(async () => {
  const problems = [];
  const v1 = build('aaaaaaa');
  const v2 = build('bbbbbbb');
  let live = v1;
  // like Netlify: files as they are, anything else is the app (index.html), nothing cached by the browser
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(live, decodeURIComponent(url.pathname));
    if (!file.startsWith(live) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(live, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;

  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    const running = () => page.evaluate(() => document.querySelector('.page-current .ck-version-row .item-title')?.textContent ?? '');
    const openSettings = async () => {
      await page.waitForSelector('.view-main .navbar a[aria-label="Settings"]', { timeout: 15000 });
      await page.locator('.view-main .navbar a[aria-label="Settings"]').first().click();
      await page.waitForSelector('.page-current .ck-version-row', { timeout: 10000 });
    };

    await page.goto(base);
    // the service worker installs and takes over the page
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    await openSettings();
    if (!(await running()).startsWith('aaaaaaa')) problems.push(`the first version shows "${await running()}"`);

    // a deploy: the new version is live, and the service worker takes it in the background (the page isn't reloaded)
    live = v2;
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
      const sw = reg.installing ?? reg.waiting;
      if (sw) await new Promise((r) => { if (sw.state === 'activated') r(); sw.addEventListener('statechange', () => sw.state === 'activated' && r()); });
    });
    if (!(await running()).startsWith('aaaaaaa')) problems.push('the page changed version by itself, so this check can’t tell anything');

    // the refresh icon
    await page.locator('.page-current .ck-version-row .item-link').click();
    await page.waitForTimeout(4000);
    await openSettings().catch(() => {});
    const after = await running();
    if (!after.startsWith('bbbbbbb')) problems.push(`after tapping refresh it still runs "${after}", not the new version bbbbbbb`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('✓ the refresh icon loads a version the service worker already took in the background');
})();
