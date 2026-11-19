// Draws the app's PNG icons from public/icons/favicon.svg (issue #102), full-bleed squares:
// iOS and Android round the corners themselves. Run: node scripts/make-icons.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = path.join(__dirname, '..', 'public', 'icons');
const svg = fs.readFileSync(path.join(dir, 'favicon.svg'), 'utf8').replace(/ rx="\d+"/, '');
const sizes = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

(async () => {
  const browser = await chromium.launch();
  for (const [name, size] of Object.entries(sizes)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: path.join(dir, name), omitBackground: false });
    await page.close();
  }
  await browser.close();
})();
