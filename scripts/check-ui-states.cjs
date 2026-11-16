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
    // ticked rows in cook mode fade below AA on purpose (--ck-done-ink, DESIGN.md); everything else must pass
    const r = await window.axe.run({ include: [document], exclude: [['.ck-cook li.ck-done']] }, { runOnly: ['color-contrast'], resultTypes: ['violations'] });
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
        // the part of each that shows: a button scrolled out of a scrolling row (e.g. cook mode's recipe tabs) is clipped
        const shownRect = (el) => {
          const raw = el.getBoundingClientRect();
          let r = { left: raw.left, top: raw.top, right: raw.right, bottom: raw.bottom };
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
            const c = p.getBoundingClientRect();
            r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
          }
          return { ...r, width: Math.max(0, r.right - r.left), height: Math.max(0, r.bottom - r.top) };
        };
        const r1 = shownRect(a), r2 = shownRect(b);
        if (!r1.width || !r1.height || !r2.width || !r2.height) continue;
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
    const scopes = [...document.querySelectorAll('.page-current .page-content, .sheet-modal.modal-in, .popup.modal-in .page-content, .actions-modal.modal-in')];
    const runs = [];
    for (const scope of scopes) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        // text scrolled out of a scrolling box (e.g. one half of cook mode) is clipped, not overlapping
        const clips = [];
        for (let a = el; a && a !== scope.parentElement; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') clips.push(a.getBoundingClientRect());
        }
        for (const raw of range.getClientRects()) {
          let r = { left: raw.left, top: raw.top, right: raw.right, bottom: raw.bottom };
          for (const c of clips) r = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
          r.width = r.right - r.left; r.height = r.bottom - r.top;
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
  // button labels that run into the button's edges (e.g. "Mark as made" in a half-width dialog button): 8px clear each side
  const cramped = await page.evaluate(() =>
    [...document.querySelectorAll('.dialog.modal-in .dialog-button, .actions-modal.modal-in .actions-button, .page-current .button')]
      .filter((b) => b.offsetParent && b.textContent.trim())
      .filter((b) => {
        // measure the glyphs (text nodes), not the label's block wrappers, which span the whole button
        const box = b.getBoundingClientRect(); let left = Infinity, right = -Infinity;
        const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (!n.textContent.trim()) continue;
          const r = document.createRange(); r.selectNodeContents(n);
          for (const x of r.getClientRects()) { left = Math.min(left, x.left); right = Math.max(right, x.right); }
        }
        return left < box.left + 8 || right > box.right - 8;
      })
      .map((b) => `"${b.textContent.trim()}"`),
  );
  const issues = [
    ...contrast.map((c) => `contrast: ${c}`),
    ...cramped.map((c) => `label doesn't fit its button: ${c}`),
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
  // R2: chips come from the tags in use; two picked offer "all" or "any" in the sort sheet; the filter is remembered
  await step('02b-recipes-two-tags-any', async () => {
    await page.locator('.ck-chip', { hasText: 'Quick' }).first().tap();
    await page.waitForTimeout(200);
    const all = await page.locator('.page-current .ck-card').count();
    if (all !== 1) throw new Error(`Dinner + Quick (all tags) shows ${all} recipes, expected 1`);
    await page.locator('.view-main .navbar a[aria-label="Sort recipes"]').tap();
    await page.waitForTimeout(400);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Any of the tags' }).tap();
    await page.waitForTimeout(500);
    const any = await page.locator('.page-current .ck-card').count();
    if (any !== 4) throw new Error(`Dinner or Quick (any tag) shows ${any} recipes, expected 4`);
  });
  await step('02c-filter-remembered', async () => {
    await page.reload();
    await page.waitForTimeout(1200);
    const on = await page.locator('.ck-chip.ck-chip-on').allTextContents();
    if (on.join(',') !== 'Dinner,Quick') throw new Error(`after reopening, the picked chips are ${on.join(',') || 'none'}`);
    const note = await page.locator('.page-current .ck-count').textContent();
    if (!note.includes('any tag')) throw new Error(`count line doesn't say "any tag": ${note}`);
  });
  await step('03-sort-sheet', async () => {
    await page.locator('.ck-chip', { hasText: 'All' }).first().tap();
    await page.locator('.view-main .navbar a[aria-label="Sort recipes"]').tap();
  });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Cancel' }).tap().catch(() => {});
  await page.waitForTimeout(500);

  // iOS's own back gesture (Safari and the home-screen app) is a browser back: it goes back a page inside the app
  // (Framework7 browserHistory), never out of the app to whatever came before it, such as Google's sign-in page
  await step('03b-browser-back-from-recipe', async () => {
    await page.locator('.page-current .ck-card', { hasText: 'Kebabs' }).tap();
    await page.waitForTimeout(900);
    await page.goBack();
    await page.waitForTimeout(900);
    if (!page.url().startsWith(BASE)) throw new Error(`back left the app for ${page.url()}`);
    const pages = await page.locator('#view-recipes .page').count();
    if (pages !== 1 || !(await page.locator('#view-recipes .page-current .ck-card').count())) throw new Error('back did not return to Recipes');
  });

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
  await page.waitForFunction(() => !document.querySelector('.toast.modal-in, .toast.modal-out'), null, { timeout: 5000 }).catch(() => {});
  await step('05d-recipe-scaled', async () => { await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 420)); });
  await step('06-recipe-bottom', async () => { await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 99999)); });
  await step('07-more-actions', async () => { await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Cancel' }).tap().catch(() => {});
  await page.waitForTimeout(500);

  // cook mode (Prepear layout: ingredients on top, directions below, drag handle between)
  await step('16-cook-open', async () => {
    await page.locator('.page-current .ck-cta-button', { hasText: 'Start cooking' }).tap(); await page.waitForTimeout(900);
    // each step's checkbox sits on the middle of its first line of text
    const off = await page.evaluate(() => [...document.querySelectorAll('.ck-cook .ck-pane-steps li:has(label)')].map((li) => {
      const icon = li.querySelector('.icon-checkbox').getBoundingClientRect();
      const t = li.querySelector('.ck-cook-text'); const line = t.getClientRects()[0];
      return Math.abs(icon.top + icon.height / 2 - (line.top + parseFloat(getComputedStyle(t).lineHeight) / 2));
    }));
    if (off.some((d) => d > 3)) throw new Error(`step checkbox off its first line by ${Math.max(...off).toFixed(1)}px`);
    // the divider has no solid band over the text under it (only a hairline and a fade, drawn as gradients)
    const bg = await page.locator('.ck-cook .ck-split-handle').evaluate((el) => getComputedStyle(el).backgroundColor);
    if (bg !== 'rgba(0, 0, 0, 0)') throw new Error(`divider has a solid background (${bg})`);
    // ticking a row only crosses it out: Framework7's grey pressed flash is off
    const pressed = await page.locator('.ck-cook .ck-cook-list').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--f7-list-link-pressed-bg-color').trim());
    if (pressed !== 'transparent') throw new Error(`cook rows flash grey when tapped (${pressed})`);
    // nothing sits under the divider's fade at the ends: the Directions heading at the top, the last ingredient at the bottom
    const ends = await page.evaluate(() => {
      const handle = document.querySelector('.ck-cook .ck-split-handle').getBoundingClientRect();
      const ing = document.querySelector('.ck-cook .ck-pane-ingredients');
      const head = document.querySelector('.ck-cook .ck-pane-steps h2').getBoundingClientRect();
      ing.scrollTop = ing.scrollHeight;
      const last = [...ing.querySelectorAll('li')].pop().querySelector('.item-inner').getBoundingClientRect();
      const out = { lastBottom: last.bottom, headTop: head.top, fadeTop: handle.top, fadeBottom: handle.bottom };
      ing.scrollTop = 0;
      return out;
    });
    if (ends.lastBottom > ends.fadeTop + 1) throw new Error(`last ingredient ends ${Math.round(ends.lastBottom - ends.fadeTop)}px into the divider's fade when scrolled to the end`);
    if (ends.headTop < ends.fadeBottom - 1) throw new Error(`Directions heading starts ${Math.round(ends.fadeBottom - ends.headTop)}px inside the divider's fade`);
  });
  await step('16a-cook-servings-sheet', async () => {
    await page.locator('.ck-cook .ck-scale-button').tap(); await page.waitForTimeout(700);
    // the sheet and its dimmed backdrop are over cook mode, not behind it
    const top = await page.evaluate(() => {
      const r = document.querySelector('.sheet-modal.modal-in').getBoundingClientRect();
      const onSheet = !!document.elementFromPoint(r.left + 40, r.top + 20).closest('.sheet-modal.modal-in');
      const above = document.elementFromPoint(40, 120);
      return { onSheet, dimmed: !!above.closest('.sheet-backdrop.backdrop-in') };
    });
    if (!top.onSheet || !top.dimmed) throw new Error(`Adjust amounts isn't on top of cook mode (sheet ${top.onSheet}, backdrop ${top.dimmed})`);
  });
  await step('16a2-cook-servings-changed', async () => {
    await page.locator('.sheet-modal.modal-in .ck-chip', { hasText: '×2' }).tap(); await page.waitForTimeout(300);
    await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(700);
    const pill = await page.locator('.ck-cook .ck-scale-button').innerText();
    if (!/×2/.test(pill)) throw new Error(`cook mode servings pill didn't update (${pill})`);
  });
  await step('16b-cook-ingredient-ticked', async () => {
    await page.locator('.ck-cook .ck-pane-ingredients li').first().locator('label').tap();
    await page.waitForTimeout(300);
    if (!(await page.locator('.ck-cook .ck-pane-ingredients li.ck-done').count())) throw new Error('ticked ingredient is not crossed out');
  });
  await step('16c-cook-step-ticked', async () => {
    const li = page.locator('.ck-cook .ck-pane-steps li:has(label)').first();
    const extra = li.locator('.ck-step-extra .accordion-item-content');
    const h0 = await extra.evaluate((e) => e.getBoundingClientRect().height);
    await li.locator('label').tap();
    // its ingredients and timers slide up (Framework7 accordion), not vanish in one frame
    await page.waitForTimeout(80);
    const mid = await extra.evaluate((e) => e.getBoundingClientRect().height);
    await page.waitForTimeout(500);
    const end = await extra.evaluate((e) => e.getBoundingClientRect().height);
    if (!(mid > 0 && mid < h0)) throw new Error(`step extras didn't slide (height ${Math.round(h0)} → ${Math.round(mid)} after 80ms)`);
    if (end !== 0) throw new Error(`step extras still ${Math.round(end)}px tall after ticking`);
  });
  await step('16d-cook-timer-running', async () => {
    const before = await page.locator('.ck-cook .ck-pane-steps li.ck-done').count();
    await page.locator('.ck-cook .ck-pane-steps .ck-timer-button').first().tap();
    await page.waitForTimeout(1300);
    if (!(await page.locator('.ck-cook .ck-timer-pill').count())) throw new Error('no running timer in the top bar');
    if ((await page.locator('.ck-cook .ck-pane-steps li.ck-done').count()) !== before) throw new Error('tapping the timer ticked the step');
  });
  await step('16e-cook-divider-dragged', async () => {
    const pane = page.locator('.ck-cook .ck-pane-ingredients');
    const h0 = (await pane.boundingBox()).height;
    const box = await page.locator('.ck-cook .ck-split-handle').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // while held, the grip shows bigger so you can tell you've got it
    const held = await page.locator('.ck-cook .ck-split-grip').boundingBox();
    if (held.width < 64) throw new Error(`grip doesn't grow while held (${held.width}px wide)`);
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 15 * i);
    await page.mouse.up();
    await page.waitForTimeout(300);
    const h1 = (await pane.boundingBox()).height;
    const after = await page.locator('.ck-cook .ck-split-handle').boundingBox();
    const missed = Math.abs(after.y + after.height / 2 - (box.y + box.height / 2 - 120));
    if (h1 >= h0 || missed > 24) throw new Error(`divider did not follow the drag (ingredients ${Math.round(h0)} → ${Math.round(h1)}px, handle ${Math.round(missed)}px from the finger)`);
  });
  await step('16e2-cook-divider-long-press', async () => {
    // a finger held on the handle, then dragged: it moves the split and selects no text
    const box = await page.locator('.ck-cook .ck-split-handle').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(900);
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 15 * i }] });
    const selected = await page.evaluate(() => window.getSelection().toString());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(300);
    const after = await page.locator('.ck-cook .ck-split-handle').boundingBox();
    if (selected) throw new Error(`long press on the handle selected text ("${selected.slice(0, 30)}")`);
    if (Math.abs(after.y + after.height / 2 - (y + 90)) > 24) throw new Error(`touch drag didn't move the divider (${Math.round(after.y + after.height / 2 - y)}px of 90)`);
  });
  await step('16f-cook-all-steps-done', async () => {
    const open = page.locator('.ck-cook .ck-pane-steps li:not(.ck-done):has(label)');
    for (let i = 0; i < 12 && (await open.count()); i++) {
      await open.first().locator('label').scrollIntoViewIfNeeded();
      await open.first().locator('label').tap();
      await page.waitForTimeout(200);
    }
  });
  await step('16g-cook-mark-as-made', async () => {
    await page.locator('.ck-cook a[aria-label="Close cook mode"]').tap();
    await page.waitForTimeout(600);
    if (!(await page.locator('.dialog.modal-in', { hasText: 'Mark as made' }).count())) throw new Error('no Mark as made prompt after ticking every step');
  });
  await page.locator('.dialog.modal-in .dialog-button', { hasText: 'Not now' }).tap().catch(() => {});
  await page.waitForTimeout(900);

  // ── photos: add one (opens Crop Photo), pan it, add two more at once, save; then swipe them and open the viewer ──
  const photoFile = (n) => path.resolve(__dirname, '..', 'public', 'photos', n);
  await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(500);
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap(); await page.waitForTimeout(900);
  await step('17-crop-photo', async () => {
    await page.locator('.page-current input[type=file]').setInputFiles(photoFile('seafood-salad.jpg'));
    await page.waitForTimeout(1500);
    if (!(await page.locator('.ck-crop.modal-in .cropper-container').count())) throw new Error('picking one photo did not open Crop Photo');
    const f = await page.locator('.ck-crop .cropper-container').boundingBox();
    if (Math.abs(f.width / f.height - 4 / 3) > 0.02) throw new Error(`crop frame is not 4:3 (${Math.round(f.width)}×${Math.round(f.height)})`);
    await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2); await page.mouse.down();
    await page.mouse.move(f.x + f.width / 2 + 60, f.y + f.height / 2, { steps: 5 }); await page.mouse.up();
  });
  await step('17b-photos-added', async () => {
    await page.locator('.ck-crop a', { hasText: 'Done' }).tap(); await page.waitForTimeout(1200);
    await page.locator('.page-current input[type=file]').setInputFiles([photoFile('corn.jpg'), photoFile('meatballs.jpg')]);
    await page.waitForTimeout(1500);
    if (await page.locator('.ck-crop.modal-in').count()) throw new Error('picking several photos opened Crop Photo');
    const n = await page.locator('.page-current .ck-thumb:not(.ck-thumb-add)').count();
    if (n !== 4) throw new Error(`expected 4 photos, found ${n}`);
  });
  await page.locator('.page-current .navbar a', { hasText: 'Save' }).tap(); await page.waitForTimeout(1000);
  await step('17c-recipe-photos-swiped', async () => {
    await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 0)); await page.waitForTimeout(400);
    const hero = await page.locator('.page-current swiper-container').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const at = (x) => [{ x: hero.x + x, y: hero.y + hero.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(300) });
    for (let x = 280; x >= 60; x -= 20) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x) }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(700);
    const idx = await page.evaluate(() => document.querySelector('.page-current swiper-container').swiper.activeIndex);
    if (idx !== 1) throw new Error(`swipe did not move to the second photo (at ${idx})`);
    if (await page.locator('.photo-browser-popup.modal-in').count()) throw new Error('swiping opened the photo viewer');
    // the panel's rounded top still sits over the photos
    const top = await page.evaluate(() => { const r = document.querySelector('.page-current .ck-panel').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + 10).closest('.ck-panel') !== null; });
    if (!top) throw new Error('the photos cover the panel');
  });
  await step('17d-photo-viewer', async () => {
    await page.locator('.page-current swiper-slide.swiper-slide-active button').tap(); await page.waitForTimeout(900);
    const title = await page.locator('.photo-browser-popup.modal-in .navbar .title').textContent().catch(() => '');
    if (!/2\s*of\s*4/.test(title)) throw new Error(`photo viewer doesn't show "2 of 4" (${title})`);
  });
  await page.locator('.photo-browser-popup.modal-in .navbar a', { hasText: 'Close' }).tap().catch(() => {});
  await page.waitForTimeout(800);

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
  await step('11-group-renamed-inline', async () => {
    const input = page.locator('.page-current .ck-edit-list li.ck-group-row input.ck-group-input').first();
    await input.tap();
    await input.fill('Yogurt marinade');
    await page.waitForTimeout(300);
    if ((await input.inputValue()) !== 'Yogurt marinade') throw new Error('group name did not change inline');
    if (await page.locator('.sheet-modal.modal-in').count()) throw new Error('a sheet opened for the group name');
  });
  await step('11b-group-added-inline', async () => {
    await page.locator('.page-current .button.ck-dashed').first().tap();
    await page.waitForTimeout(500);
    const focused = await page.evaluate(() => document.activeElement?.classList.contains('ck-group-input') && document.activeElement.value === '');
    if (!focused) throw new Error('new group name field is not focused');
    await page.keyboard.type('Garnish');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  });
  await step('11c-group-moved-down', async () => {
    // ↑ ↓ on a group row move the whole group (its rows too) past the next group, and keep it under the finger
    const names = () => page.evaluate(() => [...document.querySelectorAll('.page-current .ck-edit-list')[0].querySelectorAll('.ck-group-input')].map((i) => i.value));
    const rowsUnder = (name) => page.evaluate((name) => {
      const lis = [...document.querySelectorAll('.page-current .ck-edit-list')[0].children[0].children];
      const k = lis.findIndex((li) => li.querySelector('.ck-group-input')?.value === name);
      const out = []; for (let j = k + 1; j < lis.length && !lis[j].classList.contains('ck-group-row'); j++) out.push(lis[j].textContent.trim().slice(0, 20));
      return out.join('|');
    }, name);
    const before = await names();
    const first = before[0];
    const under = await rowsUnder(first);
    const row = page.locator('.page-current .ck-edit-list').first().locator('li.ck-group-row').first();
    await row.locator('.ck-move-btn').nth(1).scrollIntoViewIfNeeded();
    const y0 = (await row.locator('.ck-move-btn').nth(1).boundingBox()).y;
    await row.locator('.ck-move-btn').nth(1).tap(); await page.waitForTimeout(400);
    const after = await names();
    if (after[1] !== first) throw new Error(`group "${first}" didn't move down (${after.join(', ')})`);
    if ((await rowsUnder(first)) !== under) throw new Error('the group\'s rows didn\'t move with it');
    const moved = page.locator('.page-current .ck-edit-list').first().locator('li.ck-group-row').nth(1).locator('.ck-move-btn').nth(1);
    const y1 = (await moved.boundingBox()).y;
    if (Math.abs(y1 - y0) > 4) throw new Error(`moved group jumped ${Math.round(y1 - y0)}px on screen`);
    // drag handles are on the right, so a thumb on them doesn't cover the row's text
    const side = await page.evaluate(() => { const li = document.querySelector('.page-current .ck-edit-list li:not(.ck-group-row)'); return li.querySelector('.sortable-handler').getBoundingClientRect().left - li.getBoundingClientRect().left > li.getBoundingClientRect().width / 2; });
    if (!side) throw new Error('drag handles are on the left');
  });
  // a long press on a row picks it up: it turns pale Tomato (no grey pressed shade) while held and dragged
  let holdCdp;
  await step('11d-row-held', async () => {
    const li = page.locator('.page-current .ck-edit-list li:not(.ck-group-row)').nth(2);
    await li.scrollIntoViewIfNeeded();
    const box = await li.boundingBox();
    const before = await li.evaluate((e) => getComputedStyle(e).backgroundColor);
    holdCdp = await ctx.newCDPSession(page);
    await holdCdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 120, y: box.y + box.height / 2 }] });
    await page.waitForTimeout(900);
    const held = await li.evaluate((e) => ({ sorting: e.classList.contains('sorting'), bg: getComputedStyle(e).backgroundColor, tint: getComputedStyle(e).getPropertyValue('--ck-accent-tint'), link: getComputedStyle(e.querySelector('.item-link')).backgroundColor }));
    if (!held.sorting) throw new Error('long press did not pick the row up');
    if (held.bg === before) throw new Error('held row looks the same as the others');
    if (held.link !== 'rgba(0, 0, 0, 0)') throw new Error(`held row keeps the pressed shade (${held.link})`);
  });
  if (holdCdp) {
    await holdCdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {});
    await holdCdp.detach().catch(() => {});
    await page.waitForTimeout(500);
  }
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
  await step('12d-edit-recipe-info', async () => {
    await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 99999));
    const layout = await page.evaluate(() => {
      const out = [];
      // each row's reorder handle (20px icon) is centred on its first line: step number, ingredient, or group name
      for (const li of document.querySelectorAll('.page-current .ck-edit-list li')) {
        // group rows: centred on the "Group" + name label, level with the ↑ ↓ buttons
        const target = li.querySelector('.ck-group-title') || li.querySelector('.ck-step-no') || li.querySelector('.item-title');
        let line = target.getBoundingClientRect();
        if (!target.classList.contains('ck-group-title')) {
          const w = document.createTreeWalker(target, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && !n.textContent.trim());
          const r = document.createRange(); r.selectNodeContents(n); line = r.getClientRects()[0];
        }
        const h = li.querySelector('.sortable-handler'); const hr = h.getBoundingClientRect();
        const icon = hr.top + parseFloat(getComputedStyle(h).paddingTop) + 10;
        const off = Math.abs(icon - (line.top + line.height / 2));
        if (off > 2) out.push(`reorder handle ${Math.round(off)}px off the first line of "${li.textContent.trim().slice(0, 24)}"`);
        const move = li.querySelector('.ck-group-move');
        if (move) { const m = move.getBoundingClientRect(); if (Math.abs(m.top + m.height / 2 - icon) > 3) out.push(`↑ ↓ not level with the handle on group "${li.querySelector('input').value}"`); }
      }
      // groups are separate cards: a group row sits on the page colour, not the card fill
      for (const g of document.querySelectorAll('.page-current .ck-edit-list li.ck-group-row')) {
        const next = g.nextElementSibling; if (next && !next.classList.contains('ck-group-row') && getComputedStyle(g).backgroundColor === getComputedStyle(next).backgroundColor) out.push(`group row "${g.textContent.trim()}" has the same fill as its card (${getComputedStyle(g).backgroundColor})`);
      }
      // clear buttons inside their field
      for (const b of document.querySelectorAll('.page-current .ck-fields .input-clear-button')) {
        const wrap = b.closest('.item-input-wrap').getBoundingClientRect(); const r = b.getBoundingClientRect();
        if (r.width && wrap.right - r.right < 8) out.push(`clear button ${Math.round(wrap.right - r.right)}px from the field edge`);
      }
      return out;
    });
    if (layout.length) throw new Error(layout.join('; '));
  });
  await step('12d2-add-tag-typing', async () => {
    // tags are typed inline at the end of the chips, no dialog; the chip hugs its text like the other chips
    const slack = () => page.evaluate(() => {
      const chip = document.querySelector('.page-current .ck-tag-add'); const i = chip.querySelector('input');
      const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return Math.round(chip.getBoundingClientRect().right - i.getBoundingClientRect().left - c.measureText(i.value || i.placeholder).width);
    });
    const empty = await slack();
    await page.locator('.page-current .ck-tag-add input').fill('Make-ahead');
    const typed = await slack();
    if (empty > 24 || typed > 24) throw new Error(`"Add tag" chip has ${Math.max(empty, typed)}px after its text (other chips have 15)`);
  });
  await step('12d3-tag-added', async () => {
    await page.locator('.page-current .ck-tag-add input').press('Enter'); await page.waitForTimeout(300);
    if (await page.locator('.dialog.modal-in').count()) throw new Error('adding a tag opened a dialog');
    const on = await page.locator('.page-current .ck-chip.ck-chip-on', { hasText: 'Make-ahead' }).count();
    if (!on) throw new Error('new tag is not shown as a selected chip');
    if ((await page.locator('.page-current .ck-tag-add input').inputValue()) !== '') throw new Error('tag field not cleared after adding');
    if (await page.locator('.page-current .ck-fields input[placeholder^="#"]').count()) throw new Error('the separate Tags text field is still there');
  });
  await step('12e-discard-prompt', async () => { await page.locator('.navbar a', { hasText: 'Cancel' }).filter({ visible: true }).first().tap(); });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Discard Changes' }).tap().catch(() => {});
  await page.waitForTimeout(900);
  await step('12f-recipe-scrolled', async () => { await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 500)); });

  await page.goto(BASE);
  await page.waitForTimeout(900);
  await step('12g-new-recipe', async () => {
    await page.locator('.navbar a[aria-label="New recipe"]').first().tap();
    await page.waitForTimeout(900);
    // the form title is centered on the screen (DESIGN.md "Pushed form screens")
    const off = await page.evaluate(() => {
      const t = document.querySelector('.page-current .navbar .title');
      const r = t.getBoundingClientRect();
      return Math.round(r.left + r.width / 2 - innerWidth / 2);
    });
    if (Math.abs(off) > 3) throw new Error(`title is ${off}px off center`);
  });

  await page.goto(BASE);
  await page.waitForTimeout(900);
  await step('13-settings', async () => { await page.locator('.view-main .navbar a[aria-label="Settings"]').tap(); await page.waitForTimeout(700); });
  // the App group: which version is running; tapping it checks for updates, its refresh icon spinning meanwhile, with
  // no dialog or toast (the service worker finds no newer version here, so the icon just stops)
  await step('13b-settings-check-updates', async () => {
    const row = page.locator('.page-current li.ck-version-row');
    const version = await row.locator('.item-title').textContent();
    if (!/^\w{5,7} · /.test(version.trim())) throw new Error(`the version reads "${version}"`);
    await row.scrollIntoViewIfNeeded();
    await row.locator('.item-link').tap(); await page.waitForTimeout(200);
    const spinning = await row.locator('.ck-refresh.ck-spinning').count();
    const popups = await page.locator('.dialog.modal-in, .toast.modal-in').count();
    if (!spinning) throw new Error('the refresh icon does not spin while checking');
    if (popups) throw new Error('checking for updates still shows a dialog or toast');
    await page.waitForTimeout(2000);
    if (await row.locator('.ck-refresh.ck-spinning').count()) throw new Error('the refresh icon kept spinning after the check');
    if (await page.locator('.dialog.modal-in, .toast.modal-in').count()) throw new Error('the check ended in a dialog or toast');
  });
  // every Settings group is a white card under its own title (rows outside the card once sat on the grey page)
  await step('13c-settings-groups', async () => {
    const t = await page.evaluate(() => {
      const lists = [...document.querySelectorAll('.page-current .list')];
      return {
        loose: lists.filter((l) => [...l.children].some((c) => c.tagName === 'LI' || c.classList.contains('item-content'))).length,
        notWhite: lists.filter((l) => getComputedStyle(l.querySelector('ul')).backgroundColor !== 'rgb(255, 255, 255)').length,
        titles: [...document.querySelectorAll('.page-current .block-title')].map((x) => x.textContent),
        footers: document.querySelectorAll('.page-current .block-footer').length,
      };
    });
    if (t.loose || t.notWhite) throw new Error(`${t.loose + t.notWhite} Settings group(s) not in a white card`);
    if (t.titles.join() !== 'Account,Version,Style Guide') throw new Error(`Settings group titles read ${JSON.stringify(t.titles)}`);
    if (t.footers) throw new Error(`Settings has ${t.footers} footers, expected none`);
    // Account is one row: the address, then Sign Out in red at its end
    const acct = await page.evaluate(() => {
      const li = document.querySelector('.page-current li.ck-account-row'); const out = li?.querySelector('.ck-sign-out');
      return { rows: li?.closest('ul').children.length, title: li?.querySelector('.item-title').textContent, out: out?.textContent, color: out && getComputedStyle(out).color,
        right: out && li.getBoundingClientRect().right - out.getBoundingClientRect().right };
    });
    if (acct.rows !== 1 || acct.title !== 'demo@example.com') throw new Error(`the Account card has ${acct.rows} rows, titled "${acct.title}"`);
    if (acct.out !== 'Sign Out' || acct.color !== 'rgb(209, 41, 31)' || acct.right > 40) throw new Error('Sign Out is not red at the end of the account row');
    // every card's row is the same height, and Sign Out is still a 44px tap target
    const heights = await page.evaluate(() => [...document.querySelectorAll('.page-current .list li')].map((li) => Math.round(li.getBoundingClientRect().height)).filter(Boolean));
    if (new Set(heights).size !== 1) throw new Error(`Settings rows are ${heights.join(', ')}px tall, not all the same`);
    const tap = await page.locator('.page-current .ck-sign-out').evaluate((e) => e.getBoundingClientRect().height);
    if (tap < 44) throw new Error(`Sign Out's tap target is ${tap}px tall`);
  });
  await step('14-style-guide', async () => { await page.locator('.page-current a', { hasText: 'Cookbook' }).tap(); await page.waitForTimeout(800); });
  for (const tab of ['Cookbooks', 'Plan', 'Groceries']) {
    await step(`15-tab-${tab.toLowerCase()}`, async () => {
      // hold a finger on the tab first: the tab bar must not swell under it (Framework7's iOS 26 touch highlight is off)
      const box = await page.locator(`.tabbar a[aria-label="${tab}"]`).boundingBox();
      // icons only: no label text under the tab icons
      if ((await page.locator('.tabbar').innerText()).trim()) throw new Error('tab bar shows labels');
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      await page.waitForTimeout(250);
      const scale = await page.evaluate(() => [...document.querySelectorAll('.tabbar, .tabbar *')].map((e) => e.style.scale).filter(Boolean));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await page.waitForTimeout(500);
      if (scale.length) throw new Error(`tab bar swells under the finger (scale ${scale.join(', ')})`);
    });
  }

  // installed on the home screen, an iPhone adds a 34pt strip under the bottom bars (Safari has none). The bars must
  // run to the bottom edge with their content centred above the strip, not float with the page showing beneath.
  await step('18-home-indicator-bars', async () => {
    await page.locator('.tabbar a[aria-label="Recipes"]').tap(); await page.waitForTimeout(600);
    const safe = await page.addStyleTag({ content: ':root { --f7-safe-area-bottom: 34px !important; }' });
    await page.waitForTimeout(300);
    const bar = (sel, content) => page.evaluate(([sel, content]) => {
      const t = document.querySelector(sel); const r = t.getBoundingClientRect(); const inner = t.querySelector('.toolbar-inner').getBoundingClientRect();
      const c = t.querySelector(content).getBoundingClientRect();
      return { bottom: Math.round(r.bottom), innerBottom: Math.round(inner.bottom), screen: innerHeight, mid: Math.round(c.top + c.height / 2 - r.top), above: Math.round(r.height - 34) };
    }, [sel, content]);
    const tab = await bar('.toolbar.tabbar', '.tab-link svg');
    const problems = [];
    if (tab.innerBottom !== tab.screen) problems.push(`tab bar stops ${tab.screen - tab.innerBottom}px above the screen's bottom`);
    if (Math.abs(tab.mid - tab.above / 2) > 2) problems.push(`tab icons not centred above the home-indicator strip (${tab.mid}px of ${tab.above})`);
    await page.locator('.page-current .ck-card').first().tap(); await page.waitForTimeout(900);
    const cta = await bar('.page-current .toolbar.ck-cta', '.ck-cta-button');
    if (cta.innerBottom !== cta.screen) problems.push(`Start cooking bar stops ${cta.screen - cta.innerBottom}px above the screen's bottom`);
    if (Math.abs(cta.mid - cta.above / 2) > 2) problems.push(`Start cooking not centred above the home-indicator strip (${cta.mid}px of ${cta.above})`);
    await safe.evaluate((el) => el.remove());
    if (problems.length) throw new Error(problems.join('; '));
  });

  // issue #8: the Recipes grid shows square photos with the text below them on the page, no card around them
  await step('20-square-tiles', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    const t = await page.evaluate(() => {
      const card = document.querySelector('.page-current .ck-card'); const photo = card.querySelector('.ck-card-photo').getBoundingClientRect();
      const title = card.querySelector('.ck-card-title').getBoundingClientRect();
      return { ratio: photo.width / photo.height, cardBg: getComputedStyle(card).backgroundColor, titleBelow: title.top >= photo.bottom };
    });
    if (Math.abs(t.ratio - 1) > 0.02) throw new Error(`tile photo is ${t.ratio.toFixed(2)}:1, not square`);
    if (t.cardBg !== 'rgba(0, 0, 0, 0)') throw new Error(`tiles still have a card background (${t.cardBg})`);
    if (!t.titleBelow) throw new Error('tile title is not below the photo');
  });
  // issue #7: back and ••• float over the photo, which starts at the top of the screen, with no bar behind them
  await step('21-buttons-over-photo', async () => {
    await page.locator('.page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    const t = await page.evaluate(() => {
      const hero = document.querySelector('.page-current .ck-hero, .page-current .ck-hero-wrap').getBoundingClientRect();
      const nav = document.querySelector('.navbar-current, .page-current .navbar');
      const back = nav.querySelector('.link.back').getBoundingClientRect();
      return { heroTop: Math.round(hero.top), bg: getComputedStyle(nav.querySelector('.navbar-bg')).display, backInPhoto: back.top >= hero.top && back.bottom <= hero.bottom };
    });
    if (t.heroTop !== 0) throw new Error(`photo starts ${t.heroTop}px down, not at the top`);
    if (t.bg !== 'none') throw new Error('the top bar still has a background');
    if (!t.backInPhoto) throw new Error('back button is not over the photo');
  });
  // issue #6: amounts that convert are underlined (a fitted grey line; notes look different); tapping one opens a
  // bottom sheet with radio options (24-*); picking one replaces the amount, and the
  // Original option puts it back
  await step('22-unit-underline', async () => {
    await page.locator('.page-current .ck-scale-button').tap(); await page.waitForTimeout(700);
    await page.locator('.sheet-modal.modal-in .ck-chip', { hasText: '×2' }).tap(); await page.waitForTimeout(300);
    await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).first().tap(); await page.waitForTimeout(700);
    const row = page.locator('.page-current .ck-ing-list li', { hasText: 'lemon juice' });
    await row.scrollIntoViewIfNeeded();
    const t = await page.evaluate(() => {
      const li = [...document.querySelectorAll('.page-current .ck-ing-list li')];
      const juice = li.find((l) => l.textContent.includes('lemon juice')).querySelector('.ck-convertible');
      const garlic = li.find((l) => l.textContent.includes('garlic'));
      const b = juice.getBoundingClientRect(); const title = juice.closest('.item-title').getBoundingClientRect();
      return { text: juice.textContent, line: getComputedStyle(juice).textDecorationLine, fitted: b.width < title.width / 2, garlicPlain: !garlic.querySelector('.ck-convertible'), footer: !!juice.closest('li').querySelector('.item-footer')?.textContent.includes('=') };
    });
    if (t.text !== '4 tbsp') throw new Error(`lemon juice amount reads "${t.text}"`);
    if (!t.line.includes('underline') || !t.fitted) throw new Error('convertible amount is not a fitted underline');
    if (!t.garlicPlain) throw new Error('"cloves" should not be underlined: it does not convert');
    if (t.footer) throw new Error('a conversion still shows in the note line');
  });
  // issue #6, the unit sheet: out from under the thumb, the page not dimmed, the tapped ingredient
  // kept in view above it; picking closes it and replaces the amount; in cook mode it opens over cook mode
  await step('24-unit-sheet', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelector('.page-current .page-content').scrollTo(0, 700)); await page.waitForTimeout(400);
    await page.locator('.page-current .ck-ing-list li', { hasText: 'kosher salt' }).locator('.ck-convertible').tap(); await page.waitForTimeout(1000);
    const t = await page.evaluate(() => {
      const sh = document.querySelector('.sheet-modal.modal-in.ck-unit-sheet'); const r = sh?.getBoundingClientRect();
      const row = document.querySelector('.page-current li.ck-ing-on')?.getBoundingClientRect();
      return { sheet: !!sh, title: sh?.querySelector('.toolbar b')?.textContent, rowAbove: row && r && row.bottom <= r.top, dimmed: !!document.querySelector('.sheet-backdrop.backdrop-in'), popover: !!document.querySelector('.popover.modal-in'), radios: sh?.querySelectorAll('input[type=radio]').length };
    });
    if (!t.sheet || t.popover) throw new Error('tapping an amount did not open the bottom sheet');
    if (t.title !== 'Kosher salt') throw new Error(`sheet title reads "${t.title}"`);
    if (!t.rowAbove) throw new Error('the tapped ingredient is hidden behind the sheet');
    if (t.dimmed) throw new Error('the page is dimmed behind the sheet');
    if (t.radios !== 3) throw new Error(`the sheet has ${t.radios} options, expected 3 (1½ tsp, ½ tbsp, 7.4 ml)`);
  });
  await step('24b-unit-sheet-picked', async () => {
    await page.locator('.sheet-modal.modal-in li', { hasText: 'tbsp' }).tap(); await page.waitForTimeout(800);
    if (await page.locator('.sheet-modal.modal-in.ck-unit-sheet').count()) throw new Error('the sheet stayed open after picking');
    const text = await page.locator('.page-current .ck-ing-list li', { hasText: 'kosher salt' }).locator('.ck-convertible').textContent();
    if (text !== '½ tbsp') throw new Error(`after picking ½ tbsp the amount reads "${text}"`);
  });
  // tapping another amount switches the sheet to it; tapping the highlighted one again closes it (toggles it off)
  await step('24b2-unit-sheet-toggle', async () => {
    const salt = page.locator('.page-current .ck-ing-list li', { hasText: 'kosher salt' }).locator('.ck-convertible');
    const pepper = page.locator('.page-current .ck-ing-list li', { hasText: 'black pepper' }).locator('.ck-convertible');
    await salt.tap(); await page.waitForTimeout(900);
    const picked = await page.locator('.sheet-modal.modal-in input[type=radio]:checked').evaluate((e) => e.closest('li').textContent);
    if (!picked.includes('½ tbsp')) throw new Error(`reopened sheet has "${picked}" picked, not ½ tbsp`);
    await pepper.tap(); await page.waitForTimeout(700);
    const title = await page.locator('.sheet-modal.modal-in.ck-unit-sheet .toolbar b').textContent().catch(() => null);
    if (title !== 'Black pepper') throw new Error(`tapping another amount should switch the sheet to it (title "${title}")`);
    await pepper.tap(); await page.waitForTimeout(800);
    if (await page.locator('.sheet-modal.modal-in.ck-unit-sheet').count()) throw new Error('tapping the highlighted amount again did not close the sheet');
    if (await page.locator('.page-current li.ck-ing-on').count()) throw new Error('the ingredient stayed highlighted after closing');
  });
  await step('24b3-unit-sheet-original', async () => {
    const salt = page.locator('.page-current .ck-ing-list li', { hasText: 'kosher salt' }).locator('.ck-convertible');
    await salt.tap(); await page.waitForTimeout(900);
    await page.locator('.sheet-modal.modal-in li', { hasText: 'Original' }).tap(); await page.waitForTimeout(800);
    const text = await salt.textContent();
    if (text !== '1 1/2 tsp') throw new Error(`after Original the amount reads "${text}"`);
  });
  await step('24c-cook-unit-sheet', async () => {
    await page.locator('.page-current .ck-cta-button').tap(); await page.waitForTimeout(1200);
    // opening the sheet must not move cook mode's divider (it once padded the split screen and squeezed the halves)
    const divider = () => page.evaluate(() => Math.round(document.querySelector('.ck-split-handle').getBoundingClientRect().top));
    const before = await divider();
    await page.locator('.ck-cook .ck-cook-list li', { hasText: 'lemon juice' }).locator('.ck-convertible').tap(); await page.waitForTimeout(1000);
    const after = await divider();
    if (after !== before) throw new Error(`opening the unit sheet moved the divider from ${before}px to ${after}px`);
    const t = await page.evaluate(() => {
      const sh = document.querySelector('.sheet-modal.modal-in.ck-unit-sheet'); const r = sh?.getBoundingClientRect();
      const hit = sh && document.elementFromPoint(r.left + r.width / 2, r.top + 30);
      const li = [...document.querySelectorAll('.ck-cook .ck-cook-list li')].find((l) => l.textContent.includes('lemon juice'));
      return { onTop: !!hit?.closest('.sheet-modal'), ticked: li.querySelector('input').checked };
    });
    if (!t.onTop) throw new Error('the unit sheet is not shown over cook mode');
    if (t.ticked) throw new Error('tapping the amount ticked the ingredient');
    await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(700);
    await page.locator('.ck-cook .navbar a').first().tap(); await page.waitForTimeout(1000);
  });

  // issue #11: an ingredient made from another recipe (the demo kebabs use the Tahini Sauce recipe): its name is a link
  // that opens that recipe; in cook mode it opens the sauce's own cook mode over the kebabs' one, without ticking the row
  await step('25-linked-ingredient', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    const link = page.locator('.page-current .ck-ing-list li', { hasText: 'tahini sauce' }).locator('.ck-ing-linked');
    await link.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const color = await link.evaluate((e) => getComputedStyle(e).color);
    if (color !== 'rgb(196, 66, 28)') throw new Error(`the linked name is ${color}, not Tomato ink`);
    if (await page.locator('.page-current .ck-ing-list .ck-ing-linked').count() !== 1) throw new Error('only the tahini sauce row should be a link');
  });
  await step('25b-linked-recipe-opened', async () => {
    await page.locator('.page-current .ck-ing-list .ck-ing-linked').tap(); await page.waitForTimeout(1200);
    const title = await page.locator('.page-current .ck-recipe-title').textContent();
    if (title !== 'Tahini Sauce') throw new Error(`tapping the linked ingredient opened "${title}"`);
  });
  // the sauce opens in a tab, not a layer: one cook mode, the top bar becomes a grey strip of recipe tabs in place of
  // the title (running up under the status bar, and Safari's strip turns grey too), and switching tabs keeps each
  // recipe's ticks
  await step('25c-cook-linked', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.page-current .ck-cta-button').tap(); await page.waitForTimeout(1200);
    const row = page.locator('.ck-cook .tab-active .ck-pane-ingredients li', { hasText: 'tahini sauce' });
    await row.scrollIntoViewIfNeeded();
    await row.locator('.ck-ing-linked').tap(); await page.waitForTimeout(800);
    const t = await page.evaluate(() => {
      const cook = document.querySelector('.popup.ck-cook.modal-in');
      const nav = cook.querySelector('.navbar'); const bar = nav.getBoundingClientRect();
      const shown = [...cook.querySelectorAll('.ck-cook-tabs > .tab')].filter((x) => getComputedStyle(x).display !== 'none');
      const li = [...cook.querySelectorAll('.ck-cook-tabs > .tab')][0].querySelector('.ck-pane-ingredients li:has(.ck-ing-linked)');
      const on = nav.querySelector('.ck-tab-on'); const onBox = on?.getBoundingClientRect();
      const first = shown[0]?.querySelector('.ck-pane-head')?.getBoundingClientRect();
      const soft = getComputedStyle(document.documentElement).getPropertyValue('--ck-soft').trim();
      return {
        popups: document.querySelectorAll('.popup.modal-in').length, behind: !!document.querySelector('.popup-behind'), shown: shown.length,
        title: on?.textContent, tabs: [...nav.querySelectorAll('.ck-tab')].map((c) => c.textContent), repeated: !!nav.querySelector('.title'),
        barTop: bar.top, barBg: getComputedStyle(nav.querySelector('.navbar-bg'), '::after').backgroundColor,
        joined: !!on && getComputedStyle(on).backgroundColor === getComputedStyle(cook.querySelector('.page')).backgroundColor && Math.abs(onBox.bottom - bar.bottom) < 1,
        clear: !!first && first.top >= bar.bottom, ticked: li.querySelector('input').checked,
        theme: document.querySelector('meta[name="theme-color"][media*="light"]').content === soft,
        thumbs: [...nav.querySelectorAll('.ck-tab')].map((c) => { const th = c.querySelector('.ck-tab-thumb'); return !!th && (getComputedStyle(th).backgroundImage !== 'none' || !!th.querySelector('svg')); }),
        fade: getComputedStyle(shown[0].querySelector('.ck-pane-ingredients')).webkitMaskImage || getComputedStyle(shown[0].querySelector('.ck-pane-ingredients')).maskImage,
      };
    });
    if (t.popups !== 1 || t.behind) throw new Error(`the sauce opened as a layer (${t.popups} popups open)`);
    if (t.shown !== 1 || t.title !== 'Tahini Sauce') throw new Error(`the shown tab is "${t.title}" (${t.shown} recipes displayed)`);
    if (t.tabs.length !== 2 || !t.tabs[0].includes('Kebabs')) throw new Error(`the recipe tabs read ${JSON.stringify(t.tabs)}`);
    if (t.repeated) throw new Error('the recipe title still shows above its tab');
    if (t.barTop !== 0 || t.barBg !== 'rgb(236, 236, 238)') throw new Error(`the tab bar starts at ${t.barTop}px in ${t.barBg}, not grey from the top`);
    if (!t.theme) throw new Error('the status bar strip (theme colour) is not the tab strip grey');
    if (t.thumbs.length !== 2 || !t.thumbs.every(Boolean)) throw new Error('every recipe tab should show its photo (or the chef hat)');
    if (!String(t.fade).includes('gradient')) throw new Error('ingredients scrolling under the top bar do not fade');
    if (!t.joined) throw new Error("the shown tab isn't joined to the page in the page colour");
    if (!t.clear) throw new Error('the tabs cover the Ingredients heading');
    if (t.ticked) throw new Error('tapping the linked name ticked the ingredient');
  });
  await step('25d-cook-linked-units', async () => {
    // the sauce's unit sheet opens over cook mode
    await page.locator('.ck-cook .tab-active .ck-pane-ingredients li', { hasText: 'lemon juice' }).locator('.ck-convertible').tap(); await page.waitForTimeout(1000);
    const t = await page.evaluate(() => {
      const sh = document.querySelector('.sheet-modal.modal-in.ck-unit-sheet'); const r = sh?.getBoundingClientRect();
      const hit = sh && document.elementFromPoint(r.left + r.width / 2, r.top + 30);
      return { title: sh?.querySelector('.toolbar b')?.textContent, onTop: !!hit?.closest('.sheet-modal') };
    });
    if (t.title !== 'Lemon juice' || !t.onTop) throw new Error('the unit sheet is not shown over the sauce');
    await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(700);
  });
  await step('25d2-cook-switch-tabs', async () => {
    const tab = page.locator('.ck-cook .tab-active');
    await tab.locator('.ck-pane-ingredients li', { hasText: 'ice water' }).locator('label').tap({ position: { x: 330, y: 12 } }); await page.waitForTimeout(400);
    await tab.locator('.ck-pane-steps li:has(label)').first().locator('label').tap({ position: { x: 330, y: 12 } }); await page.waitForTimeout(600);
    await page.locator('.ck-cook .navbar .ck-tab', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(500);
    const on = await page.locator('.ck-cook .ck-tab-on').textContent();
    if (!on.includes('Kebabs')) throw new Error(`the Kebabs tab shows "${on}"`);
    if (await page.locator('.ck-cook .tab-active .ck-pane-ingredients li.ck-done').count()) throw new Error('the sauce’s ticks show in the kebabs');
  });
  await step('25d3-cook-progress-kept', async () => {
    await page.locator('.ck-cook .navbar .ck-tab', { hasText: 'Tahini Sauce' }).tap(); await page.waitForTimeout(500);
    const tab = page.locator('.ck-cook .tab-active');
    const ing = await tab.locator('.ck-pane-ingredients li.ck-done').allTextContents();
    const steps = await tab.locator('.ck-pane-steps li.ck-done').count();
    if (ing.length !== 1 || !ing[0].includes('ice water') || steps !== 1) throw new Error(`back on the sauce, ${ing.length} ingredients and ${steps} steps are ticked, expected the ice water and step 1`);
    // X closes only the shown recipe's tab: back to the kebabs alone, with the usual title bar
    await page.locator('.ck-cook .navbar .left a').first().tap(); await page.waitForTimeout(800);
    if (!(await page.locator('.popup.ck-cook.modal-in').count())) throw new Error('X closed cook mode instead of the sauce’s tab');
    const title = await page.locator('.ck-cook .navbar .title').textContent().catch(() => '');
    if (!title.includes('Kebabs') || (await page.locator('.ck-cook .ck-tab').count())) throw new Error(`after closing the sauce's tab the bar shows "${title}" and ${await page.locator('.ck-cook .ck-tab').count()} tabs`);
    // opening the sauce again picks up where it was
    await page.locator('.ck-cook .tab-active .ck-pane-ingredients .ck-ing-linked', { hasText: 'tahini sauce' }).tap(); await page.waitForTimeout(700);
    const again = await page.locator('.ck-cook .tab-active .ck-pane-ingredients li.ck-done').count();
    if (again !== 1) throw new Error(`the reopened sauce has ${again} ingredients ticked, expected the ice water`);
    // closing every tab leaves cook mode, and Safari's strip goes back to the page colour
    await page.locator('.ck-cook .navbar .left a').first().tap(); await page.waitForTimeout(800);
    await page.locator('.ck-cook .navbar .left a').first().tap(); await page.waitForTimeout(1200);
    if (await page.locator('.popup.ck-cook.modal-in').count()) throw new Error('closing the last tab did not leave cook mode');
    const theme = await page.evaluate(() => document.querySelector('meta[name="theme-color"][media*="light"]').content);
    if (theme !== '#f7f7f8') throw new Error(`the theme colour stayed ${theme} after cook mode closed`);
  });
  // the editor: a linked row reads "Recipe: …" under it; the ingredient sheet's Recipe row opens a searchable list of
  // recipes stacked over the page and the sheet (Framework7 popup push) to link one; a pasted line named like a recipe
  // links itself
  await step('25e-edit-linked', async () => {
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap(); await page.waitForTimeout(1200);
    const footer = await page.locator('.page-current .ck-edit-list li', { hasText: 'tahini sauce' }).locator('.item-footer').textContent();
    if (!footer.includes('Recipe: Tahini Sauce')) throw new Error(`the linked row's footer reads "${footer}"`);
    await page.locator('.page-current .ck-edit-list li', { hasText: 'warm pitas' }).locator('.item-link').first().tap(); await page.waitForTimeout(900);
    const after = await page.locator('.sheet-modal.modal-in .ck-link-field .item-after').textContent();
    if (after !== 'None') throw new Error(`an unlinked ingredient's Recipe row reads "${after}"`);
  });
  await step('25f-link-picker', async () => {
    await page.locator('.sheet-modal.modal-in .ck-link-field .item-link').tap(); await page.waitForTimeout(1200);
    const t = await page.evaluate(() => {
      const p = document.querySelector('.popup.ck-link-popup.modal-in'); const r = p?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { open: !!p, onTop: !!hit && p.contains(hit), search: !!p?.querySelector('.searchbar'), self: [...(p?.querySelectorAll('li') ?? [])].some((l) => l.textContent.includes('Kebabs')), sheet: !!document.querySelector('.sheet-modal.modal-in') };
    });
    if (!t.open || !t.onTop) throw new Error('the recipe list is not shown on top');
    if (!t.sheet) throw new Error('the ingredient sheet closed instead of staying behind the recipe list');
    if (!t.search) throw new Error('the recipe list has no search');
    if (t.self) throw new Error('a recipe can be linked to itself');
  });
  await step('25f2-link-search', async () => {
    await page.locator('.popup.ck-link-popup.modal-in .searchbar input').fill('corn'); await page.waitForTimeout(600);
    const shown = await page.locator('.popup.ck-link-popup.modal-in .ck-link-list li:visible').allTextContents();
    if (shown.length !== 1 || !shown[0].includes('Corn pudding')) throw new Error(`searching "corn" shows ${JSON.stringify(shown)}`);
  });
  await step('25g-linked-picked', async () => {
    await page.locator('.popup.ck-link-popup.modal-in li', { hasText: 'Corn pudding' }).tap(); await page.waitForTimeout(1400);
    if (await page.locator('.popup.ck-link-popup.modal-in').count()) throw new Error('the recipe list stayed open after picking');
    const after = await page.locator('.sheet-modal.modal-in .ck-link-field .item-after').textContent().catch(() => '(no sheet)');
    if (after !== 'Corn pudding') throw new Error(`after picking, the ingredient sheet's Recipe row reads "${after}"`);
    const footer = await page.locator('.page-current .ck-edit-list li', { hasText: 'warm pitas' }).locator('.item-footer').textContent().catch(() => '');
    if (!footer.includes('Recipe: Corn pudding')) throw new Error(`the row behind the sheet reads "${footer}"`);
    await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(800);
    await page.locator('.page-current textarea').first().fill('1 cup tahini sauce'); await page.waitForTimeout(300);
    await page.locator('.page-current .button', { hasText: 'Add 1 line' }).tap(); await page.waitForTimeout(500);
    const pasted = await page.locator('.page-current .ck-edit-list li', { hasText: '1 cup tahini sauce' }).locator('.item-footer').textContent().catch(() => '');
    if (!pasted.includes('Recipe: Tahini Sauce')) throw new Error('a pasted "tahini sauce" line did not link to the Tahini Sauce recipe');
  });
  // link two more of the kebabs' ingredients and save, for cook mode with five recipes open (25i)
  await step('25g2-more-links-saved', async () => {
    const link = async (row, title) => {
      await row.locator('.item-link').first().tap(); await page.waitForTimeout(900);
      await page.locator('.sheet-modal.modal-in .ck-link-field .item-link').tap(); await page.waitForTimeout(1200);
      await page.locator('.popup.ck-link-popup.modal-in li', { hasText: title }).tap(); await page.waitForTimeout(1200);
      await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(800);
    };
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap(); await page.waitForTimeout(1200);
    await link(page.locator('.page-current .ck-edit-list li', { hasText: 'warm pitas' }), 'Corn pudding');
    await link(page.locator('.page-current .ck-edit-list li', { hasText: 'fresh parsley' }), 'Mustard Dill');
    await link(page.locator('.page-current .ck-edit-list li').filter({ hasText: /^1 lemon/ }), 'Pulled Beef');
    await page.locator('.navbar .ck-nav-primary:visible').tap(); await page.waitForTimeout(1200);
    const linked = await page.locator('.page-current .ck-ing-list .ck-ing-linked').count();
    if (linked !== 4) throw new Error(`after saving, the kebabs have ${linked} linked ingredients, expected 4`);
  });
  // more recipes than fit: the tabs keep a readable width and the row scrolls sideways with a swipe; the shown tab
  // scrolls into view
  await step('25i-cook-many-tabs', async () => {
    // straight from the kebabs page the save returned to (reloading would reset the demo's recipes)
    await page.locator('.page-current .ck-cta-button').tap(); await page.waitForTimeout(1200);
    for (const name of ['tahini sauce', 'warm pitas', 'fresh parsley', 'lemon']) {
      const main = page.locator('.ck-cook .navbar .ck-tab', { hasText: 'Middle' });
      if (await main.count()) { await main.tap(); await page.waitForTimeout(500); }
      await page.locator('.ck-cook .tab-active .ck-pane-ingredients .ck-ing-linked', { hasText: new RegExp(`^${name}$`) }).scrollIntoViewIfNeeded();
      await page.locator('.ck-cook .tab-active .ck-pane-ingredients .ck-ing-linked', { hasText: new RegExp(`^${name}$`) }).tap(); await page.waitForTimeout(700);
    }
    const t = await page.evaluate(() => {
      const row = document.querySelector('.ck-cook .ck-tabs'); const r = row.getBoundingClientRect();
      const on = row.querySelector('.ck-tab-on').getBoundingClientRect();
      return { tabs: row.querySelectorAll('.ck-tab').length, scrolls: row.scrollWidth > row.clientWidth + 1, onText: row.querySelector('.ck-tab-on').textContent,
        inView: on.left >= r.left - 1 && on.right <= r.right + 1, narrowest: Math.min(...[...row.querySelectorAll('.ck-tab')].map((x) => x.getBoundingClientRect().width)) };
    });
    if (t.tabs !== 5) throw new Error(`${t.tabs} recipe tabs, expected 5`);
    if (!t.scrolls) throw new Error('five tabs squeeze into the bar instead of scrolling');
    if (t.narrowest < 95) throw new Error(`a tab is only ${Math.round(t.narrowest)}px wide`);
    if (!t.onText.includes('Pulled Beef') || !t.inView) throw new Error(`the tab just opened (${t.onText}) is not scrolled into view`);
  });
  await step('25i2-cook-tabs-swiped', async () => {
    const row = page.locator('.ck-cook .ck-tabs');
    const before = await row.evaluate((e) => e.scrollLeft);
    const box = await row.boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const x = box.x + box.width * 0.3, y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 15 * i, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(800);
    const after = await row.evaluate((e) => e.scrollLeft);
    if (!(after < before - 50)) throw new Error(`swiping the tabs moved them from ${before}px to ${after}px`);
    // X closes just the shown tab (Pulled Beef), showing the one before it
    await page.locator('.ck-cook .navbar .left a').first().tap(); await page.waitForTimeout(800);
    const left = await page.locator('.ck-cook .ck-tab').allTextContents();
    const on = await page.locator('.ck-cook .ck-tab-on').textContent();
    if (left.length !== 4 || left.some((x) => x.includes('Pulled')) || !on.includes('Mustard')) throw new Error(`after X the tabs are ${JSON.stringify(left)}, showing "${on}"`);
  });
  await step('25h-delete-used-recipe', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.page-current .ck-card', { hasText: 'Tahini Sauce' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Delete Recipe' }).tap(); await page.waitForTimeout(700);
    const text = await page.locator('.dialog.modal-in .dialog-text').textContent();
    if (!text.includes('ingredient in “Middle Eastern Chicken Kebabs”')) throw new Error(`the delete question reads "${text}"`);
    await page.locator('.dialog.modal-in .dialog-button', { hasText: 'Cancel' }).tap(); await page.waitForTimeout(500);
  });

  // the sign-in screen (the live site shows it until signed in with Google; the demo shows it with ?signin)
  await step('19-sign-in', async () => {
    await page.goto(`${BASE}?signin`);
    await page.waitForTimeout(1200);
    if (!(await page.locator('.login-screen.modal-in .ck-signin-button').isVisible())) throw new Error('sign-in screen not shown');
    // one grey page, not a white band behind the content (Framework7 paints login screen content white)
    const bgs = await page.evaluate(() => [...new Set([...document.querySelectorAll('.login-screen, .login-screen .page, .login-screen .page-content')].map((e) => getComputedStyle(e).backgroundColor).filter((c) => c !== 'rgba(0, 0, 0, 0)'))]);
    if (bgs.length !== 1) throw new Error(`sign-in screen has ${bgs.length} background colours: ${bgs.join(', ')}`);
  });
  await step('19b-signed-in', async () => {
    await page.locator('.ck-signin-button').tap();
    await page.waitForTimeout(900);
    if (await page.locator('.login-screen.modal-in').count()) throw new Error('sign-in screen still open after signing in');
    if (!(await page.locator('.page-current .ck-card').count())) throw new Error('no recipes after signing in');
  });

  if (errors.length) {
    console.log(`✗ page errors:\n    ${errors.join('\n    ')}`);
    total += errors.length;
  }
  await browser.close();
  console.log(total ? `\n${total} issue(s). Screenshots: ui-states/` : '\nNo issues. Screenshots: ui-states/');
  process.exit(total ? 2 : 0);
})();
