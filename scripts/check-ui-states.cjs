/*
  UI state check: taps through the app's interactive states and, for each one,
  - saves a screenshot to ui-states/ (gitignored) for a human or Claude to look at,
  - runs axe-core's color-contrast rule (catches unreadable text in selected/pressed states),
  - flags tappable elements that overlap each other (e.g. a drag handle on top of a Delete button).

  Impeccable's detector only scans a page as it first loads; this covers what happens after taps and swipes.
  Note: this runs in Chromium. iPhone Safari can still differ, so check on the phone too.

  Usage: npm run build && npx vite preview --port 4173   (in another terminal)
         npm run check:ui
*/
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const BASE = process.env.UI_BASE || 'http://localhost:4173/';
const OUT = path.resolve(__dirname, '..', 'ui-states');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function audit(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  await page.addScriptTag({ content: AXE });
  const contrast = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: ['color-contrast'], resultTypes: ['violations'] });
    return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message ?? v.help}`));
  });
  const overlaps = await page.evaluate(() => {
    const sel = 'a, button, .button, .link, .sortable-handler, .swipeout-actions-right > a, .stepper-button-minus, .stepper-button-plus, input, textarea';
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 &&
        r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    const els = [...document.querySelectorAll(sel)].filter(visible).filter((el) => !el.closest('.page-previous, .page-next, .modal-out'));
    const found = [];
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.contains(b) || b.contains(a)) continue;
        // compare only within one component (a list row, a bar, a button group), so content scrolling
        // under the tab bar or sitting behind an open sheet doesn't count
        const group = (el) => el.closest('li, .navbar-inner, .toolbar-inner, .actions-group, .segmented, .stepper, .ck-row, .block, .list-button');
        if (!group(a) || group(a) !== group(b)) continue;
        const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
        const w = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
        const h = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
        if (w <= 2 || h <= 2) continue;
        const smaller = Math.min(r1.width * r1.height, r2.width * r2.height);
        if ((w * h) / smaller < 0.2) continue;
        // only count it if one really paints over the other at the overlap's center
        const cx = Math.max(r1.left, r2.left) + w / 2, cy = Math.max(r1.top, r2.top) + h / 2;
        const top = document.elementFromPoint(cx, cy);
        if (!top || (!a.contains(top) && !b.contains(top))) continue;
        const label = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName) + (el.textContent.trim() ? ` "${el.textContent.trim().slice(0, 18)}"` : '');
        found.push(`${label(a)} overlaps ${label(b)}`);
      }
    }
    return found;
  });
  const issues = [...contrast.map((c) => `contrast: ${c}`), ...overlaps.map((o) => `overlap: ${o}`)];
  console.log(`${issues.length ? '✗' : '✓'} ${name}${issues.length ? '' : ''}`);
  issues.forEach((i) => console.log(`    ${i}`));
  return issues.length;
}

async function swipeLeft(ctx, page, locator) {
  const box = await locator.boundingBox();
  const cdp = await ctx.newCDPSession(page);
  const x = box.x + box.width * 0.6, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 15 * i, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let total = 0;
  const step = async (name, fn) => {
    try {
      await fn();
      total += await audit(page, name);
    } catch (e) {
      total += 1;
      console.log(`✗ ${name}: could not reach this state (${e.message.split('\n')[0]})`);
    }
  };

  await page.goto(BASE);
  await page.waitForTimeout(1000);
  await step('01-recipes', async () => {});
  await step('02-recipes-chip-selected', async () => { await page.locator('.ck-chip', { hasText: 'Dinner' }).first().tap(); });
  await step('03-sort-sheet', async () => {
    await page.locator('.ck-chip', { hasText: 'All' }).first().tap();
    await page.locator('.view-main .navbar a[aria-label="Sort recipes"]').tap();
  });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Cancel' }).tap().catch(() => {});
  await page.waitForTimeout(500);

  await step('04-recipe-page', async () => { await page.locator('.ck-recipes a', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(700); });
  for (const label of ['×½', '×2', '×3']) {
    await step(`05-recipe-scale-${label.replace('×', 'x').replace('½', 'half')}`, async () => {
      await page.locator('.page-current .segmented .button', { hasText: label }).tap();
    });
  }
  await step('06-recipe-bottom', async () => { await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 99999)); });
  await step('07-more-actions', async () => { await page.locator('.view-main .navbar a[aria-label="More actions"]').tap(); });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Cancel' }).tap().catch(() => {});
  await page.waitForTimeout(500);

  await step('08-editor', async () => { await page.locator('.view-main .navbar a.link:visible', { hasText: 'Edit' }).tap(); await page.waitForTimeout(800); });
  await step('09-editor-row-swiped', async () => {
    await swipeLeft(ctx, page, page.locator('.popup .sortable li.swipeout').nth(1));
    await page.waitForTimeout(600);
  });
  await step('10-ingredient-sheet', async () => {
    await page.locator('.popup .sortable li.swipeout').nth(0).locator('.item-content').first().tap();
    await page.waitForTimeout(800);
  });
  await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap().catch(() => {});
  await page.waitForTimeout(600);
  await step('11-paste-sheet', async () => { await page.locator('.popup .list-button', { hasText: 'Paste Ingredients' }).tap(); await page.waitForTimeout(800); });
  await page.locator('.sheet-modal.modal-in a', { hasText: 'Cancel' }).tap().catch(() => {});
  await page.waitForTimeout(600);
  await step('12-discard-prompt', async () => {
    await page.locator('.popup input[placeholder="Recipe name"]').fill('Changed title');
    await page.locator('.popup .navbar a', { hasText: 'Cancel' }).tap();
  });

  await page.goto(BASE);
  await page.waitForTimeout(900);
  await step('13-settings', async () => { await page.locator('.view-main .navbar a[aria-label="Settings"]').tap(); await page.waitForTimeout(700); });
  await step('14-style-guide', async () => { await page.locator('.page-current a', { hasText: 'Style Guide' }).tap(); await page.waitForTimeout(800); });
  for (const tab of ['Cookbooks', 'Plan', 'Groceries']) {
    await step(`15-tab-${tab.toLowerCase()}`, async () => { await page.locator('.tabbar a', { hasText: tab }).tap(); await page.waitForTimeout(500); });
  }

  if (errors.length) {
    console.log(`✗ page errors:\n    ${errors.join('\n    ')}`);
    total += errors.length;
  }
  await browser.close();
  console.log(total ? `\n${total} issue(s). Screenshots: ui-states/` : '\nNo issues. Screenshots: ui-states/');
  process.exit(total ? 2 : 0);
})();
