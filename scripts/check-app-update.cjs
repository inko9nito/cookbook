/*
  Checks Settings → Version's refresh icon against what happens on the phone (issue: the home-screen app kept an old
  version after a deploy). Builds the app twice (versions aaaaaaa and bbbbbbb), serves the first, opens it, then
  publishes the second and lets the service worker take it in the background, as the home-screen app does when it
  comes to the front. Tapping the icon must then load the new version, not say there's nothing newer. Tapping it again,
  with nothing newer, must still reload the app (issue #91).

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
    const running = () => page.evaluate(() => [...document.querySelectorAll('.ck-ion-version span')].map((e) => e.textContent).join(''));
    // Settings is the last tab (issue #27)
    const openSettings = async () => {
      await page.locator('ion-footer button[aria-label="Settings"]:visible').click({ timeout: 15000 });
      await page.waitForSelector('.ck-ion-version', { timeout: 10000 });
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

    // the refresh icon (tapping the version itself copies it, issue #48)
    await page.locator('.ck-ion-version ion-button').click();
    await page.waitForTimeout(4000);
    // the app comes back on Settings, without tapping the tab again (issue #48)
    const onTab = await page.evaluate(() => location.pathname);
    if (onTab !== '/settings') problems.push(`after the update the app opened on ${onTab}, not Settings`);
    const after = await running();
    if (!after.startsWith('bbbbbbb')) problems.push(`after tapping refresh it still runs "${after}", not the new version bbbbbbb`);

    // issue #91: with nothing newer, the icon still reloads the app (the home-screen app's only way to reload), and
    // comes back on Settings, still on the new version
    await page.evaluate(() => { window.__ckNotReloaded = true; });
    await page.locator('.ck-ion-version ion-button').click();
    await page.waitForTimeout(4000);
    if (await page.evaluate(() => window.__ckNotReloaded)) problems.push('with nothing newer, tapping refresh didn’t reload the app');
    const again = await page.evaluate(() => location.pathname);
    if (again !== '/settings') problems.push(`after a refresh with nothing newer the app opened on ${again}, not Settings`);
    if (!(await running()).startsWith('bbbbbbb')) problems.push(`after a refresh with nothing newer it runs "${await running()}"`);
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('✓ the refresh icon loads a version the service worker already took in the background, and reloads with nothing newer');
})();
