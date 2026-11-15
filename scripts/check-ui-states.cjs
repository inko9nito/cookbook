/*
  UI state check: taps through the app's interactive states and, for each one,
  - saves a screenshot to ui-states/ (gitignored) for a human or Claude to look at,
  - runs axe-core's color-contrast rule (catches unreadable text in selected/pressed states),
  - flags tappable elements that overlap each other (e.g. a drag handle on top of a Delete button),
  - flags text painted over other text in the same scrolling page or sheet,
  - checks the vertical rhythm (DESIGN.md): a section heading must have clearly more space above it than a group label,
  - flags sticky elements inside page content (Framework7 list group titles pin while scrolling inside a list group;
    DESIGN.md says group labels scroll with the content).

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
  const textOverlaps = await page.evaluate(() => {
    // every visible run of text in the current page's content and in open sheets/popups, one rect per line
    const scopes = [...document.querySelectorAll('.page-current .page-content, .sheet-modal.modal-in, .popup.modal-in, .actions-modal.modal-in')];
    const runs = [];
    for (const scope of scopes) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
          runs.push({ node: n, scope, r, text: n.textContent.trim().slice(0, 18) });
        }
      }
    }
    const found = new Set();
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i], b = runs[j];
        if (a.node === b.node || a.scope !== b.scope) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        // ignore lines that just touch (tight line heights make glyph boxes overlap by a pixel or two)
        if (w <= 4 || h <= 4) continue;
        const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
        if ((w * h) / smaller < 0.25) continue;
        found.add(`"${a.text}" overlaps "${b.text}"`);
      }
    }
    return [...found];
  });
  const sticky = await page.evaluate(() =>
    [...document.querySelectorAll('.page-current .page-content *')]
      .filter((el) => getComputedStyle(el).position === 'sticky' && !el.closest('.navbar, .toolbar, .searchbar'))
      .map((el) => `.${String(el.className).trim().split(/\s+/).join('.')} "${el.textContent.trim().slice(0, 18)}"`),
  );
  const rhythm = await page.evaluate(() => {
    const scope = document.querySelector('.page-current .page-content');
    if (!scope) return [];
    // space above an element = its text top minus the bottom of the nearest visible text above it
    const lines = [];
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 2) });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const r = document.createRange(); r.selectNodeContents(n);
      for (const x of r.getClientRects()) if (x.height > 2) lines.push({ node: n, top: x.top, bottom: x.bottom });
    }
    const gapAbove = (el) => {
      const r = document.createRange(); r.selectNodeContents(el); const t = r.getBoundingClientRect();
      const above = lines.filter((l) => l.bottom <= t.top + 1 && !el.contains(l.node));
      return above.length ? { name: el.textContent.trim().slice(0, 18), gap: Math.round(t.top - Math.max(...above.map((l) => l.bottom))) } : null;
    };
    const sections = [...scope.querySelectorAll('.ck-sec h2')].map(gapAbove).filter(Boolean);
    const groups = [...scope.querySelectorAll('.ck-group-label')].map(gapAbove).filter(Boolean);
    if (!sections.length || !groups.length) return [];
    const biggestGroup = Math.max(...groups.map((g) => g.gap));
    return sections.filter((sec) => sec.gap < biggestGroup + 12)
      .map((sec) => `"${sec.name}" has ${sec.gap}px above it, not clearly more than a group label (${biggestGroup}px)`);
  });
  const issues = [
    ...contrast.map((c) => `contrast: ${c}`),
    ...overlaps.map((o) => `overlap: ${o}`),
    ...textOverlaps.map((o) => `text overlap: ${o}`),
    ...rhythm.map((o) => `rhythm: ${o}`),
    ...sticky.map((o) => `sticky in page content: ${o}`),
  ];
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

  await step('04-recipe-page', async () => { await page.locator('.page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(900); });
  // scroll through the page: sticky or overlapping content only shows up mid-scroll
  for (const y of [300, 450, 600, 800, 1000]) {
    await step(`04-recipe-scroll-${y}`, async () => { await page.evaluate((top) => document.querySelector('.page-current .page-content').scrollTo(0, top), y); });
  }
  // the top bar hides while scrolling down and comes back on scroll up (Framework7 hideNavbarOnScroll)
  await step('04-recipe-bar-hidden', async () => {
    await page.mouse.move(200, 400);
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(120); }
    await page.waitForTimeout(500);
    if (!(await page.locator('.page-current .navbar, .navbar-current').first().evaluate((n) => n.classList.contains('navbar-hidden')))) throw new Error('top bar did not hide on scroll down');
  });
  await step('04-recipe-bar-back', async () => {
    for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
    await page.waitForTimeout(500);
    if (await page.locator('.page-current .navbar, .navbar-current').first().evaluate((n) => n.classList.contains('navbar-hidden'))) throw new Error('top bar did not come back on scroll up');
  });
  await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 0));
  await step('05-scale-sheet', async () => { await page.locator('.page-current .ck-scale-button').tap(); await page.waitForTimeout(800); });
  await step('05b-scale-x2', async () => { await page.locator('.sheet-modal.modal-in .ck-chip', { hasText: '×2' }).tap(); await page.waitForTimeout(400); });
  await step('05c-scale-what-i-have', async () => {
    await page.locator('.sheet-modal.modal-in .segmented .button', { hasText: 'What I have' }).tap();
    await page.waitForTimeout(400);
  });
  await step('05c2-scale-have-dialog', async () => {
    await page.locator('.sheet-modal.modal-in .ck-pick-list li', { hasText: 'chicken thighs' }).locator('a').tap();
    await page.waitForTimeout(600);
  });
  await step('05c3-scale-matched', async () => {
    await page.locator('.dialog.modal-in input').fill('3');
    await page.locator('.dialog.modal-in .dialog-button', { hasText: 'OK' }).tap();
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelector('.sheet-modal.modal-in .page-content').scrollTo(0, 0));
    const note = await page.locator('.sheet-modal.modal-in .ck-note').textContent();
    if (!/Matched to 3 lb .*×1\.5/.test(note)) throw new Error(`scaling by what I have gave "${note}"`);
  });
  await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap().catch(() => {});
  await page.waitForTimeout(700);
  await step('05d-recipe-scaled', async () => { await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 420)); });
  await step('06-recipe-bottom', async () => { await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 99999)); });
  await step('07-more-actions', async () => { await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Cancel' }).tap().catch(() => {});
  await page.waitForTimeout(500);

  await step('08-edit-page', async () => {
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap();
    await page.waitForTimeout(500);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap();
    await page.waitForTimeout(900);
  });
  await step('09-edit-row-swiped', async () => {
    await swipeLeft(ctx, page, page.locator('.page-current .ck-edit-list li.swipeout').nth(2));
    await page.waitForTimeout(600);
  });
  await step('10-ingredient-sheet', async () => {
    await page.locator('.page-current .ck-edit-list li.swipeout').nth(1).locator('.item-content').first().tap();
    await page.waitForTimeout(800);
  });
  await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap().catch(() => {});
  await page.waitForTimeout(600);
  await step('11-group-sheet', async () => {
    await page.locator('.page-current .ck-edit-list li.ck-group-row').first().locator('.item-content').first().tap();
    await page.waitForTimeout(800);
  });
  await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap().catch(() => {});
  await page.waitForTimeout(600);
  await step('12-edit-paste', async () => {
    await page.locator('.page-current textarea[placeholder^="Add one ingredient"]').fill('For the topping:\n\n1/2 cup brown sugar\n2 tbsp butter, melted');
    await page.waitForTimeout(300);
  });
  await step('12b-edit-pasted', async () => {
    await page.locator('.page-current .button', { hasText: 'Add 3 lines' }).tap();
    await page.waitForTimeout(500);
  });
  await step('12c-edit-step-sheet', async () => {
    await page.locator('.page-current .ck-edit-list').nth(1).locator('li.swipeout:not(.ck-group-row)').first().locator('.item-content').first().tap();
    await page.waitForTimeout(800);
  });
  await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap().catch(() => {});
  await page.waitForTimeout(600);
  await step('12d-edit-recipe-info', async () => { await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 99999)); });
  await step('12e-discard-prompt', async () => { await page.locator('.navbar a', { hasText: 'Cancel' }).filter({ visible: true }).first().tap(); });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Discard Changes' }).tap().catch(() => {});
  await page.waitForTimeout(900);
  await step('12f-recipe-scrolled', async () => { await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 500)); });

  await page.goto(BASE);
  await page.waitForTimeout(900);
  await step('12g-new-recipe', async () => { await page.locator('.navbar a[aria-label="New recipe"]').first().tap(); await page.waitForTimeout(900); });

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
