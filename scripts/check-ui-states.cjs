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
    // below AA on purpose (DESIGN.md): ticked rows in cook mode and on the grocery list fade (--ck-done-ink), a sheet's
    // Add or Next with nothing to add is greyed out (inactive, which WCAG doesn't count), and the orange buttons' 600-weight
    // white label on bright Tomato (3.7:1, the user's choice in issue #21; also today's filled date in the Planner). Loading placeholders (issue #35) are grey bars
    // drawn with a font, not text to read. Everything else must pass.
    const r = await window.axe.run({ include: [document], exclude: [['.skeleton-text'], ['.ck-cook li.ck-done'], ['.ck-grocery-list li.ck-done'], ['.toolbar .link.disabled'], ['.button.ck-main'], ['.button.ck-cta-button'], ['.link.ck-nav-primary'], ['.ck-week-selected.ck-week-today .ck-week-num'], ['.ck-calendar .calendar-day-today.calendar-day-selected'], ['.dialog .button.button-fill']] }, { runOnly: ['color-contrast'], resultTypes: ['violations'] });
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
        // a cookbook's plates overlap by design (Edit Cover's are buttons, issue #80; the middle one is on top)
        if (a.closest('.ck-plates') && b.closest('.ck-plates')) continue;
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
    const scopes = [...document.querySelectorAll('.view.tab-active .page-current .page-content, .sheet-modal.modal-in, .popup.modal-in .page-content, .actions-modal.modal-in')];
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
    [...document.querySelectorAll('.view.tab-active .page-current .page-content *')]
      .filter((el) => getComputedStyle(el).position === 'sticky' && !el.closest('.navbar, .toolbar, .searchbar'))
      .map((el) => `.${String(el.className).trim().split(/\s+/).join('.')} "${el.textContent.trim().slice(0, 18)}"`),
  );
  const rhythm = await page.evaluate(() => {
    const scope = document.querySelector('.view.tab-active .page-current .page-content');
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
    [...document.querySelectorAll('.dialog.modal-in .dialog-button, .actions-modal.modal-in .actions-button, .view.tab-active .page-current .button')]
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
  // Edges (DESIGN.md, issue #55). A popup's header buttons (round, pill) sit as far from its top as from its sides. A
  // sheet keeps 24px from its edges (--ck-sheet-inset): its header text 24px from the top and the sides, and its content
  // lined up with the header (nothing further out, the outermost content on the same lines). Buttons are measured by
  // their edges, text by its line box.
  const edges = await page.evaluate(() => {
    const textBox = (el) => {
      let box = null;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const x of r.getClientRects()) box = box ? { left: Math.min(box.left, x.left), right: Math.max(box.right, x.right), top: Math.min(box.top, x.top) } : { left: x.left, right: x.right, top: x.top };
      }
      return box;
    };
    const out = [];
    // only the container on top: a popup slid up over a sheet pushes the sheet back (scaled), and a dialog covers both
    if (document.querySelector('.dialog.modal-in')) return out;
    const pushed = document.querySelector('.popup.popup-push.modal-in');
    for (const c of pushed ? [pushed] : document.querySelectorAll('.sheet-modal.modal-in')) {
      const edge = c.getBoundingClientRect();
      const items = c.classList.contains('popup')
        ? [...c.querySelectorAll(':scope .page-current > .navbar .left .link, :scope .page-current > .navbar .right .link, :scope > .view > .page > .navbar .left .link, :scope > .view > .page > .navbar .right .link, :scope > .page > .navbar .left .link, :scope > .page > .navbar .right .link')].map((a) => a.getBoundingClientRect())
        : [...c.querySelectorAll(':scope > .toolbar .left, :scope > .toolbar .right, :scope .sheet-modal-inner > .toolbar .left, :scope .sheet-modal-inner > .toolbar .right, :scope .calendar-header')].map(textBox);
      const shown = items.filter((r) => r && r.right > r.left);
      if (!shown.length) continue;
      const first = shown.reduce((a, b) => (b.left < a.left ? b : a));
      const last = shown.reduce((a, b) => (b.right > a.right ? b : a));
      const top = Math.round(Math.min(...shown.map((r) => r.top)) - edge.top);
      const left = Math.round(first.left - edge.left), right = Math.round(edge.right - last.right);
      // a header scrolled out of its sheet (Chromium scrolls the scale sheet when the What I have dialog's field takes focus)
      if (top < 0) continue;
      // a side counts only when something sits at it (a header with only a right-hand button has nothing on the left)
      const mid = edge.left + edge.width / 2;
      const sides = [first.left < mid ? left : null, last.right > mid ? right : null].filter((x) => x !== null);
      if (c.classList.contains('popup')) {
        if (sides.some((x) => Math.abs(top - x) > 2)) out.push(`popup header buttons are ${top}px from the top but ${left}px / ${right}px from the sides`);
      } else {
        if (sides.some((x) => Math.abs(x - 24) > 2)) out.push(`sheet header text is ${left}px / ${right}px from the sides, not 24px`);
        if (Math.abs(top - 24) > 3) out.push(`sheet header text starts ${top}px from the top, not 24px`);
        // the content: fields, cards, segmented controls, chips, text blocks, swatches, day circles
        // (boxes with a shape by their edges; text blocks and labels by their glyphs, since a block's box spans the sheet)
        const seen = (el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
        const shapes = [...c.querySelectorAll('.page-content .item-input-wrap, .page-content .list.inset ul, .page-content .segmented, .page-content .chip, .page-content .stepper, .ck-unit-sheet-list ul, .ck-swatch, .calendar-month-current .calendar-day-number')]
          .filter(seen).map((el) => el.getBoundingClientRect());
        const texts = [...c.querySelectorAll('.page-content .block, .page-content .item-label, .page-content .list:not(.ck-link-field) .item-title')].filter(seen).map(textBox).filter(Boolean);
        const content = [...shapes, ...texts].filter((r) => r.right - r.left > 4 && (r.bottom ?? innerHeight) > edge.top && r.top < innerHeight);
        if (content.length) {
          const cl = Math.round(Math.min(...content.map((r) => r.left)) - edge.left), cr = Math.round(edge.right - Math.max(...content.map((r) => r.right)));
          if (Math.abs(cl - 24) > 2 || Math.abs(cr - 24) > 2) out.push(`sheet content reaches ${cl}px / ${cr}px from the sides, not the header's 24px`);
        }
      }
    }
    return out;
  });
  const issues = [
    ...edges.map((e) => `edge inset: ${e}`),
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
  // to the middle of the screen: "in view" can still be under the tab bar
  await locator.evaluate((e) => { const r = e.getBoundingClientRect(); if (r.top < 120 || r.bottom > innerHeight - 140) e.scrollIntoView({ block: 'center' }); });
  await page.waitForTimeout(300);
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
  // cook mode's X closes the shown recipe (the last one ends cooking); the chevron only tucks it away (issue #85)
  const cookClose = async () => {
    await page.locator('.ck-cook .navbar a[aria-label^="Close"]').tap(); await page.waitForTimeout(1000);
  };
  // end cooking: X on every recipe (Not now to Mark as made), or the next page load comes back into cook mode
  const cookEnd = async () => {
    for (let i = 0; i < 8 && (await page.locator('.popup.ck-cook.modal-in').count()); i++) {
      await cookClose();
      await page.locator('.dialog.modal-in .dialog-button', { hasText: 'Not now' }).tap({ timeout: 500 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  };
  const step = async (name, fn) => {
    try {
      await fn();
      total += await audit(page, name);
    } catch (e) {
      total += 1;
      console.log(`✗ ${name}: could not reach this state (${e.message.split('\n')[0]})`);
      await page.screenshot({ path: path.join(OUT, `${name}-failed.png`) }).catch(() => {});
    }
  };

  await page.goto(BASE);
  await page.waitForTimeout(1000);
  await step('01-recipes', async () => {});
  // No backdrop blur on the bars that stay on screen (#25): iPhone Safari left those layers blank, so the header, its
  // buttons and the search field vanished a moment after the app opened
  // issue #27: the plus is the main action, a filled Tomato button with a white icon; Sort stays a soft grey one
  await step('01-plus-primary', async () => {
    const c = await page.evaluate(() => {
      const st = (sel) => { const e = document.querySelector(sel); return e && [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]; };
      return { plus: st('#view-recipes .navbar a[aria-label="New recipe"]'), sort: st('#view-recipes .navbar a[aria-label="Sort recipes"]') };
    });
    if (c.plus?.join() !== 'rgb(228, 87, 46),rgb(255, 255, 255)') throw new Error(`the plus is ${JSON.stringify(c.plus)}, not filled Tomato with a white icon`);
    if (c.sort?.[0] === 'rgb(228, 87, 46)') throw new Error('Sort is filled Tomato too');
  });
  await step('01a-no-blur-on-bars', async () => {
    const blurred = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.navbar, .navbar *, .toolbar, .toolbar *, .searchbar, .searchbar *')];
      return els.flatMap((el) => [null, '::before', '::after'].map((pseudo) => {
        const cs = getComputedStyle(el, pseudo);
        const bf = cs.backdropFilter || cs.webkitBackdropFilter;
        return bf && bf !== 'none' ? `${el.className}${pseudo ?? ''}: ${bf}` : null;
      })).filter(Boolean);
    });
    if (blurred.length) throw new Error(`still blurred: ${[...new Set(blurred)].slice(0, 5).join(' | ')}`);
  });
  // the search bar must filter the grid on screen (it once kept filtering a copy React had replaced when loading ended)
  await step('01b-recipes-search', async () => {
    const input = page.locator('.view.tab-active .page-current .ck-search-bar input');
    await input.fill('chick'); await page.waitForTimeout(600);
    const shown = await page.locator('.view.tab-active .page-current .ck-card-grid .ck-card:visible .ck-card-title').allTextContents();
    if (!shown.length || shown.some((t) => !/chick/i.test(t))) throw new Error(`searching "chick" shows ${JSON.stringify(shown)}`);
    // no grey overlay while searching (the user asked for none): the page stays as it is, chips included
    if (await page.locator('.searchbar-backdrop').count()) throw new Error('searching puts an overlay over the page');
    // the count says how many match out of how many: "2 of 6 recipes"
    const total = await page.locator('.view.tab-active .page-current .ck-card-grid .ck-card').count();
    const countText = await page.locator('.view.tab-active .page-current .ck-count').textContent();
    if (!countText.includes(`${shown.length} of `) || total !== shown.length) throw new Error(`while searching, the count reads "${countText}" for ${shown.length} cards shown`);
    await page.screenshot({ path: path.join(OUT, '01b-recipes-searching.png') });
    const chip = await page.locator('.view.tab-active .page-current .ck-chip').first().boundingBox();
    const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.ck-chip'), { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 });
    if (!onTop) throw new Error('something covers the chips while searching');
    await input.fill('zzzz'); await page.waitForTimeout(600);
    if (!(await page.locator('.view.tab-active .page-current .ck-not-found:visible').count())) throw new Error('no "No recipes found" for a search with no match');
    await input.fill(''); await input.blur(); await page.waitForTimeout(600);
    const all = await page.locator('.view.tab-active .page-current .ck-card-grid .ck-card:visible').count();
    if (all <= shown.length) throw new Error('clearing the search didn\'t bring every recipe back');
  });
  // issue #63: the search bar and the chips stay under the title while the recipes scroll (Framework7's subnavbar),
  // flat and full width like the Planner's week strip, with nothing showing through them
  await step('01c-recipes-search-sticky', async () => {
    const at = () => page.evaluate(() => {
      const box = (sel) => { const e = document.querySelector(`.view.tab-active .page-current ${sel}`); const r = e?.getBoundingClientRect(); return r && [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; };
      return { search: box('.subnavbar .searchbar'), chips: box('.subnavbar .ck-chips'), bar: box('.subnavbar') };
    });
    const before = await at();
    if (!before.search || !before.chips) throw new Error('the search bar and chips are not in the bar under the title');
    if (before.bar[0] !== 0 || before.bar[2] !== 393) throw new Error(`the bar under the title is ${before.bar[2]}px wide at ${before.bar[0]}, not docked full width`);
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 500));
    await page.waitForTimeout(400);
    const after = await at();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`scrolling moved the search bar or chips: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    const chip = await page.locator('.view.tab-active .page-current .subnavbar .ck-chip').first().boundingBox();
    const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.ck-chip'), { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 });
    if (!onTop) throw new Error('the recipes scroll over the chips');
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 0));
    await page.waitForTimeout(400);
    // scrolling down hides the title row (Framework7 hideNavbarOnScroll) and the search bar and chips move up to the
    // top, still showing; scrolling up brings the title row back (the user's ask on #63)
    const hidden = () => page.locator('.view.tab-active .page-current > .navbar').evaluate((n) => n.classList.contains('navbar-hidden'));
    await page.mouse.move(200, 450);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 60); await page.waitForTimeout(120); }
    await page.waitForTimeout(600);
    if (!(await hidden())) throw new Error('the title row did not hide on scrolling down');
    const up = await at();
    if (!(up.search[1] >= 0 && up.search[1] < before.search[1])) throw new Error(`with the title row hidden the search bar is at ${up.search[1]}px (was ${before.search[1]}px)`);
    const onScreen = await page.evaluate(() => { const s = document.querySelector('.view.tab-active .page-current .subnavbar .searchbar input'); const r = s.getBoundingClientRect(); return document.elementFromPoint(r.left + 40, r.top + r.height / 2) === s; });
    if (!onScreen) throw new Error('the search bar is covered with the title row hidden');
    await page.screenshot({ path: path.join(OUT, '01c2-recipes-title-hidden.png') });
    for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -40); await page.waitForTimeout(120); }
    await page.waitForTimeout(600);
    if (await hidden()) throw new Error('the title row did not come back on scrolling up');
    // the first content (the count line) starts below the bar, not under it
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 0));
    await page.waitForTimeout(300);
    const gap = await page.evaluate(() => {
      const p = document.querySelector('.view.tab-active .page-current');
      return Math.round(p.querySelector('.ck-count').getBoundingClientRect().top - p.querySelector('.subnavbar').getBoundingClientRect().bottom);
    });
    if (gap < 8) throw new Error(`the count line starts ${gap}px below the bar`);
  });
  // issue #99: at the top, the search bar sits flat on the page (no line or shadow); they show once the recipes scroll
  await step('01d-recipes-bar-edge-on-scroll', async () => {
    const edge = () => page.evaluate(() => {
      const bar = document.querySelector('.view.tab-active .page-current .subnavbar');
      return { shadow: getComputedStyle(bar).boxShadow, line: getComputedStyle(bar, '::after').backgroundColor };
    });
    const top = await edge();
    if (top.shadow !== 'none' || top.line !== 'rgba(0, 0, 0, 0)') throw new Error(`at the top the search bar has an edge: ${JSON.stringify(top)}`);
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 120));
    await page.waitForTimeout(800);
    const scrolled = await edge();
    if (scrolled.shadow === 'none' || scrolled.line !== 'rgb(201, 201, 206)') throw new Error(`scrolled, the search bar's edge is ${JSON.stringify(scrolled)}`);
    await page.screenshot({ path: path.join(OUT, '01d2-recipes-scrolled-edge.png') });
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 0));
    // Framework7 fades the bar's shadow
    await page.waitForTimeout(800);
    if ((await edge()).shadow !== 'none') throw new Error('back at the top, the search bar keeps its shadow');
  });
  await step('02-recipes-chip-selected', async () => { await page.locator('.ck-chip', { hasText: 'Dinner' }).first().tap(); });
  // R2: chips come from the tags in use; two picked offer "all" or "any" in the sort sheet; the filter is remembered
  await step('02b-recipes-two-tags-any', async () => {
    await page.locator('.ck-chip', { hasText: 'Quick' }).first().tap();
    await page.waitForTimeout(200);
    const all = await page.locator('.view.tab-active .page-current .ck-card').count();
    if (all !== 1) throw new Error(`Dinner + Quick (all tags) shows ${all} recipes, expected 1`);
    await page.locator('.view-main .navbar a[aria-label="Sort recipes"]').tap();
    await page.waitForTimeout(400);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Any of the tags' }).tap();
    await page.waitForTimeout(500);
    const any = await page.locator('.view.tab-active .page-current .ck-card').count();
    if (any !== 4) throw new Error(`Dinner or Quick (any tag) shows ${any} recipes, expected 4`);
  });
  await step('02c-filter-remembered', async () => {
    await page.reload();
    await page.waitForTimeout(1200);
    const on = await page.locator('.ck-chip.ck-chip-on').allTextContents();
    if (on.join(',') !== 'Dinner,Quick') throw new Error(`after reopening, the picked chips are ${on.join(',') || 'none'}`);
    const note = await page.locator('.view.tab-active .page-current .ck-count').textContent();
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
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Kebabs' }).tap();
    await page.waitForTimeout(900);
    await page.goBack();
    await page.waitForTimeout(900);
    if (!page.url().startsWith(BASE)) throw new Error(`back left the app for ${page.url()}`);
    const pages = await page.locator('#view-recipes > .page').count();
    if (pages !== 1 || !(await page.locator('#view-recipes .page-current .ck-card').count())) throw new Error('back did not return to Recipes');
  });

  await step('04-recipe-page', async () => { await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(900); });
  // scroll through the page: sticky or overlapping content only shows up mid-scroll
  for (const y of [300, 450, 600, 800, 1000]) {
    await step(`04-recipe-scroll-${y}`, async () => { await page.evaluate((top) => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, top), y); });
  }
  // the top bar hides while scrolling down and comes back on scroll up (Framework7 hideNavbarOnScroll)
  await step('04-recipe-bar-hidden', async () => {
    await page.mouse.move(200, 400);
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(120); }
    await page.waitForTimeout(500);
    if (!(await page.locator('.view.tab-active .page-current .navbar, .navbar-current').first().evaluate((n) => n.classList.contains('navbar-hidden')))) throw new Error('top bar did not hide on scroll down');
  });
  await step('04-recipe-bar-back', async () => {
    for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(120); }
    await page.waitForTimeout(500);
    if (await page.locator('.view.tab-active .page-current .navbar, .navbar-current').first().evaluate((n) => n.classList.contains('navbar-hidden'))) throw new Error('top bar did not come back on scroll up');
  });
  await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 0));
  await step('05-scale-sheet', async () => { await page.locator('.view.tab-active .page-current .ck-scale-button').tap(); await page.waitForTimeout(800); });
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
  await step('05d-recipe-scaled', async () => { await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 420)); });
  await step('06-recipe-bottom', async () => { await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 99999)); });
  await step('07-more-actions', async () => { await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Cancel' }).tap().catch(() => {});
  await page.waitForTimeout(500);

  // cook mode (Prepear layout: ingredients on top, directions below, drag handle between)
  await step('16-cook-open', async () => {
    await page.locator('.view.tab-active .page-current .ck-cta-button', { hasText: 'Start cooking' }).tap(); await page.waitForTimeout(900);
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
    await cookClose();
    if (!(await page.locator('.dialog.modal-in', { hasText: 'Mark as made' }).count())) throw new Error('no Mark as made prompt after ticking every step');
  });
  await page.locator('.dialog.modal-in .dialog-button', { hasText: 'Not now' }).tap().catch(() => {});
  await page.waitForTimeout(900);

  // ── photos: add one (opens Crop Photo), pan it, add two more at once, save; then swipe them and open the viewer ──
  const photoFile = (n) => path.resolve(__dirname, '..', 'public', 'photos', n);
  await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(500);
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap(); await page.waitForTimeout(900);
  await step('17-crop-photo', async () => {
    await page.locator('.view.tab-active .page-current input[type=file]').setInputFiles(photoFile('seafood-salad.jpg'));
    await page.waitForTimeout(1500);
    if (!(await page.locator('.ck-crop.modal-in .cropper-container').count())) throw new Error('picking one photo did not open Crop Photo');
    const f = await page.locator('.ck-crop .cropper-container').boundingBox();
    if (Math.abs(f.width / f.height - 4 / 3) > 0.02) throw new Error(`crop frame is not 4:3 (${Math.round(f.width)}×${Math.round(f.height)})`);
    await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2); await page.mouse.down();
    await page.mouse.move(f.x + f.width / 2 + 60, f.y + f.height / 2, { steps: 5 }); await page.mouse.up();
  });
  await step('17b-photos-added', async () => {
    await page.locator('.ck-crop a', { hasText: 'Done' }).tap(); await page.waitForTimeout(1200);
    await page.locator('.view.tab-active .page-current input[type=file]').setInputFiles([photoFile('corn.jpg'), photoFile('meatballs.jpg')]);
    await page.waitForTimeout(1500);
    if (await page.locator('.ck-crop.modal-in').count()) throw new Error('picking several photos opened Crop Photo');
    const n = await page.locator('.view.tab-active .page-current .ck-thumb:not(.ck-thumb-add)').count();
    if (n !== 4) throw new Error(`expected 4 photos, found ${n}`);
  });
  await page.locator('.view.tab-active .page-current .navbar a', { hasText: 'Save' }).tap(); await page.waitForTimeout(1000);
  await step('17c-recipe-photos-swiped', async () => {
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 0)); await page.waitForTimeout(400);
    const hero = await page.locator('.view.tab-active .page-current swiper-container').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const at = (x) => [{ x: hero.x + x, y: hero.y + hero.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(300) });
    for (let x = 280; x >= 60; x -= 20) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x) }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(700);
    const idx = await page.evaluate(() => document.querySelector('.view.tab-active .page-current swiper-container').swiper.activeIndex);
    if (idx !== 1) throw new Error(`swipe did not move to the second photo (at ${idx})`);
    if (await page.locator('.photo-browser-popup.modal-in').count()) throw new Error('swiping opened the photo viewer');
    // the panel's rounded top still sits over the photos
    const top = await page.evaluate(() => { const r = document.querySelector('.view.tab-active .page-current .ck-panel').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + 10).closest('.ck-panel') !== null; });
    if (!top) throw new Error('the photos cover the panel');
  });
  await step('17d-photo-viewer', async () => {
    await page.locator('.view.tab-active .page-current swiper-slide.swiper-slide-active button').tap(); await page.waitForTimeout(900);
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
    await swipeLeft(ctx, page, page.locator('.view.tab-active .page-current .ck-edit-list li.swipeout').nth(2));
    await page.waitForTimeout(600);
  });
  await step('10-ingredient-sheet', async () => {
    await page.locator('.view.tab-active .page-current .ck-edit-list li.swipeout').nth(1).locator('.item-content').first().tap();
    await page.waitForTimeout(800);
  });
  await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap().catch(() => {});
  await page.waitForTimeout(600);
  await step('11-group-renamed-inline', async () => {
    const input = page.locator('.view.tab-active .page-current .ck-edit-list li.ck-group-row input.ck-group-input').first();
    await input.tap();
    await input.fill('Yogurt marinade');
    await page.waitForTimeout(300);
    if ((await input.inputValue()) !== 'Yogurt marinade') throw new Error('group name did not change inline');
    if (await page.locator('.sheet-modal.modal-in').count()) throw new Error('a sheet opened for the group name');
  });
  await step('11b-group-added-inline', async () => {
    await page.locator('.view.tab-active .page-current .button.ck-dashed').first().tap();
    await page.waitForTimeout(500);
    const focused = await page.evaluate(() => document.activeElement?.classList.contains('ck-group-input') && document.activeElement.value === '');
    if (!focused) throw new Error('new group name field is not focused');
    await page.keyboard.type('Garnish');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  });
  await step('11c-group-moved-down', async () => {
    // ↑ ↓ on a group row move the whole group (its rows too) past the next group, and keep it under the finger
    const names = () => page.evaluate(() => [...document.querySelectorAll('.view.tab-active .page-current .ck-edit-list')[0].querySelectorAll('.ck-group-input')].map((i) => i.value));
    const rowsUnder = (name) => page.evaluate((name) => {
      const lis = [...document.querySelectorAll('.view.tab-active .page-current .ck-edit-list')[0].children[0].children];
      const k = lis.findIndex((li) => li.querySelector('.ck-group-input')?.value === name);
      const out = []; for (let j = k + 1; j < lis.length && !lis[j].classList.contains('ck-group-row'); j++) out.push(lis[j].textContent.trim().slice(0, 20));
      return out.join('|');
    }, name);
    const before = await names();
    const first = before[0];
    const under = await rowsUnder(first);
    const row = page.locator('.view.tab-active .page-current .ck-edit-list').first().locator('li.ck-group-row').first();
    await row.locator('.ck-move-btn').nth(1).scrollIntoViewIfNeeded();
    const y0 = (await row.locator('.ck-move-btn').nth(1).boundingBox()).y;
    await row.locator('.ck-move-btn').nth(1).tap(); await page.waitForTimeout(400);
    const after = await names();
    if (after[1] !== first) throw new Error(`group "${first}" didn't move down (${after.join(', ')})`);
    if ((await rowsUnder(first)) !== under) throw new Error('the group\'s rows didn\'t move with it');
    const moved = page.locator('.view.tab-active .page-current .ck-edit-list').first().locator('li.ck-group-row').nth(1).locator('.ck-move-btn').nth(1);
    const y1 = (await moved.boundingBox()).y;
    if (Math.abs(y1 - y0) > 4) throw new Error(`moved group jumped ${Math.round(y1 - y0)}px on screen`);
    // drag handles are on the right, so a thumb on them doesn't cover the row's text
    const side = await page.evaluate(() => { const li = document.querySelector('.view.tab-active .page-current .ck-edit-list li:not(.ck-group-row)'); return li.querySelector('.sortable-handler').getBoundingClientRect().left - li.getBoundingClientRect().left > li.getBoundingClientRect().width / 2; });
    if (!side) throw new Error('drag handles are on the left');
  });
  // a long press on a row picks it up: it turns pale Tomato (no grey pressed shade) while held and dragged
  let holdCdp;
  await step('11d-row-held', async () => {
    const li = page.locator('.view.tab-active .page-current .ck-edit-list li:not(.ck-group-row)').nth(2);
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
    await page.locator('.view.tab-active .page-current textarea[placeholder^="Add one ingredient"]').fill('For the topping:\n\n1/2 cup brown sugar\n2 tbsp butter, melted');
    await page.waitForTimeout(300);
  });
  await step('12b-edit-pasted', async () => {
    await page.locator('.view.tab-active .page-current .button', { hasText: 'Add 3 lines' }).tap();
    await page.waitForTimeout(500);
  });
  // issue #71: steps are typed right in their rows (no sheet). Return starts a new step, Backspace at the start of one
  // joins it to the step above, and several lines pasted into a step become several steps
  const steps = () => page.locator('.view.tab-active .page-current .ck-edit-list').nth(1).locator('textarea.ck-step-input');
  const stepValues = () => steps().evaluateAll((ts) => ts.map((t) => t.value));
  const focusedStep = () => page.evaluate(() => { const a = document.activeElement; return a?.classList.contains('ck-step-input') ? { i: [...a.closest('.ck-edit-list').querySelectorAll('textarea.ck-step-input')].indexOf(a), value: a.value, at: a.selectionStart } : null; });
  let before = [];
  await step('12c-edit-step-inline', async () => {
    before = await stepValues();
    if (before.length < 2) throw new Error(`expected steps to edit, found ${before.length}`);
    // every step shows in full: Framework7 grows each field to its text
    const cut = await steps().evaluateAll((ts) => ts.filter((t) => t.scrollHeight > t.clientHeight + 1).map((t) => t.value.slice(0, 24)));
    if (cut.length) throw new Error(`steps cut off: ${cut.join(', ')}`);
    const field = steps().first();
    await field.scrollIntoViewIfNeeded();
    await field.tap(); await page.waitForTimeout(400);
    if (await page.locator('.sheet-modal.modal-in').count()) throw new Error('a sheet opened for the step');
    if ((await focusedStep())?.i !== 0) throw new Error('tapping a step did not put the cursor in it');
    await field.evaluate((t) => t.setSelectionRange(t.value.length, t.value.length));
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const f = await focusedStep();
    if (!f || f.i !== 1 || f.value !== '') throw new Error(`Return didn't start a new step with the cursor in it (${JSON.stringify(f)})`);
    await page.keyboard.type('Let it rest for 5 minutes.'); await page.waitForTimeout(200);
    const after = await stepValues();
    if (after.length !== before.length + 1 || after[0] !== before[0] || after[1] !== 'Let it rest for 5 minutes.') throw new Error(`steps after Return: ${JSON.stringify(after.map((v) => v.slice(0, 24)))}`);
  });
  await step('12c2-edit-step-joined', async () => {
    // Backspace at the start of the new step joins it back onto the first
    await page.evaluate(() => document.activeElement.setSelectionRange(0, 0));
    await page.keyboard.press('Backspace'); await page.waitForTimeout(300);
    const after = await stepValues();
    if (after.length !== before.length || after[0] !== `${before[0]} Let it rest for 5 minutes.`) throw new Error(`steps after Backspace: ${JSON.stringify(after.map((v) => v.slice(-30)))}`);
    const f = await focusedStep();
    if (!f || f.i !== 0 || f.at !== before[0].length + 1) throw new Error(`cursor not at the join (${JSON.stringify(f)})`);
  });
  await step('12c3-edit-steps-pasted-inline', async () => {
    // Return at the end of the last step, then a whole list pasted into the empty step it made
    const last = steps().last();
    await last.tap(); await last.evaluate((t) => t.setSelectionRange(t.value.length, t.value.length));
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await steps().last().fill('For the glaze:\n\n1. Whisk the sugar and lemon juice.\nStep 2\nDrizzle it over the top.');
    await page.waitForTimeout(400);
    const groups = await page.locator('.view.tab-active .page-current .ck-edit-list').nth(1).locator('input.ck-group-input').evaluateAll((is) => is.map((i) => i.value));
    const after = await stepValues();
    if (groups[groups.length - 1] !== 'For the glaze') throw new Error(`the heading didn't become a group (${JSON.stringify(groups)})`);
    if (after.slice(-2).join('|') !== 'Whisk the sugar and lemon juice.|Drizzle it over the top.') throw new Error(`pasted steps: ${JSON.stringify(after.slice(-3))}`);
    const f = await focusedStep();
    if (!f || f.value !== 'Drizzle it over the top.') throw new Error('cursor is not in the last pasted step');
  });
  await page.evaluate(() => document.activeElement?.blur());
  await step('12c4-step-row-swiped', async () => {
    // a step row still swipes open to Delete, though the swipe starts on its text field
    const li = page.locator('.view.tab-active .page-current .ck-edit-list').nth(1).locator('li.ck-step-row').first();
    await li.scrollIntoViewIfNeeded();
    await swipeLeft(ctx, page, li); await page.waitForTimeout(600);
    if (!(await li.evaluate((e) => e.classList.contains('swipeout-opened')))) throw new Error('swiping a step did not show Delete');
  });
  await page.locator('.view.tab-active .page-current .navbar .title').tap().catch(() => {});
  await page.waitForTimeout(500);
  await step('12d-edit-recipe-info', async () => {
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 99999));
    const layout = await page.evaluate(() => {
      const out = [];
      // each row's reorder handle (20px icon) is centred on its first line: step number, ingredient, or group name
      for (const li of document.querySelectorAll('.view.tab-active .page-current .ck-edit-list li')) {
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
      for (const g of document.querySelectorAll('.view.tab-active .page-current .ck-edit-list li.ck-group-row')) {
        const next = g.nextElementSibling; if (next && !next.classList.contains('ck-group-row') && getComputedStyle(g).backgroundColor === getComputedStyle(next).backgroundColor) out.push(`group row "${g.textContent.trim()}" has the same fill as its card (${getComputedStyle(g).backgroundColor})`);
      }
      // clear buttons inside their field
      for (const b of document.querySelectorAll('.view.tab-active .page-current .ck-fields .input-clear-button')) {
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
      const chip = document.querySelector('.view.tab-active .page-current .ck-tag-add'); const i = chip.querySelector('input');
      const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return Math.round(chip.getBoundingClientRect().right - i.getBoundingClientRect().left - c.measureText(i.value || i.placeholder).width);
    });
    const empty = await slack();
    await page.locator('.view.tab-active .page-current .ck-tag-add input').fill('Make-ahead');
    const typed = await slack();
    if (empty > 24 || typed > 24) throw new Error(`"Add tag" chip has ${Math.max(empty, typed)}px after its text (other chips have 15)`);
  });
  await step('12d3-tag-added', async () => {
    await page.locator('.view.tab-active .page-current .ck-tag-add input').press('Enter'); await page.waitForTimeout(300);
    if (await page.locator('.dialog.modal-in').count()) throw new Error('adding a tag opened a dialog');
    const on = await page.locator('.view.tab-active .page-current .ck-chip.ck-chip-on', { hasText: 'Make-ahead' }).count();
    if (!on) throw new Error('new tag is not shown as a selected chip');
    if ((await page.locator('.view.tab-active .page-current .ck-tag-add input').inputValue()) !== '') throw new Error('tag field not cleared after adding');
    if (await page.locator('.view.tab-active .page-current .ck-fields input[placeholder^="#"]').count()) throw new Error('the separate Tags text field is still there');
  });
  await step('12e-discard-prompt', async () => { await page.locator('.navbar a', { hasText: 'Cancel' }).filter({ visible: true }).first().tap(); });
  await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Discard Changes' }).tap().catch(() => {});
  await page.waitForTimeout(900);
  await step('12f-recipe-scrolled', async () => { await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 500)); });

  await page.goto(BASE);
  await page.waitForTimeout(900);
  // issue #17: + asks how to make the recipe: from a link (#15), from photos or screenshots, or typed in
  await step('12g0-new-recipe-sheet', async () => {
    await page.locator('.navbar a[aria-label="New recipe"]').first().tap();
    await page.waitForTimeout(600);
    const buttons = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (buttons.map((b) => b.trim()).join() !== 'From a link,From photos or screenshots,Type it in,Cancel') throw new Error(`the sheet offers ${JSON.stringify(buttons)}`);
  });
  await step('12g-new-recipe', async () => {
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Type it in' }).tap();
    await page.waitForTimeout(900);
    // the form title is centered on the screen (DESIGN.md "Pushed form screens")
    const off = await page.evaluate(() => {
      const t = document.querySelector('.view.tab-active .page-current .navbar .title');
      const r = t.getBoundingClientRect();
      return Math.round(r.left + r.width / 2 - innerWidth / 2);
    });
    if (Math.abs(off) > 3) throw new Error(`title is ${off}px off center`);
  });

  // issue #17: a recipe read from a photo. The editor opens at once with the photo at the top and grey rows where the
  // ingredients and steps will go; then it fills in (the demo backend's made-up recipe) with the dish photo cropped out
  const scanPhoto = path.resolve(__dirname, '..', 'public', 'photos', 'corn.jpg');
  const pickScan = async () => {
    await page.locator('.navbar a[aria-label="New recipe"]').first().tap(); await page.waitForTimeout(600);
    await page.locator('#view-recipes .page-current input[type=file]').setInputFiles(scanPhoto);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Cancel' }).tap().catch(() => {});
    await page.waitForTimeout(700);
  };
  await page.goto(BASE);
  await page.waitForTimeout(900);
  await step('12h-reading-photo', async () => {
    await pickScan();
    const text = await page.locator('.view.tab-active .page-current .ck-scan-text').textContent();
    if (!/^Reading the recipe/.test(text)) throw new Error(`the editor says "${text}"`);
    if ((await page.locator('.view.tab-active .page-current .skeleton-text').count()) < 4) throw new Error('no grey rows while reading');
    if (!(await page.locator('.view.tab-active .page-current .ck-scan .progressbar-infinite').count())) throw new Error('no moving bar while reading');
  });
  await step('12i-read-from-photo', async () => {
    await page.waitForTimeout(1800);
    const text = await page.locator('.view.tab-active .page-current .ck-scan-text').textContent();
    if (!/^Recipe read/.test(text)) throw new Error(`the editor says "${text}"`);
    if (await page.locator('.view.tab-active .page-current .skeleton-text').count()) throw new Error('grey rows still showing');
    const title = await page.locator('.view.tab-active .page-current .ck-fields input[type=text]').first().inputValue();
    if (title !== 'Lemon Drizzle Loaf') throw new Error(`the name is "${title}"`);
    const headers = await page.locator('.view.tab-active .page-current .ck-group-input').count();
    if (headers !== 2) throw new Error(`expected 2 groups (drizzle ingredients, drizzle steps), found ${headers}`);
    if (!(await page.locator('.view.tab-active .page-current .ck-edit-photo.ck-photo').count())) throw new Error('the dish photo was not added');
  });
  await step('12j-read-photo-full-screen', async () => {
    await page.locator('.view.tab-active .page-current .ck-scan-source').first().tap(); await page.waitForTimeout(800);
    if (!(await page.locator('.photo-browser-popup.modal-in').count())) throw new Error('tapping the photo did not open it full screen');
  });
  await page.goto(`${BASE}?readfail`);
  await page.waitForTimeout(900);
  await step('12k-read-failed', async () => {
    await pickScan();
    await page.waitForTimeout(1800);
    const text = await page.locator('.view.tab-active .page-current .ck-scan-text').textContent();
    if (!/^Couldn’t read the recipe.*busy/.test(text)) throw new Error(`the editor says "${text}"`);
    if (await page.locator('.view.tab-active .page-current .ck-scan .progressbar-infinite').count()) throw new Error('the bar still moves after failing');
    if (!(await page.locator('.view.tab-active .page-current .ck-scan .button', { hasText: 'Try again' }).count())) throw new Error('no Try again');
  });

  // issue #15: a recipe from a link. + → From a link opens its own screen (a popup) with one field for the link (iOS's
  // own Paste, or typed); Import opens the editor at once with the site in the banner, then it fills in (the demo
  // backend's made-up recipe) with the page's photo
  const POP = '.popup.ck-from-link-popup.modal-in';
  const askLink = async (link) => {
    await page.locator('.navbar a[aria-label="New recipe"]').first().tap(); await page.waitForTimeout(600);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'From a link' }).tap(); await page.waitForTimeout(700);
    if (link !== undefined) {
      await page.locator(`${POP} textarea`).fill(link);
      await page.locator(`${POP} .navbar a`, { hasText: 'Import' }).tap(); await page.waitForTimeout(1100);
    }
  };
  const LINK = 'https://www.example.com/weeknight-chickpea-curry/';
  await page.goto(BASE);
  await page.waitForTimeout(900);
  // the field is empty and already focused (the keyboard is up without tapping into it); nothing to import yet
  await step('12l-link-screen', async () => {
    await askLink();
    const field = page.locator(`${POP} textarea`);
    if ((await field.getAttribute('inputmode')) !== 'url') throw new Error('the link field has no URL keyboard');
    if (await field.inputValue()) throw new Error(`the field starts with "${await field.inputValue()}"`);
    if (!(await field.evaluate((el) => el === document.activeElement))) throw new Error('the link field isn’t focused');
    const title = await page.locator(`${POP} .navbar .title`).textContent();
    if (title.trim() !== 'From a Link') throw new Error(`the screen is titled "${title}"`);
    if (!(await page.locator(`${POP} .navbar a.disabled`, { hasText: 'Import' }).count())) throw new Error('Import works with no link');
    // one place to paste: the field (a separate Paste row only brought up iOS's Paste button, which looked like a bug)
    if ((await page.locator(`${POP} .list`).count()) !== 1) throw new Error('more than the link field on the screen');
    const info = await page.locator(`${POP} .item-input-info`).textContent();
    if (!/choose Paste/.test(info)) throw new Error(`under the empty field: "${info}"`);
  });
  // a link pasted in a message: the field keeps all of it, the site shows under it, and the long address wraps clear
  // of the clear button (✕), which used to sit over its text
  await step('12l0-link-pasted', async () => {
    await page.locator(`${POP} textarea`).fill(`Saw this on Instagram https://www.example.com/2026/09/simple-weeknight-chickpea-curry-with-spinach/`);
    const info = await page.locator(`${POP} .item-input-info`).textContent();
    if (info !== 'From example.com') throw new Error(`under the link: "${info}"`);
    if (await page.locator(`${POP} .navbar a.disabled`, { hasText: 'Import' }).count()) throw new Error('Import is still off');
    const clear = await page.locator(`${POP} .input-clear-button`).boundingBox();
    const [pad, right] = await page.locator(`${POP} textarea`).evaluate((el) => [parseFloat(getComputedStyle(el).paddingRight), el.getBoundingClientRect().right]);
    if (!clear || right - pad > clear.x) throw new Error('the link runs under the clear button');
  });
  await step('12l2-not-a-link', async () => {
    await page.locator(`${POP} textarea`).fill('chicken curry');
    const error = await page.locator(`${POP} .item-input-error-message`).textContent();
    if (!/isn’t a link/.test(error)) throw new Error(`typing words shows "${error}"`);
    if (!(await page.locator(`${POP} .navbar a.disabled`, { hasText: 'Import' }).count())) throw new Error('Import works with words');
  });
  await page.goto(BASE);
  await page.waitForTimeout(900);
  await step('12m-reading-link', async () => {
    await askLink(`Try this: ${LINK}`);
    const text = await page.locator('.view.tab-active .page-current .ck-scan-text').textContent();
    if (!/^Reading the recipe/.test(text)) throw new Error(`the editor says "${text}"`);
    if (!text.includes('example.com')) throw new Error('the banner doesn’t name the site');
    if (!(await page.locator('.view.tab-active .page-current .ck-scan-site').count())) throw new Error('no site tile');
    if ((await page.locator('.view.tab-active .page-current .skeleton-text').count()) < 4) throw new Error('no grey rows while reading');
  });
  await step('12n-read-from-link', async () => {
    await page.waitForTimeout(2200);
    const text = await page.locator('.view.tab-active .page-current .ck-scan-text').textContent();
    if (!/^Recipe read.*against the page/.test(text)) throw new Error(`the editor says "${text}"`);
    const title = await page.locator('.view.tab-active .page-current .ck-fields input[type=text]').first().inputValue();
    if (title !== 'Weeknight Chickpea Curry') throw new Error(`the name is "${title}"`);
    if (!(await page.locator('.view.tab-active .page-current .ck-edit-photo.ck-photo').count())) throw new Error('the page’s photo was not added');
    const source = await page.locator('.view.tab-active .page-current input[placeholder="Website or person"]').inputValue();
    if (source !== 'Sample Kitchen') throw new Error(`the source is "${source}"`);
    // the full address of the page, not only its site
    const link = await page.locator('.view.tab-active .page-current textarea[inputmode=url]').inputValue();
    if (link !== LINK) throw new Error(`the source link is "${link}"`);
  });
  await step('12n2-link-saved', async () => {
    await page.locator('.view.tab-active .page-current .navbar a', { hasText: 'Save' }).tap(); await page.waitForTimeout(900);
    await page.locator('#view-recipes .page-current .ck-card', { hasText: 'Weeknight Chickpea Curry' }).first().tap(); await page.waitForTimeout(900);
    const href = await page.locator('.view.tab-active .page-current a.ck-source-link').getAttribute('href');
    if (href !== LINK) throw new Error(`the recipe's source links to ${href}`);
    await page.goBack(); await page.waitForTimeout(900);
  });
  // the same page again (without www, with a tracking bit): the recipe already made from it is offered first
  await step('12o-link-already-imported', async () => {
    await askLink();
    await page.locator(`${POP} textarea`).fill('https://example.com/weeknight-chickpea-curry?utm_source=instagram');
    const have = await page.locator(`${POP} .ck-from-link-have .item-content`).textContent().catch(() => '');
    if (!/Already in your recipes.*Weeknight Chickpea Curry/.test(have)) throw new Error(`the same link again shows "${have}"`);
  });
  await step('12o2-open-already-imported', async () => {
    await page.locator(`${POP} .ck-from-link-have a`).tap(); await page.waitForTimeout(1300);
    if (await page.locator(POP).count()) throw new Error('the screen is still open');
    const text = await page.locator('.view.tab-active .page-current').textContent();
    if (!/Weeknight Chickpea Curry/.test(text) || !(await page.locator('.view.tab-active .page-current a.ck-source-link').count())) throw new Error('the recipe didn’t open');
  });
  await page.goto(`${BASE}?readfail`);
  await page.waitForTimeout(900);
  await step('12p-link-failed', async () => {
    await askLink(LINK);
    await page.waitForTimeout(1800);
    const text = await page.locator('.view.tab-active .page-current .ck-scan-text').textContent();
    if (!/^Couldn’t read the recipe.*wouldn’t let the app read the page/.test(text)) throw new Error(`the editor says "${text}"`);
    if (!(await page.locator('.view.tab-active .page-current .ck-scan .button', { hasText: 'Try again' }).count())) throw new Error('no Try again');
  });

  await page.goto(BASE);
  await page.waitForTimeout(900);
  // issue #27: Settings is the last tab (no Settings button on Recipes any more), and its first page has no back button
  await step('13-settings', async () => {
    const tabs = await page.locator('.tabbar a').evaluateAll((as) => as.map((a) => a.getAttribute('aria-label')));
    if (tabs.join() !== 'Recipes,Cookbooks,Plan,Groceries,Settings') throw new Error(`the tabs are ${JSON.stringify(tabs)}`);
    if (await page.locator('#view-recipes .navbar a[aria-label="Settings"]').count()) throw new Error('Recipes still has a Settings button');
    await page.locator('.tabbar a[aria-label="Settings"]').tap(); await page.waitForTimeout(700);
    if (await page.locator('#view-settings .page-current .navbar .link.back').count()) throw new Error('the Settings tab has a back button');
    const title = await page.locator('#view-settings .page-current .navbar .title').textContent();
    if (title.trim() !== 'Settings') throw new Error(`the Settings tab is titled "${title}"`);
  });
  // the Version group: which version is running. Tapping it copies it, with a toast (issue #48); its refresh icon
  // spins with no dialog or toast, then reloads the app back on Settings, even with nothing newer to get (issue #91:
  // the home-screen app has no other way to reload). A mark left on the page shows it really reloaded.
  await step('13b-settings-refresh-reloads', async () => {
    const row = page.locator('.view.tab-active .page-current li.ck-version-row');
    const version = await row.locator('.item-title').textContent();
    if (!/^\w{5,7} · /.test(version.trim())) throw new Error(`the version reads "${version}"`);
    await row.scrollIntoViewIfNeeded();
    const target = await row.locator('.ck-refresh-link').evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
    if (Math.min(...target) < 44) throw new Error(`the refresh icon's tap target is ${target.join('×')}px`);
    await page.evaluate(() => { window.__ckNotReloaded = true; });
    const loaded = page.waitForEvent('load', { timeout: 15000 });
    await row.locator('.ck-refresh-link').tap(); await page.waitForTimeout(200);
    const spinning = await row.locator('.ck-refresh.ck-spinning').count();
    const popups = await page.locator('.dialog.modal-in, .toast.modal-in').count();
    if (!spinning) throw new Error('the refresh icon does not spin while refreshing');
    if (popups) throw new Error('refreshing still shows a dialog or toast');
    await loaded.catch(() => { throw new Error('the refresh icon did not reload the app when there was nothing newer'); });
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => window.__ckNotReloaded)) throw new Error('the app was not reloaded');
    const active = await page.evaluate(() => [document.querySelector('.view.tab-active')?.id, document.querySelector('.tabbar .tab-link-active')?.getAttribute('aria-label')]);
    if (active.join() !== 'view-settings,Settings') throw new Error(`after the refresh the app opened on ${active.join(' / ')}`);
    if (await page.locator('.dialog.modal-in, .toast.modal-in').count()) throw new Error('the refresh ended in a dialog or toast');
    if (await page.locator('#view-settings .page-current .ck-refresh.ck-spinning').count()) throw new Error('the refresh icon still spins after the reload');
  });
  await step('13b2-settings-copy-version', async () => {
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
    const row = page.locator('.view.tab-active .page-current li.ck-version-row');
    const version = (await row.locator('.item-title').textContent()).trim();
    await row.locator('.item-title').tap(); await page.waitForTimeout(400);
    const toast = await page.locator('.toast.modal-in').textContent().catch(() => '');
    if (!/Version copied/.test(toast)) throw new Error(`tapping the version shows "${toast}", not a "Version copied" toast`);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    if (copied !== version) throw new Error(`the clipboard holds "${copied}", not "${version}"`);
    if (await row.locator('.ck-refresh.ck-spinning').count()) throw new Error('copying the version also checks for updates');
    await page.waitForFunction(() => !document.querySelector('.toast.modal-in, .toast.modal-out'), null, { timeout: 5000 }).catch(() => {});
  });
  // issue #48: when the refresh finds a new version, the app reloads into it back on Settings (not on Recipes). The live
  // site is made to say it serves another build; the next app load starts on Recipes again.
  await step('13b3-settings-refresh-stays', async () => {
    await page.route('**/version.json*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 'fffffff', built: '2030-01-01T00:00:00.000Z' }) }));
    const row = page.locator('.view.tab-active .page-current li.ck-version-row');
    await Promise.all([page.waitForEvent('load', { timeout: 15000 }), row.locator('.ck-refresh-link').tap()]);
    await page.unroute('**/version.json*');
    await page.waitForTimeout(1200);
    const active = await page.evaluate(() => [document.querySelector('.view.tab-active')?.id, document.querySelector('.tabbar .tab-link-active')?.getAttribute('aria-label')]);
    if (active.join() !== 'view-settings,Settings') throw new Error(`after the update the app opened on ${active.join(' / ')}`);
    if (!(await page.locator('#view-settings .page-current li.ck-version-row').isVisible())) throw new Error('the Version row is not on screen after the update');
    await page.reload(); await page.waitForTimeout(1200);
    const later = await page.evaluate(() => document.querySelector('.view.tab-active')?.id);
    if (later !== 'view-recipes') throw new Error(`opening the app again started on ${later}, not Recipes`);
    await page.locator('.tabbar a[aria-label="Settings"]').tap(); await page.waitForTimeout(700);
  });
  // issue #91: on the iPhone the icon spun forever and nothing happened, as if the service worker never answered.
  // Its calls are made to hang (looking for a new version, then asking for the registration at all): the app must
  // still reload, back on Settings, within the time limits in src/lib/appUpdate.ts.
  for (const [name, hang] of [
    ['13b4-settings-refresh-update-hangs', () => { ServiceWorkerRegistration.prototype.update = () => new Promise(() => {}); }],
    ['13b5-settings-refresh-registration-hangs', () => { navigator.serviceWorker.getRegistration = () => new Promise(() => {}); }],
  ]) {
    await step(name, async () => {
      const row = page.locator('.view.tab-active .page-current li.ck-version-row');
      await page.evaluate(hang);
      await page.evaluate(() => { window.__ckNotReloaded = true; });
      const loaded = page.waitForEvent('load', { timeout: 12000 });
      await row.locator('.ck-refresh-link').tap();
      await loaded.catch(() => { throw new Error('with the service worker not answering, the refresh icon never reloaded the app'); });
      await page.waitForTimeout(1200);
      if (await page.evaluate(() => window.__ckNotReloaded)) throw new Error('the app was not reloaded');
      const active = await page.evaluate(() => document.querySelector('.view.tab-active')?.id);
      if (active !== 'view-settings') throw new Error(`after the refresh the app opened on ${active}`);
    });
  }
  // every Settings group is a white card under its own title (rows outside the card once sat on the grey page)
  await step('13c-settings-groups', async () => {
    const t = await page.evaluate(() => {
      const lists = [...document.querySelectorAll('.view.tab-active .page-current .list')];
      return {
        loose: lists.filter((l) => [...l.children].some((c) => c.tagName === 'LI' || c.classList.contains('item-content'))).length,
        notWhite: lists.filter((l) => getComputedStyle(l.querySelector('ul')).backgroundColor !== 'rgb(255, 255, 255)').length,
        titles: [...document.querySelectorAll('.view.tab-active .page-current .block-title')].map((x) => x.textContent),
        footers: document.querySelectorAll('.view.tab-active .page-current .block-footer').length,
      };
    });
    if (t.loose || t.notWhite) throw new Error(`${t.loose + t.notWhite} Settings group(s) not in a white card`);
    if (t.titles.join() !== 'Account,Import,Groceries,Version,Style Guide') throw new Error(`Settings group titles read ${JSON.stringify(t.titles)}`);
    if (t.footers) throw new Error(`Settings has ${t.footers} footers, expected none`);
    // Account is one row: the address, then Sign Out in red at its end
    const acct = await page.evaluate(() => {
      const li = document.querySelector('.view.tab-active .page-current li.ck-account-row'); const out = li?.querySelector('.ck-sign-out');
      return { rows: li?.closest('ul').children.length, title: li?.querySelector('.item-title').textContent, out: out?.textContent, color: out && getComputedStyle(out).color,
        right: out && li.getBoundingClientRect().right - out.getBoundingClientRect().right };
    });
    if (acct.rows !== 1 || acct.title !== 'demo@example.com') throw new Error(`the Account card has ${acct.rows} rows, titled "${acct.title}"`);
    if (acct.out !== 'Sign Out' || acct.color !== 'rgb(209, 41, 31)' || acct.right > 40) throw new Error('Sign Out is not red at the end of the account row');
    // every card's row is the same height, and Sign Out is still a 44px tap target
    const heights = await page.evaluate(() => [...document.querySelectorAll('.view.tab-active .page-current .list li')].map((li) => Math.round(li.getBoundingClientRect().height)).filter(Boolean));
    if (new Set(heights).size !== 1) throw new Error(`Settings rows are ${heights.join(', ')}px tall, not all the same`);
    const tap = await page.locator('.view.tab-active .page-current .ck-sign-out').evaluate((e) => e.getBoundingClientRect().height);
    if (tap < 44) throw new Error(`Sign Out's tap target is ${tap}px tall`);
  });
  // Settings → Import from Prepear (issue #14): the peek bookmarklet to copy, then the steps
  await step('13d-prepear-import', async () => {
    await page.locator('.view.tab-active .page-current a', { hasText: 'From Prepear' }).tap(); await page.waitForTimeout(800);
    const href = await page.locator('.view.tab-active .page-current a.ck-bookmarklet').getAttribute('href');
    if (!href || !href.startsWith('javascript:(function')) throw new Error(`the drag link's address is ${String(href).slice(0, 40)}`);
  });
  await step('13e-prepear-copied', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.locator('.view.tab-active .page-current .ck-copy-export a').tap(); await page.waitForTimeout(400);
    if (!(await page.locator('.toast.modal-in', { hasText: 'copied' }).count())) throw new Error('copying the bookmarklet shows no "copied" toast');
    // tapping the Mac drag link in the app does nothing (it's for Prepear's page)
    await page.locator('.view.tab-active .page-current a.ck-bookmarklet').tap(); await page.waitForTimeout(300);
    if (await page.evaluate(() => !!window.__cookbookPeek)) throw new Error('tapping the drag link ran the peek inside the app');
  });
  await page.waitForFunction(() => !document.querySelector('.toast.modal-in, .toast.modal-out'), null, { timeout: 5000 }).catch(() => {});
  // Step 2: a (made-up) export file is chosen: what's in it, then the import (the demo backend has no photo store)
  await step('13f-prepear-file-chosen', async () => {
    await page.locator('.view.tab-active .page-current input[type=file]').setInputFiles(path.join(__dirname, 'fixtures', 'prepear-export-sample.json'));
    await page.waitForTimeout(500);
    const text = await page.evaluate(() =>
      [...document.querySelectorAll('.view.tab-active .page-current .ck-import-summary li')].map((li) => `${li.querySelector('.item-title').childNodes[0].textContent.trim()} ${li.querySelector('.item-after').textContent.trim()}`).join(' | '),
    );
    if (text !== 'Recipes to import 2 | With a photo 1 | Can’t import 1') throw new Error(`the summary reads "${text}"`);
    await page.locator('.view.tab-active .page-current .ck-import-button').scrollIntoViewIfNeeded();
  });
  await step('13g-prepear-imported', async () => {
    await page.locator('.view.tab-active .page-current .ck-import-button').tap();
    await page.waitForSelector('.view.tab-active .page-current .ck-import-done', { timeout: 10000 });
    const done = (await page.locator('.view.tab-active .page-current .ck-import-done').textContent()).trim();
    if (!/^Imported 2 recipes\.$/.test(done)) throw new Error(`after importing it says "${done}"`);
  });
  // Step 3 (issue #25): the cookbooks, from the file kept in step 2 (the demo keeps it until the page reloads)
  await step('13g2-prepear-cookbooks', async () => {
    await page.locator('.view.tab-active .page-current .ck-look-books a').scrollIntoViewIfNeeded();
    await page.locator('.view.tab-active .page-current .ck-look-books a').tap(); await page.waitForSelector('.view.tab-active .page-current .ck-books-summary', { timeout: 5000 });
    const text = await page.evaluate(() =>
      [...document.querySelectorAll('.view.tab-active .page-current .ck-books-summary li')].map((li) => `${li.querySelector('.item-title').childNodes[0].textContent.trim()} ${li.querySelector('.item-after').textContent.trim()}`).join(' | '),
    );
    if (!text.startsWith('Cookbooks to import 1 | With sections 0')) throw new Error(`the cookbooks summary reads "${text}"`);
    await page.locator('.view.tab-active .page-current .ck-import-books-button').tap();
    await page.waitForSelector('.view.tab-active .page-current .ck-import-done >> text=cookbook', { timeout: 10000 });
    const done = (await page.locator('.view.tab-active .page-current .ck-import-done', { hasText: 'cookbook' }).textContent()).trim();
    if (!done.startsWith('Imported 1 cookbook.')) throw new Error(`after importing cookbooks it says "${done}"`);
    // again: nothing new
    await page.locator('.view.tab-active .page-current .ck-look-books a').tap(); await page.waitForTimeout(600);
    const again = await page.locator('.view.tab-active .page-current .ck-import-books-button').textContent();
    if (!again.includes('Nothing new')) throw new Error(`looking again offers "${again}"`);
  });
  await page.locator('.view.tab-active .page-current .navbar .back').tap(); await page.waitForTimeout(800);
  // #14 feedback, on the imported recipes (the demo backend keeps them until the page reloads): a lower-case title got
  // a capital; a card shows its time but not its source, and nothing when no time is set; a card without a photo has
  // its chef hat centred; the recipe page shows a dash for no time
  await page.locator('.tabbar a[aria-label="Recipes"]').tap(); await page.waitForTimeout(800);
  await step('13h-imported-cards', async () => {
    const salad = page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Sample green salad' });
    await salad.scrollIntoViewIfNeeded();
    const t = await page.evaluate(() => {
      const card = (title) => [...document.querySelectorAll('.view.tab-active .page-current .ck-card')].find((c) => c.querySelector('.ck-card-title').textContent === title);
      const salad = card('Sample green salad'), soup = card('Sample Lentil Soup');
      const box = salad.querySelector('.ck-card-photo').getBoundingClientRect(), hat = salad.querySelector('.ck-card-photo svg').getBoundingClientRect();
      return {
        off: Math.max(Math.abs(box.left + box.width / 2 - (hat.left + hat.width / 2)), Math.abs(box.top + box.height / 2 - (hat.top + hat.height / 2))),
        saladMeta: salad.querySelector('.ck-card-meta')?.textContent ?? null,
        soupMeta: soup.querySelector('.ck-card-meta')?.textContent ?? null,
      };
    });
    if (t.off > 2) throw new Error(`the chef hat is ${t.off.toFixed(0)}px off the middle of the empty photo`);
    if (t.saladMeta !== null) throw new Error(`a card with no time set shows "${t.saladMeta}"`);
    if (t.soupMeta !== '45 min') throw new Error(`a card with a source and a time shows "${t.soupMeta}", expected just the time`);
  });
  await step('13i-recipe-no-time', async () => {
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Sample green salad' }).tap(); await page.waitForTimeout(1000);
    const time = (await page.locator('.view.tab-active .page-current .ck-stats > div').nth(2).locator('b').textContent()).trim();
    if (time !== '–') throw new Error(`no time set reads "${time}" on the recipe page, expected a dash`);
  });
  await page.locator('.navbar-current .link.back, .view.tab-active .page-current .navbar .link.back').first().tap(); await page.waitForTimeout(900);
  await page.locator('.tabbar a[aria-label="Settings"]').tap(); await page.waitForTimeout(700);
  await step('14-style-guide', async () => { await page.locator('.view.tab-active .page-current a', { hasText: 'Cookbook' }).tap(); await page.waitForTimeout(800); });
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
    await page.locator('.view.tab-active .page-current .ck-card').first().tap(); await page.waitForTimeout(900);
    const cta = await bar('.view.tab-active .page-current .toolbar.ck-cta', '.ck-cta-button');
    if (cta.innerBottom !== cta.screen) problems.push(`Start cooking bar stops ${cta.screen - cta.innerBottom}px above the screen's bottom`);
    if (Math.abs(cta.mid - cta.above / 2) > 2) problems.push(`Start cooking not centred above the home-indicator strip (${cta.mid}px of ${cta.above})`);
    await safe.evaluate((el) => el.remove());
    if (problems.length) throw new Error(problems.join('; '));
  });

  // issue #8: the Recipes grid shows square photos with the text below them on the page, no card around them
  await step('20-square-tiles', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    const t = await page.evaluate(() => {
      const card = document.querySelector('.view.tab-active .page-current .ck-card'); const photo = card.querySelector('.ck-card-photo').getBoundingClientRect();
      const title = card.querySelector('.ck-card-title').getBoundingClientRect();
      return { ratio: photo.width / photo.height, cardBg: getComputedStyle(card).backgroundColor, titleBelow: title.top >= photo.bottom };
    });
    if (Math.abs(t.ratio - 1) > 0.02) throw new Error(`tile photo is ${t.ratio.toFixed(2)}:1, not square`);
    if (t.cardBg !== 'rgba(0, 0, 0, 0)') throw new Error(`tiles still have a card background (${t.cardBg})`);
    if (!t.titleBelow) throw new Error('tile title is not below the photo');
  });
  // issue #7: back and ••• float over the photo, which starts at the top of the screen, with no bar behind them
  await step('21-buttons-over-photo', async () => {
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    const t = await page.evaluate(() => {
      const hero = document.querySelector('.view.tab-active .page-current .ck-hero, .view.tab-active .page-current .ck-hero-wrap').getBoundingClientRect();
      const nav = document.querySelector('.navbar-current, .view.tab-active .page-current .navbar');
      const back = nav.querySelector('.link.back').getBoundingClientRect();
      const ink = getComputedStyle(nav.querySelector('.link.back'));
      return { heroTop: Math.round(hero.top), bg: getComputedStyle(nav.querySelector('.navbar-bg')).opacity, backInPhoto: back.top >= hero.top && back.bottom <= hero.bottom, backBg: ink.backgroundColor, backInk: ink.color };
    });
    // issue #90: dark see-through circles with white icons over the photo (Uber Eats), not white ones
    if (t.backBg !== 'rgba(0, 0, 0, 0.45)' || t.backInk !== 'rgb(255, 255, 255)') throw new Error(`the back button over the photo is ${t.backInk} on ${t.backBg}`);
    if (t.heroTop !== 0) throw new Error(`photo starts ${t.heroTop}px down, not at the top`);
    if (t.bg !== '0') throw new Error('the top bar still has a background');
    if (!t.backInPhoto) throw new Error('back button is not over the photo');
  });
  // issue #87: scrolled, the recipe ran under the clock and the buttons with nothing behind them. The bar fades in
  // (Framework7's transparent navbar); while it's slid away the strip under the clock is solid; coming back, it's solid
  // with the usual bar buttons. With an iPhone's status bar, as the installed app has it.
  await step('21b-recipe-bar-on-scroll', async () => {
    await page.evaluate(() => document.documentElement.style.setProperty('--f7-safe-area-top', '59px'));
    await page.waitForTimeout(200);
    const bar = () => page.evaluate(() => {
      const nav = document.querySelector('.view.tab-active .page-current > .navbar');
      return { cls: nav.className, bg: getComputedStyle(nav.querySelector('.navbar-bg')).opacity, backBg: getComputedStyle(nav.querySelector('.link.back')).backgroundColor };
    });
    await page.mouse.move(200, 450);
    for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 15); await page.waitForTimeout(60); }
    await page.waitForTimeout(600);
    const down = await bar();
    if (!down.cls.includes('navbar-hidden') || down.bg !== '1') throw new Error(`scrolling down, the bar is ${JSON.stringify(down)}`);
    // what shows under the clock is the bar's colour, not the recipe
    const clock = await page.evaluate(() => document.elementFromPoint(200, 20)?.closest('.navbar') ? 'bar' : document.elementFromPoint(200, 20)?.className);
    if (clock !== 'bar') throw new Error(`under the clock is ${clock}, not the bar`);
    await page.screenshot({ path: path.join(OUT, '21b-recipe-scrolled-down.png') });
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -15); await page.waitForTimeout(60); }
    await page.waitForTimeout(600);
    const up = await bar();
    if (up.cls.includes('navbar-hidden') || !up.cls.includes('navbar-transparent-visible') || up.bg !== '1') throw new Error(`scrolling back up, the bar is ${JSON.stringify(up)}`);
    if (up.backBg !== 'rgb(236, 236, 238)') throw new Error(`on the solid bar, back is ${up.backBg}, not the usual soft grey`);
    await page.screenshot({ path: path.join(OUT, '21b2-recipe-scrolled-up.png') });
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 0));
    await page.waitForTimeout(600);
    const top = await bar();
    if (top.bg !== '0' || top.backBg !== 'rgba(0, 0, 0, 0.45)') throw new Error(`back at the top, the bar is ${JSON.stringify(top)}`);
    await page.evaluate(() => document.documentElement.style.removeProperty('--f7-safe-area-top'));
    await page.waitForTimeout(200);
  });
  // issue #6: amounts that convert are underlined (a fitted grey line; notes look different); tapping one opens a
  // bottom sheet with radio options (24-*); picking one replaces the amount, and the
  // Original option puts it back
  await step('22-unit-underline', async () => {
    await page.locator('.view.tab-active .page-current .ck-scale-button').tap(); await page.waitForTimeout(700);
    await page.locator('.sheet-modal.modal-in .ck-chip', { hasText: '×2' }).tap(); await page.waitForTimeout(300);
    await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).first().tap(); await page.waitForTimeout(700);
    const row = page.locator('.view.tab-active .page-current .ck-ing-list li', { hasText: 'lemon juice' });
    await row.scrollIntoViewIfNeeded();
    const t = await page.evaluate(() => {
      const li = [...document.querySelectorAll('.view.tab-active .page-current .ck-ing-list li')];
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
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelector('.view.tab-active .page-current .page-content').scrollTo(0, 700)); await page.waitForTimeout(400);
    await page.locator('.view.tab-active .page-current .ck-ing-list li', { hasText: 'kosher salt' }).locator('.ck-convertible').tap(); await page.waitForTimeout(1000);
    const t = await page.evaluate(() => {
      const sh = document.querySelector('.sheet-modal.modal-in.ck-unit-sheet'); const r = sh?.getBoundingClientRect();
      const row = document.querySelector('.view.tab-active .page-current li.ck-ing-on')?.getBoundingClientRect();
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
    const text = await page.locator('.view.tab-active .page-current .ck-ing-list li', { hasText: 'kosher salt' }).locator('.ck-convertible').textContent();
    if (text !== '½ tbsp') throw new Error(`after picking ½ tbsp the amount reads "${text}"`);
  });
  // tapping another amount switches the sheet to it; tapping the highlighted one again closes it (toggles it off)
  await step('24b2-unit-sheet-toggle', async () => {
    const salt = page.locator('.view.tab-active .page-current .ck-ing-list li', { hasText: 'kosher salt' }).locator('.ck-convertible');
    const pepper = page.locator('.view.tab-active .page-current .ck-ing-list li', { hasText: 'black pepper' }).locator('.ck-convertible');
    await salt.tap(); await page.waitForTimeout(900);
    const picked = await page.locator('.sheet-modal.modal-in input[type=radio]:checked').evaluate((e) => e.closest('li').textContent);
    if (!picked.includes('½ tbsp')) throw new Error(`reopened sheet has "${picked}" picked, not ½ tbsp`);
    await pepper.tap(); await page.waitForTimeout(700);
    const title = await page.locator('.sheet-modal.modal-in.ck-unit-sheet .toolbar b').textContent().catch(() => null);
    if (title !== 'Black pepper') throw new Error(`tapping another amount should switch the sheet to it (title "${title}")`);
    await pepper.tap(); await page.waitForTimeout(800);
    if (await page.locator('.sheet-modal.modal-in.ck-unit-sheet').count()) throw new Error('tapping the highlighted amount again did not close the sheet');
    if (await page.locator('.view.tab-active .page-current li.ck-ing-on').count()) throw new Error('the ingredient stayed highlighted after closing');
  });
  await step('24b3-unit-sheet-original', async () => {
    const salt = page.locator('.view.tab-active .page-current .ck-ing-list li', { hasText: 'kosher salt' }).locator('.ck-convertible');
    await salt.tap(); await page.waitForTimeout(900);
    await page.locator('.sheet-modal.modal-in li', { hasText: 'Original' }).tap(); await page.waitForTimeout(800);
    const text = await salt.textContent();
    if (text !== '1 1/2 tsp') throw new Error(`after Original the amount reads "${text}"`);
  });
  await step('24c-cook-unit-sheet', async () => {
    await page.locator('.view.tab-active .page-current .ck-cta-button').tap(); await page.waitForTimeout(1200);
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
    await cookEnd();
  });

  // issue #11: an ingredient made from another recipe (the demo kebabs use the Tahini Sauce recipe): its name is a link
  // that opens that recipe; in cook mode it opens the sauce's own cook mode over the kebabs' one, without ticking the row
  await step('25-linked-ingredient', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    const link = page.locator('.view.tab-active .page-current .ck-ing-list li', { hasText: 'tahini sauce' }).locator('.ck-ing-linked');
    await link.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const color = await link.evaluate((e) => getComputedStyle(e).color);
    if (color !== 'rgb(196, 66, 28)') throw new Error(`the linked name is ${color}, not Tomato ink`);
    if (await page.locator('.view.tab-active .page-current .ck-ing-list .ck-ing-linked').count() !== 1) throw new Error('only the tahini sauce row should be a link');
  });
  // #72: groups stand apart. The space above a group label (text to text) is about twice the space between the rows
  await step('25a-recipe-groups-apart', async () => {
    await page.locator('.view.tab-active .page-current .ck-ing-group .ck-group-label', { hasText: 'Kebabs' }).scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    const t = await page.evaluate(() => {
      const scope = document.querySelector('.view.tab-active .page-current .page-content');
      const top = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().top; };
      const bottom = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().bottom; };
      const apart = (a, b) => Math.round(top(b) - bottom(a));
      const ing = [...scope.querySelectorAll('.ck-ing-group')];
      const rows = (g) => [...g.querySelectorAll('.ck-ing-list li .item-inner')];
      const group = apart(rows(ing[0]).at(-1), ing[1].querySelector('.ck-group-label'));
      const row = apart(rows(ing[1])[0].querySelector('.item-title'), rows(ing[1])[1].querySelector('.item-title'));
      const steps = [...scope.querySelectorAll('.ck-steps > *')];
      const label = steps.findLast((el) => el.classList.contains('ck-group-label'));
      const stepGroup = apart(label.previousElementSibling, label);
      const stepRow = apart(steps[1], steps[2]);
      return { group, row, stepGroup, stepRow };
    });
    if (t.group < t.row * 1.8) throw new Error(`a group of ingredients is ${t.group}px below the one before it, its rows ${t.row}px apart`);
    if (t.stepGroup < t.stepRow * 1.8) throw new Error(`a group of steps is ${t.stepGroup}px below the one before it, its steps ${t.stepRow}px apart`);
  });
  await step('25b-linked-recipe-opened', async () => {
    await page.locator('.view.tab-active .page-current .ck-ing-list .ck-ing-linked').tap(); await page.waitForTimeout(1200);
    const title = await page.locator('.view.tab-active .page-current .ck-recipe-title').textContent();
    if (title !== 'Tahini Sauce') throw new Error(`tapping the linked ingredient opened "${title}"`);
  });
  // the sauce opens in a tab, not a layer: one cook mode, with browser-like tabs along the bottom (issue #65: photo and
  // name; the shown one runs into the page), the top bar keeping the shown recipe's name; switching keeps each one's ticks
  await step('25c-cook-linked', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.view.tab-active .page-current .ck-cta-button').tap(); await page.waitForTimeout(1200);
    const row = page.locator('.ck-cook .tab-active .ck-pane-ingredients li', { hasText: 'tahini sauce' });
    await row.scrollIntoViewIfNeeded();
    await row.locator('.ck-ing-linked').tap(); await page.waitForTimeout(800);
    const t = await page.evaluate(() => {
      const cook = document.querySelector('.popup.ck-cook.modal-in');
      const bar = cook.querySelector('.toolbar.ck-cook-recipes'); const barBox = bar?.getBoundingClientRect();
      const shown = [...cook.querySelectorAll('.ck-cook-tabs > .tab')].filter((x) => getComputedStyle(x).display !== 'none');
      const li = [...cook.querySelectorAll('.ck-cook-tabs > .tab')][0].querySelector('.ck-pane-ingredients li:has(.ck-ing-linked)');
      const on = bar?.querySelector('.ck-cook-recipe-on');
      const steps = shown[0]?.querySelector('.ck-pane-steps')?.getBoundingClientRect();
      return {
        popups: document.querySelectorAll('.popup.modal-in').length, behind: !!document.querySelector('.popup-behind'), shown: shown.length,
        on: on?.textContent, title: cook.querySelector('.navbar .title')?.textContent,
        tabs: [...(bar?.querySelectorAll('.ck-cook-recipe') ?? [])].map((c) => c.textContent),
        atBottom: !!barBox && Math.abs(barBox.bottom - innerHeight) < 1, clear: !!steps && !!barBox && steps.bottom <= barBox.top + 1,
        // a browser-like tab: the strip is soft grey, the shown tab is the page colour and starts at the strip's top edge
        strip: getComputedStyle(bar.querySelector('.toolbar-inner')).backgroundColor,
        bold: on && getComputedStyle(on).fontWeight, shadow: on && getComputedStyle(on).boxShadow,
        stripLine: getComputedStyle(bar.querySelector('.toolbar-inner')).boxShadow,
        stepsFade: (() => { const st = getComputedStyle(shown[0].querySelector('.ck-pane-steps')); return String(st.webkitMaskImage || st.maskImage); })(),
        titleSize: getComputedStyle(cook.querySelector('.navbar .title')).fontSize,
        joined: !!on && getComputedStyle(on).backgroundColor === getComputedStyle(cook.querySelector('.page')).backgroundColor && Math.abs(on.getBoundingClientRect().top - barBox.top) < 1,
        ticked: li.querySelector('input').checked,
        thumbs: [...(bar?.querySelectorAll('.ck-cook-recipe') ?? [])].map((c) => { const th = c.querySelector('.ck-tab-thumb'); return !!th && (getComputedStyle(th).backgroundImage !== 'none' || !!th.querySelector('svg')); }),
        fade: getComputedStyle(shown[0].querySelector('.ck-pane-ingredients')).webkitMaskImage || getComputedStyle(shown[0].querySelector('.ck-pane-ingredients')).maskImage,
      };
    });
    if (t.popups !== 1 || t.behind) throw new Error(`the sauce opened as a layer (${t.popups} popups open)`);
    if (t.shown !== 1 || t.on !== 'Tahini Sauce') throw new Error(`the shown tab is "${t.on}" (${t.shown} recipes displayed)`);
    if (t.title !== 'Tahini Sauce') throw new Error(`the top bar reads "${t.title}", not the shown recipe`);
    if (t.tabs.length !== 2 || !t.tabs[0].includes('Kebabs')) throw new Error(`the recipe tabs read ${JSON.stringify(t.tabs)}`);
    if (!t.atBottom) throw new Error('the recipe tabs aren’t along the bottom');
    if (!t.clear) throw new Error('Directions runs under the recipe tabs');
    if (t.strip !== 'rgb(236, 236, 238)') throw new Error(`the tab strip is ${t.strip}, not soft grey`);
    if (!t.joined) throw new Error("the shown tab isn't joined to the page in the page colour");
    if (t.bold !== '700' || !t.shadow || t.shadow === 'none') throw new Error(`the shown tab is weight ${t.bold} with shadow ${t.shadow}, not bold and lifted`);
    // #96: a thin line (--ck-strong) where the page meets the strip and around the shown tab
    if (!t.stripLine.includes('rgb(201, 201, 206)') || !t.stripLine.includes('inset')) throw new Error(`the tab strip's top edge is ${t.stripLine}, not a hairline`);
    if (!/rgb\(201, 201, 206\) 0px 0px 0px 1px/.test(t.shadow)) throw new Error(`the shown tab has no hairline around it (${t.shadow})`);
    if (!t.stepsFade.includes('gradient')) throw new Error('Directions doesn’t fade where it meets the tabs');
    if (t.titleSize !== '21px') throw new Error(`cook mode's title is ${t.titleSize}, not 21px`);
    if (t.thumbs.length !== 2 || !t.thumbs.every(Boolean)) throw new Error('every recipe tab should show its photo (or the chef hat)');
    if (!String(t.fade).includes('gradient')) throw new Error('ingredients scrolling under the top bar do not fade');
    if (t.ticked) throw new Error('tapping the linked name ticked the ingredient');
  });
  // #65: in the installed app the tabs once ran up under the iPhone's status bar (clock and battery over them). With an
  // iPhone's insets (59px status bar, 34px home indicator), the top bar's buttons sit below the status bar and the tabs
  // end above the home indicator
  await step('25c2-cook-linked-safe-areas', async () => {
    await page.addStyleTag({ content: 'html { --f7-safe-area-top: 59px !important; --f7-safe-area-bottom: 34px !important; }' });
    await page.waitForTimeout(300);
    const t = await page.evaluate(() => {
      const close = document.querySelector('.ck-cook .navbar .right a').getBoundingClientRect();
      const tab = document.querySelector('.ck-cook .ck-cook-recipe-on').getBoundingClientRect();
      return { closeTop: close.top, tabBottom: tab.bottom, screen: innerHeight };
    });
    if (t.closeTop < 59) throw new Error(`cook mode's X is under the status bar (${Math.round(t.closeTop)}px from the top)`);
    if (t.tabBottom > t.screen - 34) throw new Error(`the recipe tabs run into the home indicator (${Math.round(t.tabBottom - (t.screen - 34))}px)`);
  });
  await page.evaluate(() => document.querySelectorAll('style').forEach((el) => el.textContent.includes('--f7-safe-area-top: 59px') && el.remove()));
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
    await page.locator('.ck-cook .ck-cook-recipe', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(500);
    const on = await page.locator('.ck-cook .ck-cook-recipe-on').textContent();
    if (!on.includes('Kebabs')) throw new Error(`the Kebabs tab shows "${on}"`);
    if (await page.locator('.ck-cook .tab-active .ck-pane-ingredients li.ck-done').count()) throw new Error('the sauce’s ticks show in the kebabs');
  });
  await step('25d3-cook-progress-kept', async () => {
    await page.locator('.ck-cook .ck-cook-recipe', { hasText: 'Tahini Sauce' }).tap(); await page.waitForTimeout(500);
    const tab = page.locator('.ck-cook .tab-active');
    const ing = await tab.locator('.ck-pane-ingredients li.ck-done').allTextContents();
    const steps = await tab.locator('.ck-pane-steps li.ck-done').count();
    if (ing.length !== 1 || !ing[0].includes('ice water') || steps !== 1) throw new Error(`back on the sauce, ${ing.length} ingredients and ${steps} steps are ticked, expected the ice water and step 1`);
    // X closes only the shown recipe's tab: back to the kebabs alone, with no tabs
    await cookClose();
    if (!(await page.locator('.popup.ck-cook.modal-in').count())) throw new Error('X closed cook mode instead of the sauce’s tab');
    const title = await page.locator('.ck-cook .navbar .title').textContent().catch(() => '');
    if (!title.includes('Kebabs') || (await page.locator('.ck-cook .ck-cook-recipe').count())) throw new Error(`after closing the sauce's tab the bar shows "${title}" and ${await page.locator('.ck-cook .ck-cook-recipe').count()} tabs`);
    // opening the sauce again picks up where it was
    await page.locator('.ck-cook .tab-active .ck-pane-ingredients .ck-ing-linked', { hasText: 'tahini sauce' }).tap(); await page.waitForTimeout(700);
    const again = await page.locator('.ck-cook .tab-active .ck-pane-ingredients li.ck-done').count();
    if (again !== 1) throw new Error(`the reopened sauce has ${again} ingredients ticked, expected the ice water`);
    // closing every recipe's tab leaves cook mode, with no Cooking bar left behind
    await cookClose();
    await cookClose(); await page.waitForTimeout(300);
    if (await page.locator('.popup.ck-cook.modal-in').count()) throw new Error('closing the last recipe did not leave cook mode');
    if (await page.locator('.ck-cooking-fab').count()) throw new Error('the Cooking bar stayed after cook mode closed');
  });
  // the editor: a linked row reads "Recipe: …" under it; the ingredient sheet's Recipe row opens a searchable list of
  // recipes stacked over the page and the sheet (Framework7 popup push) to link one; a pasted line named like a recipe
  // links itself
  await step('25e-edit-linked', async () => {
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap(); await page.waitForTimeout(1200);
    const footer = await page.locator('.view.tab-active .page-current .ck-edit-list li', { hasText: 'tahini sauce' }).locator('.item-footer').textContent();
    if (!footer.includes('Recipe: Tahini Sauce')) throw new Error(`the linked row's footer reads "${footer}"`);
    await page.locator('.view.tab-active .page-current .ck-edit-list li', { hasText: 'warm pitas' }).locator('.item-link').first().tap(); await page.waitForTimeout(900);
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
    const footer = await page.locator('.view.tab-active .page-current .ck-edit-list li', { hasText: 'warm pitas' }).locator('.item-footer').textContent().catch(() => '');
    if (!footer.includes('Recipe: Corn pudding')) throw new Error(`the row behind the sheet reads "${footer}"`);
    await page.locator('.sheet-modal.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(800);
    await page.locator('.view.tab-active .page-current textarea').first().fill('1 cup tahini sauce'); await page.waitForTimeout(300);
    await page.locator('.view.tab-active .page-current .button', { hasText: 'Add 1 line' }).tap(); await page.waitForTimeout(500);
    const pasted = await page.locator('.view.tab-active .page-current .ck-edit-list li', { hasText: '1 cup tahini sauce' }).locator('.item-footer').textContent().catch(() => '');
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
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap(); await page.waitForTimeout(1200);
    await link(page.locator('.view.tab-active .page-current .ck-edit-list li', { hasText: 'warm pitas' }), 'Corn pudding');
    await link(page.locator('.view.tab-active .page-current .ck-edit-list li', { hasText: 'fresh parsley' }), 'Mustard Dill');
    await link(page.locator('.view.tab-active .page-current .ck-edit-list li').filter({ hasText: /^1 lemon/ }), 'Pulled Beef');
    await page.locator('.navbar .ck-nav-primary:visible').tap(); await page.waitForTimeout(1200);
    const linked = await page.locator('.view.tab-active .page-current .ck-ing-list .ck-ing-linked').count();
    if (linked !== 4) throw new Error(`after saving, the kebabs have ${linked} linked ingredients, expected 4`);
  });
  // more recipes than fit: the tabs keep a readable width and the row scrolls sideways with a swipe; the shown tab
  // scrolls into view
  await step('25i-cook-many-tabs', async () => {
    // straight from the kebabs page the save returned to (reloading would reset the demo's recipes)
    await page.locator('.view.tab-active .page-current .ck-cta-button').tap(); await page.waitForTimeout(1200);
    for (const name of ['tahini sauce', 'warm pitas', 'fresh parsley', 'lemon']) {
      const main = page.locator('.ck-cook .ck-cook-recipe', { hasText: 'Middle' });
      if (await main.count()) { await main.tap(); await page.waitForTimeout(500); }
      await page.locator('.ck-cook .tab-active .ck-pane-ingredients .ck-ing-linked', { hasText: new RegExp(`^${name}$`) }).scrollIntoViewIfNeeded();
      await page.locator('.ck-cook .tab-active .ck-pane-ingredients .ck-ing-linked', { hasText: new RegExp(`^${name}$`) }).tap(); await page.waitForTimeout(700);
    }
    const t = await page.evaluate(() => {
      const row = document.querySelector('.ck-cook .ck-cook-recipes .toolbar-inner'); const r = row.getBoundingClientRect();
      const on = row.querySelector('.ck-cook-recipe-on').getBoundingClientRect();
      return { tabs: row.querySelectorAll('.ck-cook-recipe').length, scrolls: row.scrollWidth > row.clientWidth + 1, onText: row.querySelector('.ck-cook-recipe-on').textContent,
        inView: on.left >= r.left - 1 && on.right <= r.right + 1, narrowest: Math.min(...[...row.querySelectorAll('.ck-cook-recipe')].map((x) => x.getBoundingClientRect().width)) };
    });
    if (t.tabs !== 5) throw new Error(`${t.tabs} recipe tabs, expected 5`);
    if (!t.scrolls) throw new Error('five tabs squeeze into the bar instead of scrolling');
    if (t.narrowest < 110) throw new Error(`a tab is only ${Math.round(t.narrowest)}px wide`);
    if (!t.onText.includes('Pulled Beef') || !t.inView) throw new Error(`the tab just opened (${t.onText}) is not scrolled into view`);
  });
  await step('25i2-cook-tabs-swiped', async () => {
    const row = page.locator('.ck-cook .ck-cook-recipes .toolbar-inner');
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
    await cookClose();
    const left = await page.locator('.ck-cook .ck-cook-recipe').allTextContents();
    const on = await page.locator('.ck-cook .ck-cook-recipe-on').textContent();
    if (left.length !== 4 || left.some((x) => x.includes('Pulled')) || !on.includes('Mustard')) throw new Error(`after Close the tabs are ${JSON.stringify(left)}, showing "${on}"`);
  });
  // end cooking, or the next page load comes back into cook mode (issue #85)
  await cookEnd();
  await step('25h-delete-used-recipe', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Tahini Sauce' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Delete Recipe' }).tap(); await page.waitForTimeout(700);
    const text = await page.locator('.dialog.modal-in .dialog-text').textContent();
    if (!text.includes('ingredient in “Middle Eastern Chicken Kebabs”')) throw new Error(`the delete question reads "${text}"`);
    await page.locator('.dialog.modal-in .dialog-button', { hasText: 'Cancel' }).tap(); await page.waitForTimeout(500);
  });

  // ── Cookbooks (issue #25), from a fresh start (the demo's three cookbooks) ──
  const CUR = '.view.tab-active .page-current';
  const cards = () => page.locator(`${CUR} .ck-card-grid .ck-card .ck-card-title`).allTextContents();
  const prompt = async (text) => {
    await page.waitForSelector('.dialog.modal-in input');
    await page.locator('.dialog.modal-in input').fill(text);
    await page.locator('.dialog.modal-in .dialog-button', { hasText: 'OK' }).tap(); await page.waitForTimeout(900);
  };
  await step('26-cookbooks-tab', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.tabbar a[aria-label="Cookbooks"]').tap(); await page.waitForTimeout(900);
    const tiles = await page.locator(`${CUR} .ck-book-tile .ck-book-name`).allTextContents();
    if (tiles.join(',') !== 'Dressings and sauces,Everything else,Grilling') throw new Error(`the cookbooks are ${JSON.stringify(tiles)}, not A–Z`);
    // a card: its soft colour, three recipes as plates, the name and the counts
    const metas = await page.locator(`${CUR} .ck-book-tile .ck-book-meta`).allTextContents();
    if (metas.join(',') !== '0 recipes,6 recipes · 2 sections,2 recipes') throw new Error(`the counts read ${JSON.stringify(metas)}`);
    const plates = await page.locator(`${CUR} .ck-book-tile`, { hasText: 'Everything else' }).locator('.ck-plate.ck-photo').count();
    if (plates !== 3) throw new Error(`Everything else's card shows ${plates} plates with photos, not 3`);
    const tint = await page.locator(`${CUR} .ck-book-tile`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
    if (tint === 'rgba(0, 0, 0, 0)' || tint === 'rgb(255, 255, 255)') throw new Error(`a card has no soft colour (${tint})`);
    if (!(await page.locator(`${CUR} .ck-book-tile`).first().locator('.ck-plate-middle svg').count())) throw new Error('an empty cookbook has no book on its plate');
  });
  // the switch next to + shows the cookbooks as a list (remembered), and back as tiles
  await step('26a-cookbooks-list', async () => {
    await page.locator(`${CUR} > .navbar .ck-view-switch`).tap(); await page.waitForTimeout(700);
    const rows = await page.evaluate((CUR) => [...document.querySelectorAll(`${CUR} .ck-book-list li .item-title`)].map((e) => e.childNodes[0].textContent.trim()), CUR);
    if (rows.join(',') !== 'Dressings and sauces,Everything else,Grilling') throw new Error(`the list shows ${JSON.stringify(rows)}`);
    if (!(await page.locator(`${CUR} .ck-book-list .ck-book-thumb`).count())) throw new Error('the list has no plate thumbnails');
    if (await page.locator(`${CUR} .ck-book-tile`).count()) throw new Error('tiles still show in the list view');
  });
  await step('26a2-cookbooks-tiles-again', async () => {
    await page.locator(`${CUR} > .navbar .ck-view-switch`).tap(); await page.waitForTimeout(700);
    if ((await page.locator(`${CUR} .ck-book-tile`).count()) !== 3) throw new Error('switching back doesn’t show the tiles');
  });
  await step('26b-cookbook-page', async () => {
    await page.locator(`${CUR} .ck-book-tile`, { hasText: 'Everything else' }).tap(); await page.waitForTimeout(1000);
    // sections are shelves: name, count, See all, and a row of recipes
    const sections = await page.evaluate((CUR) => [...document.querySelectorAll(`${CUR} .ck-shelf-title`)].map((e) => e.childNodes[0].textContent.trim()), CUR);
    const meatRow = await page.locator(`${CUR} .ck-shelf`, { hasText: 'Meat' }).locator('.ck-shelf-row .ck-card').count();
    if (meatRow !== 3) throw new Error(`the Meat shelf shows ${meatRow} recipes`);
    // Uncategorized is the last shelf, like the sections
    if (sections.join(',') !== 'Meat,Other,Uncategorized') throw new Error(`the shelves are ${JSON.stringify(sections)}`);
    const unc = await page.locator(`${CUR} .ck-shelf`, { hasText: 'Uncategorized' }).locator('.ck-card-title').allTextContents();
    if (unc.join(',') !== 'Corn pudding,Tahini Sauce') throw new Error(`the Uncategorized shelf shows ${JSON.stringify(unc)}`);
    if ((await cards()).length) throw new Error('a grid shows under the shelves');
    // issue #90: the header counts them, under the cookbook's name, on the cookbook's colour; no count line besides
    const count = await page.locator(`${CUR} .ck-book-hero-meta`).textContent();
    if (!count.includes('6 recipes · 2 sections')) throw new Error(`the count reads "${count}"`);
    if (await page.locator(`${CUR} .ck-count`).count()) throw new Error('a count line shows under the header too');
  });
  // Issue #90: the cookbook's header, from the user's Spotify reference and mockup: page content from the top of the
  // screen in the cookbook's colour, its plates big, its name large, its counts, then its search bar; the bar over it
  // has no background, title or search bar of its own, and its buttons are dark see-through circles (Uber Eats)
  const heroState = () => page.evaluate((cur) => {
    const pg = document.querySelector(cur);
    const bar = pg.querySelector(':scope > .navbar');
    const hero = pg.querySelector('.ck-book-hero');
    return {
      heroTop: Math.round(hero.getBoundingClientRect().top),
      middlePlate: Math.round(hero.querySelector('.ck-plate-middle').getBoundingClientRect().width),
      nameTop: Math.round(hero.querySelector('.ck-book-hero-title').getBoundingClientRect().top),
      heroBg: getComputedStyle(hero).backgroundImage,
      name: hero.querySelector('.ck-book-hero-title').textContent,
      nameSize: getComputedStyle(hero.querySelector('.ck-book-hero-title')).fontSize,
      nameBottom: hero.querySelector('.ck-book-hero-meta').getBoundingClientRect().bottom,
      heroSearchTop: pg.querySelector('.ck-hero-search .searchbar').getBoundingClientRect().top,
      plates: hero.querySelectorAll('.ck-plate.ck-photo').length,
      hidden: bar.classList.contains('navbar-hidden'),
      barBg: getComputedStyle(bar.querySelector('.navbar-bg')).opacity,
      title: getComputedStyle(bar.querySelector('.title')).opacity,
      docked: getComputedStyle(bar.querySelector('.subnavbar')).visibility === 'visible',
      metaShown: getComputedStyle(hero.querySelector('.ck-book-hero-meta')).visibility === 'visible',
      heroSearchShown: getComputedStyle(pg.querySelector('.ck-hero-search')).visibility === 'visible',
      platesOpacity: getComputedStyle(hero.querySelector('.ck-plates')).opacity,
      nameUnderBar: (() => { const b = bar.querySelector('.navbar-inner').getBoundingClientRect().bottom, n = hero.querySelector('.ck-book-hero-title').getBoundingClientRect(); return Math.max(0, Math.min(1, (b - n.top) / n.height)); })(),
      backBg: getComputedStyle(bar.querySelector('.left .link')).backgroundColor,
      plusBg: getComputedStyle(bar.querySelector('.ck-nav-primary')).backgroundColor,
    };
  }, CUR);
  const scrollBy = async (px) => {
    const pc = await page.locator(`${CUR} > .page-content`).boundingBox();
    await page.mouse.move(pc.x + pc.width / 2, pc.y + 400);
    const step = Math.sign(px) * Math.min(20, Math.abs(px));
    for (let d = 0; Math.abs(d) < Math.abs(px); d += step) { await page.mouse.wheel(0, step); await page.waitForTimeout(30); }
    await page.waitForTimeout(600);
  };
  await step('90a-cookbook-header', async () => {
    const t = await heroState();
    if (t.heroTop !== 0 || !t.heroBg.startsWith('linear-gradient')) throw new Error(`the header starts ${t.heroTop}px down (${t.heroBg})`);
    if (t.name !== 'Everything else' || t.nameSize !== '32px') throw new Error(`the header's name is "${t.name}" at ${t.nameSize}`);
    if (t.plates !== 3) throw new Error(`the header shows ${t.plates} plates with photos`);
    // big plates (150px in the middle) in the same space: the name stays where it was
    if (t.middlePlate !== 150) throw new Error(`the middle plate is ${t.middlePlate}px, not 150`);
    if (t.nameTop > 250) throw new Error(`the name starts ${t.nameTop}px down; the plates pushed it down`);
    if (t.heroSearchTop < t.nameBottom) throw new Error('the search bar isn’t under the name');
    if (t.barBg !== '0' || t.title !== '0' || t.docked) throw new Error(`the bar isn't bare over the header (${JSON.stringify(t)})`);
    // frosted white back and ⋯ over the pastel header (the grey looked muddy there); + stays Tomato
    if (t.backBg !== 'rgba(255, 255, 255, 0.6)') throw new Error(`the back button over the header is ${t.backBg}, not frosted white`);
    if (t.plusBg === 'rgba(255, 255, 255, 0.6)') throw new Error('+ lost its Tomato');
  });
  // the user's mockup, frame 2: scrolling, the plates and the colour fade out from the first pixel while the bar fills
  // in; with them gone, the bar is plain with its usual buttons, still no title while the name shows under it
  await step('90b-cookbook-header-scrolling', async () => {
    await scrollBy(60);
    const early = await heroState();
    if (!(Number(early.platesOpacity) < 1 && Number(early.platesOpacity) > 0)) throw new Error(`60px down, the plates' opacity is ${early.platesOpacity}`);
    // the bar stays fully see-through over the fading header (the user's mockup), then solid once it has gone
    if (early.barBg !== '0') throw new Error(`60px down, the bar's background is ${early.barBg}, not see-through`);
    await scrollBy(120);
    const t = await heroState();
    if (t.hidden) throw new Error('the bar’s buttons hid while the header was still on screen');
    if (t.platesOpacity !== '0' || t.barBg !== '1') throw new Error(`with the plates gone, plates ${t.platesOpacity}, bar ${t.barBg}`);
    if (t.title !== '0' || t.docked || !t.heroSearchShown) throw new Error(`with the name still showing, the bar is ${JSON.stringify({ title: t.title, docked: t.docked })}`);
    // on the solid bar, the usual bar buttons
    if (t.backBg === 'rgba(255, 255, 255, 0.6)') throw new Error('on the solid bar, the back button is still frosted');
  });
  // as iOS does it: the title comes into the bar only once the name has gone all the way under it (never in both places),
  // and the count under the name hides then
  await step('90c-cookbook-header-title', async () => {
    try {
      for (let i = 0; i < 9; i++) {
        await scrollBy(10);
        const t = await heroState();
        if (t.hidden) break; // the search has docked and the title row slid away
        if (t.nameUnderBar >= 1 && (t.title !== '1' || t.metaShown)) throw new Error(`the name is under the bar but the bar has no title (${t.title}) or the count still shows (${t.metaShown})`);
        if (t.nameUnderBar < 0.97 && t.title !== '0') throw new Error(`the title is in the bar with ${Math.round(t.nameUnderBar * 100)}% of the name still showing`);
      }
    } finally {
      // back to the top for the steps after, whatever happened
      await scrollBy(-300);
      await page.evaluate((cur) => document.querySelector(`${cur} > .page-content`).scrollTo(0, 0), CUR);
      await page.waitForTimeout(600);
    }
  });
  // Uncategorized's See all opens its own page, like a section's (no Rename or Delete)
  await step('26b2-uncategorized-page', async () => {
    await page.locator(`${CUR} .ck-shelf`, { hasText: 'Uncategorized' }).locator('.ck-shelf-all').tap(); await page.waitForTimeout(1000);
    const title = await page.locator(`${CUR} > .navbar .title`).first().textContent();
    if (!title.startsWith('Uncategorized')) throw new Error(`See all opened "${title}"`);
    if ((await cards()).join(',') !== 'Corn pudding,Tahini Sauce') throw new Error(`the Uncategorized page shows ${JSON.stringify(await cards())}`);
    await page.locator(`${CUR} > .navbar a[aria-label="More actions"]`).tap(); await page.waitForTimeout(700);
    const items = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (items.join('|') !== 'Add Recipes|Organize|Cancel') throw new Error(`Uncategorized's menu is ${JSON.stringify(items)}`);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Cancel' }).tap(); await page.waitForTimeout(600);
    await page.locator(`${CUR} > .navbar .link.back`).tap(); await page.waitForTimeout(900);
  });
  // Edit Cover (issue #80): the card as it will look, its six colours, then the photos as a grid. Plates are numbered
  // left to right (1 left, 2 the big middle one, 3 right): a chosen plate's number is solid Tomato (and its photo ringed
  // and numbered in the grid), a plate filled in automatically has a faint number on the preview only
  const coverNumbers = () => page.evaluate(() =>
    [...document.querySelectorAll('.popup.modal-in .ck-cover-cell')].filter((c) => c.querySelector('.ck-cover-no')).map((c) => `${c.getAttribute('aria-label').split(',')[0]}=${c.querySelector('.ck-cover-no').textContent}`));
  const previewNumbers = () => page.evaluate(() =>
    [...document.querySelectorAll('.popup.modal-in .ck-cover-preview .ck-plate')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      .map((p) => { const n = p.querySelector('.ck-cover-no'); return n ? `${n.textContent}${n.classList.contains('ck-cover-no-auto') ? 'auto' : ''}` : '-'; }).join(' '));
  await step('26b3-edit-cover', async () => {
    await page.locator(`${CUR} > .navbar a[aria-label="More actions"]`).tap(); await page.waitForTimeout(700);
    const items = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (items.some((t) => /Change (Cover|Colour)/.test(t)) || !items.includes('Edit Cover')) throw new Error(`the menu is ${JSON.stringify(items)}`);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Cover' }).tap(); await page.waitForTimeout(1000);
    // Pulled Beef is the chosen cover (the middle plate); the corn and the kebabs are filled in either side
    const order = await page.evaluate(() => [...document.querySelectorAll('.popup.modal-in .ck-cover-cell')].map((c) => c.getAttribute('aria-label').split(',')[0]));
    if (order.slice(0, 3).join('|') !== 'Corn pudding|Pulled Beef with Parsnip Purée|Middle Eastern Chicken Kebabs') throw new Error(`the grid starts ${JSON.stringify(order)}`);
    if ((await coverNumbers()).join('|') !== 'Pulled Beef with Parsnip Purée=2') throw new Error(`numbered in the grid: ${JSON.stringify(await coverNumbers())}`);
    if ((await previewNumbers()) !== '1auto 2 3auto') throw new Error(`the preview's plates read ${await previewNumbers()}`);
    // photos only, no names, square
    if ((await page.locator('.popup.modal-in .ck-cover-cell').first().innerText()).trim()) throw new Error('an unpicked photo shows text');
    const cell = await page.locator('.popup.modal-in .ck-cover-cell').first().boundingBox();
    if (Math.abs(cell.width - cell.height) > 1 || cell.width < 90) throw new Error(`a photo is ${Math.round(cell.width)}×${Math.round(cell.height)}`);
    // the six colours, the cookbook's own marked
    if ((await page.locator('.popup.modal-in .ck-cover-colors .ck-swatch').count()) !== 6) throw new Error('the colours are missing');
    if ((await page.locator('.popup.modal-in .ck-swatch-on').count()) !== 1) throw new Error('the cookbook’s colour isn’t marked');
  });
  await step('26b3b-cover-nothing-chosen', async () => {
    // tapping the chosen photo makes its plate automatic: no numbers in the grid, every plate's number faint
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Pulled Beef"]').tap(); await page.waitForTimeout(400);
    if ((await coverNumbers()).length) throw new Error(`still numbered in the grid: ${JSON.stringify(await coverNumbers())}`);
    if ((await previewNumbers()) !== '1auto 2auto 3auto') throw new Error(`the preview's plates read ${await previewNumbers()}`);
  });
  await step('26b3c-cover-picked-and-coloured', async () => {
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Mustard Dill"]').tap(); await page.waitForTimeout(250);
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Corn pudding"]').tap(); await page.waitForTimeout(250);
    await page.locator('.popup.modal-in .ck-swatch[aria-label="Lilac"]').tap(); await page.waitForTimeout(400);
    if ((await coverNumbers()).join('|') !== 'Corn pudding=2|Mustard Dill Chicken Thighs=1') throw new Error(`numbered: ${JSON.stringify(await coverNumbers())}`);
    if ((await previewNumbers()) !== '1 2 3auto') throw new Error(`the preview's plates read ${await previewNumbers()}`);
    const left = await page.evaluate(() => [...document.querySelectorAll('.popup.modal-in .ck-cover-preview .ck-plate')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0].style.backgroundImage);
    if (!left.includes('mustard')) throw new Error(`the preview's left plate is ${left}`);
    if (!(await page.locator('.popup.modal-in .ck-cover-preview').getAttribute('class')).includes('ck-tint-lilac')) throw new Error('the preview didn’t turn lilac');
  });
  // or tap a plate first (it's selected: a Tomato rim, the hint names it), then the photo for it
  const plate = (cls) => page.locator(`.popup.modal-in .ck-cover-preview .ck-plate-${cls}`);
  await step('26b3d-cover-plate-selected', async () => {
    await plate('middle').tap(); await page.waitForTimeout(300);
    if (!(await plate('middle').getAttribute('class')).includes('ck-plate-selected')) throw new Error('the tapped plate isn’t selected');
    const rim = await plate('middle').evaluate((e) => getComputedStyle(e).borderTopColor);
    if (rim !== 'rgb(228, 87, 46)') throw new Error(`the selected plate's rim is ${rim}`);
    const hint = await page.locator('.popup.modal-in .ck-cover-hint').textContent();
    if (!hint.includes('Now tap a photo for plate 2')) throw new Error(`the hint reads "${hint}"`);
  });
  await step('26b3e-cover-plate-replaced', async () => {
    // the photo goes on the selected plate, replacing what was there; the others stay
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Italian Turkey"]').tap(); await page.waitForTimeout(300);
    if ((await coverNumbers()).join('|') !== 'Italian Turkey Zucchini Meatballs=2|Mustard Dill Chicken Thighs=1') throw new Error(`numbered: ${JSON.stringify(await coverNumbers())}`);
    if (await page.locator('.popup.modal-in .ck-plate-selected').count()) throw new Error('the plate stays selected');
    // a photo already on another plate swaps places with what was on the selected one
    await plate('left').tap(); await page.waitForTimeout(200);
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Italian Turkey"]').tap(); await page.waitForTimeout(300);
    if ((await coverNumbers()).join('|') !== 'Italian Turkey Zucchini Meatballs=1|Mustard Dill Chicken Thighs=2') throw new Error(`after swapping: ${JSON.stringify(await coverNumbers())}`);
    // tapping the selected plate again unselects it
    await plate('right').tap(); await page.waitForTimeout(200);
    await plate('right').tap(); await page.waitForTimeout(200);
    if (await page.locator('.popup.modal-in .ck-plate-selected').count()) throw new Error('tapping a selected plate again doesn’t unselect it');
    // back to the mustard chicken on the left and the corn in the middle, for the steps after
    await plate('left').tap(); await page.waitForTimeout(200);
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Mustard Dill"]').tap(); await page.waitForTimeout(250);
    await plate('middle').tap(); await page.waitForTimeout(200);
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Corn pudding"]').tap(); await page.waitForTimeout(300);
    if ((await coverNumbers()).join('|') !== 'Corn pudding=2|Mustard Dill Chicken Thighs=1') throw new Error(`numbered: ${JSON.stringify(await coverNumbers())}`);
  });
  await step('26b4-cover-full', async () => {
    // a fourth is refused while three plates are chosen
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Middle Eastern"]').tap(); await page.waitForTimeout(250);
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Italian Turkey"]').tap(); await page.waitForTimeout(400);
    if ((await coverNumbers()).length !== 3) throw new Error(`numbered: ${JSON.stringify(await coverNumbers())}`);
    await page.waitForFunction(() => !document.querySelector('.toast.modal-in, .toast.modal-out'), null, { timeout: 5000 }).catch(() => {});
    // the right plate goes back to automatic, and stays so once saved
    await page.locator('.popup.modal-in .ck-cover-cell[aria-label^="Middle Eastern"]').tap(); await page.waitForTimeout(250);
    await page.locator('.popup.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(900);
    await page.locator(`${CUR} > .navbar a[aria-label="More actions"]`).tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Cover' }).tap(); await page.waitForTimeout(1000);
    if ((await coverNumbers()).join('|') !== 'Mustard Dill Chicken Thighs=1|Corn pudding=2') throw new Error(`saved as ${JSON.stringify(await coverNumbers())}`);
    if ((await previewNumbers()) !== '1 2 3auto') throw new Error(`saved plates read ${await previewNumbers()}`);
    await page.locator('.popup.modal-in a', { hasText: 'Cancel' }).tap(); await page.waitForTimeout(900);
  });
  await step('26b6-colour-changed', async () => {
    await page.locator(`${CUR} > .navbar .link.back`).tap(); await page.waitForTimeout(900);
    const tile = page.locator(`${CUR} .ck-book-tile`, { hasText: 'Everything else' });
    if (!(await tile.getAttribute('class')).includes('ck-tint-lilac')) throw new Error(`the card isn't lilac: ${await tile.getAttribute('class')}`);
    if ((await tile.locator('.ck-plate.ck-photo').count()) !== 3) throw new Error('the card doesn’t show three plates');
    await tile.tap(); await page.waitForTimeout(1000);
  });
  // issue #63: a cookbook's search bar stays under its title too
  // scrolled past the header (issue #90), it's the bar as on Recipes: the header's search bar hands over to the docked
  // one, the title row slides away on scrolling down (the buttons back to grey) and comes back on scrolling up
  await step('26c0-cookbook-search-sticky', async () => {
    const top = () => page.evaluate((cur) => Math.round(document.querySelector(`${cur} .subnavbar .searchbar`)?.getBoundingClientRect().top ?? -1), CUR);
    if ((await top()) < 0) throw new Error('the search bar is not in the bar under the title');
    const pc = await page.locator(`${CUR} > .page-content`).boundingBox();
    await page.mouse.move(pc.x + pc.width / 2, pc.y + 400);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(50); }
    await page.waitForTimeout(600);
    const after = await top();
    const bar = await heroState();
    if (after < 0 || after > 60) throw new Error(`scrolled, the search bar is at ${after}px, not at the top`);
    if (!bar.docked || bar.barBg !== '1' || !bar.hidden) throw new Error(`scrolled, the bar isn't today's (search docked, title row hidden): ${JSON.stringify(bar)}`);
    // only ever one search bar: the header's is hidden once the bar's has taken over (it showed under it on the phone)
    if (bar.heroSearchShown) throw new Error('two search bars: the header’s still shows under the docked one');
    // scrolling back up a little brings the title row back with the title
    await scrollBy(-60);
    const up = await heroState();
    if (up.hidden || up.title !== '1' || !up.docked) throw new Error(`scrolling up, the title row didn't come back: ${JSON.stringify(up)}`);
    if (bar.back === 'rgba(0, 0, 0, 0.45)') throw new Error('scrolled, the buttons are still the dark ones for over a picture');
  });
  await page.evaluate((cur) => document.querySelector(`${cur} > .page-content`).scrollTo(0, 0), CUR);
  await page.waitForTimeout(600);
  await step('26c-cookbook-search', async () => {
    // at the top of a cookbook, the search bar is the header's (issue #90); the bar's docked one shows the same search
    const field = page.locator(`${CUR} .ck-hero-search input`);
    await field.fill('chick'); await page.waitForTimeout(500);
    if ((await page.locator(`${CUR} .ck-search-bar input`).inputValue()) !== 'chick') throw new Error('the docked search bar doesn’t show the same search');
    const found = await cards();
    const count = await page.locator(`${CUR} .ck-count`).textContent();
    // the search covers the sections too
    if (found.length !== 2 || !count.includes('2 of 6 recipes')) throw new Error(`searching shows ${JSON.stringify(found)} with "${count}"`);
    if (await page.locator(`${CUR} .ck-shelf`).count()) throw new Error('the shelves stay while searching');
    await field.fill(''); await field.blur(); await page.waitForTimeout(500);
  });
  await step('26d-section-page', async () => {
    await page.locator(`${CUR} .ck-shelf`, { hasText: 'Meat' }).locator('.ck-shelf-all').tap(); await page.waitForTimeout(1000);
    const sub = await page.locator('.view.tab-active .page-current > .navbar .subtitle').textContent();
    if (sub !== 'Everything else') throw new Error(`the section's subtitle reads "${sub}"`);
    if ((await cards()).length !== 3) throw new Error(`the section shows ${(await cards()).length} recipes`);
  });
  await step('26e-add-recipes', async () => {
    await page.locator(`.view.tab-active .page-current > .navbar a[aria-label="Add recipes"]`).tap(); await page.waitForTimeout(900);
    const ticked = await page.locator('.popup.modal-in .ck-picker-list input:checked').count();
    if (ticked !== 3) throw new Error(`Add Recipes starts with ${ticked} ticked, not the section's 3`);
    const footer = await page.locator('.popup.modal-in li', { hasText: 'Mustard Dill' }).locator('.item-footer').textContent();
    if (footer !== 'In Other') throw new Error(`a recipe in another section says "${footer}"`);
    await page.locator('.popup.modal-in li', { hasText: 'Corn pudding' }).locator('label').tap(); await page.waitForTimeout(300);
  });
  await step('26e2-recipes-added', async () => {
    await page.locator('.popup.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(900);
    const now = await cards();
    if (now.length !== 4 || now[3] !== 'Corn pudding') throw new Error(`after adding, the section shows ${JSON.stringify(now)}`);
  });
  await step('26f-section-more', async () => {
    await page.locator('.view.tab-active .page-current > .navbar a[aria-label="More actions"]').tap(); await page.waitForTimeout(700);
    const items = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (items.join('|') !== 'Add Recipes|Organize|Rename Section|Delete Section|Cancel') throw new Error(`the section menu is ${JSON.stringify(items)}`);
  });
  await step('26g-organize', async () => {
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Organize' }).tap(); await page.waitForTimeout(1000);
    const headings = await page.locator('.popup.modal-in .ck-organize-heading .item-title').allTextContents();
    if (headings.join(',') !== 'Uncategorized,Meat,Other') throw new Error(`Organize's headings are ${JSON.stringify(headings)}`);
    const rows = await page.locator('.popup.modal-in .ck-organize-list li:not(.ck-organize-heading)').count();
    // Uncategorized 2, Meat 4 (Corn pudding is in both), Other 1
    if (rows !== 7) throw new Error(`Organize lists ${rows} recipe rows, expected 7`);
  });
  await step('26g2-organize-removed', async () => {
    // swipe a recipe out of Meat, then Done
    const row = page.locator('.popup.modal-in .ck-organize-list li', { hasText: 'Pulled Beef' });
    const box = await row.boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * 0.6, y }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * 0.6 - 25 * i, y }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); await page.waitForTimeout(500);
    await page.locator('.popup.modal-in .ck-organize-list li', { hasText: 'Pulled Beef' }).locator('.swipeout-delete').tap(); await page.waitForTimeout(800);
    await page.locator('.popup.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(900);
    const now = await cards();
    if (now.includes('Pulled Beef with Parsnip Purée') || now.length !== 3) throw new Error(`after taking it out, the section shows ${JSON.stringify(now)}`);
  });
  await step('26h-new-section', async () => {
    await page.locator('.view.tab-active .page-current > .navbar .link.back').tap(); await page.waitForTimeout(900);
    await page.locator('.view.tab-active .page-current > .navbar a[aria-label="More actions"]').tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'New Section' }).tap(); await page.waitForTimeout(600);
    await prompt('Fish');
    const title = await page.locator('.view.tab-active .page-current > .navbar .title').first().textContent();
    if (!title.includes('Fish')) throw new Error(`a new section opens "${title}"`);
    if (!(await page.locator(`${CUR} .ck-list-state`, { hasText: 'No recipes in this section yet' }).count())) throw new Error('an empty section doesn’t say so');
  });
  await step('26i-add-to-cookbook', async () => {
    await page.locator('.tabbar a[aria-label="Recipes"]').tap(); await page.waitForTimeout(800);
    await page.locator(`${CUR} .ck-card`, { hasText: 'Corn pudding' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.view.tab-active .navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Add to Cookbook' }).tap(); await page.waitForTimeout(1000);
    // a row's name without its footer line (Framework7's iOS lists put the footer inside .item-title)
    const rows = await page.locator('.popup.modal-in .ck-addto-list li .item-title').evaluateAll((ts) => ts.map((t) => [...t.childNodes].filter((n) => !n.classList?.contains('item-footer')).map((n) => n.textContent).join('').trim()));
    if (rows.join(',') !== 'Dressings and sauces,Everything else,Uncategorized,Meat,Other,Fish,Grilling') throw new Error(`Add to Cookbook lists ${JSON.stringify(rows)}`);
    const checked = await page.evaluate(() => [...document.querySelectorAll('.popup.modal-in .ck-addto-list li')].filter((li) => li.querySelector(':scope > label input:checked')).map((li) => li.querySelector('.item-title').textContent));
    if (checked.join(',') !== 'Uncategorized,Meat') throw new Error(`Corn pudding is ticked in ${JSON.stringify(checked)}`);
    // #83: a cookbook with sections is a closed accordion row; closed, it says where the recipe is
    const book = page.locator('.popup.modal-in .ck-addto-list li.ck-addto-book', { hasText: 'Everything else' });
    if (!(await book.evaluate((li) => li.classList.contains('accordion-item') && !li.classList.contains('accordion-item-opened')))) throw new Error('Everything else doesn’t start as a closed accordion row');
    const folded = await page.locator('.popup.modal-in .ck-addto-list .accordion-item-content').evaluateAll((cs) => cs.every((c) => c.getBoundingClientRect().height === 0));
    if (!folded) throw new Error('sections show before their cookbook is opened');
    const where = (await book.locator('.item-footer').first().textContent()).trim();
    if (where !== 'In Uncategorized, Meat') throw new Error(`the closed cookbook reads "${where}"`);
  });
  await step('26i0-add-to-cookbook-opened', async () => {
    const book = page.locator('.popup.modal-in .ck-addto-list li.ck-addto-book', { hasText: 'Everything else' });
    await book.locator('.item-link').first().tap(); await page.waitForTimeout(700);
    if (!(await book.locator('.accordion-item-content').evaluate((c) => c.getBoundingClientRect().height > 100))) throw new Error('tapping Everything else didn’t open its sections');
    const shown = await book.locator('li.ck-addto-section .item-title').allTextContents();
    if (shown.join(',') !== 'Uncategorized,Meat,Other,Fish') throw new Error(`opening Everything else shows ${JSON.stringify(shown)}`);
    // its last section keeps the hairline before the next cookbook
    const line = await book.locator('li.ck-addto-section').last().evaluate((li) => getComputedStyle(li.querySelector('.item-inner'), '::after').display);
    if (line === 'none') throw new Error('no hairline between the last section and the next cookbook');
  });
  // nothing changes until Done: Cancel leaves it as it was
  await step('26i2-add-to-cookbook-cancel', async () => {
    await page.locator('.popup.modal-in .ck-addto-list li', { hasText: 'Dressings and sauces' }).locator('label').tap(); await page.waitForTimeout(500);
    await page.locator('.popup.modal-in a', { hasText: 'Cancel' }).tap(); await page.waitForTimeout(900);
    await page.locator('.view.tab-active .navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Add to Cookbook' }).tap(); await page.waitForTimeout(1000);
    const ticked = await page.locator('.popup.modal-in .ck-addto-list li', { hasText: 'Dressings and sauces' }).locator('input:checked').count();
    if (ticked) throw new Error('Cancel kept the tick on Dressings and sauces');
  });
  await step('26i3-added-to-cookbook', async () => {
    await page.locator('.popup.modal-in .ck-addto-list li', { hasText: 'Grilling' }).locator('label').tap(); await page.waitForTimeout(500);
    await page.locator('.popup.modal-in a', { hasText: 'Done' }).tap(); await page.waitForTimeout(700);
    // leaving Cookbooks took it back to its first page, so it shows the cookbooks again
    await page.locator('.tabbar a[aria-label="Cookbooks"]').tap(); await page.waitForTimeout(900);
    const grilling = await page.locator(`${CUR} .ck-book-tile`, { hasText: 'Grilling' }).locator('.ck-book-meta').textContent();
    if (grilling.trim() !== '3 recipes') throw new Error(`Grilling reads "${grilling}" after adding Corn pudding`);
    const dressings = await page.locator(`${CUR} .ck-book-tile`, { hasText: 'Dressings' }).locator('.ck-book-meta').textContent();
    if (dressings.trim() !== '0 recipes') throw new Error(`Dressings and sauces reads "${dressings}" after Cancel`);
  });
  await step('26j-new-cookbook', async () => {
    await page.locator('.view.tab-active .page-current > .navbar a[aria-label="New cookbook"]').tap(); await page.waitForTimeout(600);
    await prompt('Soups');
    if (!(await page.locator(`${CUR} .ck-list-state`, { hasText: 'No recipes in this cookbook yet' }).count())) throw new Error('a new cookbook doesn’t open, empty');
  });
  await step('26k-delete-cookbook', async () => {
    await page.locator('.view.tab-active .page-current > .navbar a[aria-label="More actions"]').tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Delete Cookbook' }).tap(); await page.waitForTimeout(600);
    await page.locator('.dialog.modal-in .dialog-button', { hasText: 'OK' }).tap(); await page.waitForTimeout(1000);
    const tiles = await page.locator(`${CUR} .ck-book-tile .ck-book-name`).allTextContents();
    if (tiles.includes('Soups') || tiles.length !== 3) throw new Error(`after deleting, the cookbooks are ${JSON.stringify(tiles)}`);
  });

  // Issue #41: a recipe's page ends with where it belongs (labels, then the cookbooks and sections it's in, as chips) and
  // its source; the header is the title alone
  await step('41a-recipe-belongs', async () => {
    await page.locator('.tabbar a[aria-label="Recipes"]').tap(); await page.waitForTimeout(800);
    await page.locator(`${CUR} .ck-card`, { hasText: 'Corn pudding' }).tap(); await page.waitForTimeout(1000);
    if (await page.locator(`${CUR} .ck-panel-head .ck-note`).count()) throw new Error('the header still has a line under the title');
    await page.evaluate(() => { const pc = document.querySelector('.view.tab-active .page-current .page-content'); pc.scrollTop = pc.scrollHeight; });
    await page.waitForTimeout(500);
    const sections = (await page.locator(`${CUR} .ck-panel-rest .ck-sec h2`).allTextContents()).join(',');
    if (sections !== 'Directions,Notes,Labels,Cookbooks,Planned,Source') throw new Error(`the page ends with ${sections}`);
    const labels = (await page.locator(`${CUR} .ck-belongs .chip:not(.ck-book-chip):not(.ck-plan-chip)`).allTextContents()).join(',');
    if (labels !== 'Side,Dessert,Holiday') throw new Error(`the labels are ${labels}`);
    const books = (await page.locator(`${CUR} .ck-book-chip`).allTextContents()).join(',');
    if (books !== 'Everything else,Everything else · Meat,Grilling') throw new Error(`the cookbook chips are ${books}`);
    if ((await page.locator(`${CUR} .ck-book-chip[class*="ck-tint-"]`).count()) !== 3) throw new Error('the cookbook chips have no colour');
    const source = await page.locator(`${CUR} .ck-source`).textContent();
    if (source.trim() !== 'My recipe') throw new Error(`the source reads "${source}"`);
  });
  await step('41b-cookbook-chip-opens', async () => {
    await page.locator(`${CUR} .ck-book-chip`, { hasText: 'Meat' }).tap(); await page.waitForTimeout(1000);
    const title = await page.locator(`${CUR} > .navbar .title`).first().textContent();
    if (!title.includes('Meat')) throw new Error(`the Meat chip opened "${title}"`);
    await page.locator(`${CUR} > .navbar .back`).tap(); await page.waitForTimeout(900);
  });
  await step('41c-label-chip-filters', async () => {
    await page.evaluate(() => { const pc = document.querySelector('.view.tab-active .page-current .page-content'); pc.scrollTop = pc.scrollHeight; });
    await page.waitForTimeout(400);
    await page.locator(`${CUR} .ck-belongs .chip`, { hasText: 'Dessert' }).tap(); await page.waitForTimeout(1000);
    const on = (await page.locator(`${CUR} .ck-chips .chip.ck-chip-on`).allTextContents()).join(',');
    if (on !== 'Dessert') throw new Error(`the Dessert label left Recipes filtered by "${on}"`);
    if ((await page.locator('#view-recipes > .page').count()) !== 1) throw new Error('the label didn’t go back to the recipe list');
    await page.locator(`${CUR} .ck-chips .chip`, { hasText: 'All' }).first().tap(); await page.waitForTimeout(600);
  });

  // One browser history for every tab: a page deep in two tabs at once made one back move both. Leaving a tab now takes
  // it back to its first page, so back only ever moves the tab shown.
  await step('26l-tabs-back', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.tabbar a[aria-label="Settings"]').tap(); await page.waitForTimeout(800);
    await page.locator('#view-settings .page-current a', { hasText: 'Cookbook' }).tap(); await page.waitForTimeout(900);
    await page.locator('.tabbar a[aria-label="Cookbooks"]').tap(); await page.waitForTimeout(800);
    await page.locator('#view-cookbooks .page-current .ck-book-tile', { hasText: 'Everything else' }).tap(); await page.waitForTimeout(900);
    const settingsPages = await page.locator('#view-settings > .page').count();
    if (settingsPages !== 1) throw new Error(`leaving Settings left ${settingsPages} pages in it, not its first page`);
    await page.locator('.tabbar a[aria-label="Recipes"]').tap(); await page.waitForTimeout(800);
    await page.locator('.tabbar a[aria-label="Cookbooks"]').tap(); await page.waitForTimeout(800);
    // coming back, Cookbooks starts at its first page
    const books = await page.locator('#view-cookbooks > .page').filter({ has: page.locator('.ck-book-tile') }).count();
    if (!books || (await page.locator('#view-cookbooks .page-current .ck-book-tile').count()) !== 3) throw new Error('coming back to Cookbooks doesn’t show the cookbooks');
    await page.locator('#view-cookbooks .page-current .ck-book-tile', { hasText: 'Grilling' }).tap(); await page.waitForTimeout(900);
    await page.goBack(); await page.waitForTimeout(900);
    if (!page.url().startsWith(BASE)) throw new Error(`back left the app for ${page.url()}`);
    if ((await page.locator('#view-cookbooks .page-current .ck-book-tile').count()) !== 3) throw new Error('back from a cookbook didn’t return to the cookbooks');
    if ((await page.locator('#view-settings > .page').count()) !== 1) throw new Error('back in Cookbooks moved Settings');
  });

  // A cookbook or section just made stays, even when the list is reloaded from the server before the save lands (#25: on
  // the phone a new cookbook flipped to "not found", and its header vanished). ?slow makes every demo call take 0.6s.
  await step('26m-new-cookbook-slow', async () => {
    await page.goto(`${BASE}?slow`); await page.waitForSelector('#view-recipes .ck-card', { timeout: 10000 });
    await page.locator('.tabbar a[aria-label="Cookbooks"]').tap(); await page.waitForSelector('#view-cookbooks .page-current .ck-book-tile', { timeout: 10000 });
    await page.locator('#view-cookbooks .page-current > .navbar a[aria-label="New cookbook"]').tap(); await page.waitForTimeout(600);
    await prompt('Slow soups');
    const seen = [];
    for (let i = 0; i < 12; i++) {
      seen.push(await page.evaluate(() => {
        const pg = document.querySelector('#view-cookbooks .page-current');
        return `${pg.querySelector(':scope > .navbar .title')?.textContent}|${!!pg.querySelector('.searchbar')}`;
      }));
      await page.waitForTimeout(250);
    }
    if (seen.some((x) => x !== 'Slow soups|true')) throw new Error(`while saving, the new cookbook's page showed ${JSON.stringify([...new Set(seen)])}`);
    await page.locator('#view-cookbooks .page-current > .navbar a[aria-label="More actions"]').tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'New Section' }).tap(); await page.waitForTimeout(600);
    await prompt('Section 1');
    const seen2 = [];
    for (let i = 0; i < 12; i++) {
      seen2.push(await page.evaluate(() => {
        const pg = document.querySelector('#view-cookbooks .page-current');
        return `${pg.querySelector(':scope > .navbar .title')?.textContent}|${!!pg.querySelector('.searchbar')}`;
      }));
      await page.waitForTimeout(250);
    }
    if (seen2.some((x) => !x.startsWith('Section 1') || !x.endsWith('|true'))) throw new Error(`while saving, the new section's page showed ${JSON.stringify([...new Set(seen2)])}`);
  });

  // ── Planner (issue #62): the Plan tab, from a fresh start. The demo plans two recipes today, one tomorrow, one the
  // day after and one a week from today. A week's strip stays under the title with today picked; below it the agenda. ──
  const PLAN = '#view-plan .page-current';
  const dayKey = (n) => page.evaluate((n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }, n);
  // a row's title without its time (Framework7 puts the footer inside the title)
  const rowsOn = (day) => page.locator(`${PLAN} .ck-plan-day[data-day="${day}"] .ck-plan-list .item-title`).evaluateAll((els) => els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
  const shortLabel = (day) => page.evaluate((day) => { const [y, m, d] = day.split('-').map(Number); return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d)); }, day);
  const pickInCalendar = async (day) => {
    await page.waitForSelector('.calendar.modal-in');
    const [y, m, d] = day.split('-').map(Number);
    // Framework7's calendar names a day by year, 0-based month and day; the month shown may need a swipe to the next
    const cell = page.locator(`.calendar.modal-in .calendar-month-current .calendar-day[data-date="${y}-${m - 1}-${d}"]`);
    if (!(await cell.count())) { await page.locator('.calendar.modal-in .calendar-next-month-button, .calendar.modal-in .icon-next').first().tap(); await page.waitForTimeout(500); }
    await cell.tap();
    // issue #67: the tapped day fills in before the sheet closes
    await page.waitForTimeout(120);
    if (!(await cell.evaluate((e) => e.classList.contains('calendar-day-selected')))) throw new Error('the tapped day didn’t fill in');
    await page.waitForTimeout(1000);
  };
  let today0, today1, today7;
  await step('62a-planner', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.tabbar a[aria-label="Plan"]').tap(); await page.waitForTimeout(900);
    [today0, today1, today7] = [await dayKey(0), await dayKey(1), await dayKey(7)];
    if ((await page.locator(`${PLAN} > .navbar .title`).textContent()) !== 'Planner') throw new Error('the Plan tab isn’t titled Planner');
    const label = await page.locator(`${PLAN} .ck-week-label`).textContent();
    if (!label.startsWith('This week · ')) throw new Error(`the week reads "${label}"`);
    // today is picked at first and filled in Tomato ink; the strip runs Monday to Sunday
    const sel = page.locator(`${PLAN} .swiper-slide-active .ck-week-day.ck-week-selected`);
    if ((await sel.count()) !== 1 || !(await sel.getAttribute('class')).includes('ck-week-today')) throw new Error('today isn’t the picked day');
    const fill = await sel.locator('.ck-week-num').evaluate((e) => getComputedStyle(e).backgroundColor);
    if (fill !== 'rgb(228, 87, 46)') throw new Error(`today picked is filled ${fill}, not bright Tomato like the +`);
    // the other days' dates are dark (a day is a link: it once took the links' Tomato)
    const plain = await page.locator(`${PLAN} .swiper-slide-active .ck-week-day:not(.ck-week-today):not(.ck-week-selected) .ck-week-num`).first().evaluate((e) => getComputedStyle(e).color);
    if (plain !== 'rgb(38, 38, 40)') throw new Error(`another day's date is ${plain}, not dark`);
    const letters = await page.locator(`${PLAN} .swiper-slide-active .ck-week-letter`).allTextContents();
    if (letters.join('') !== 'MTWTFSS') throw new Error(`the strip's days are ${letters.join('')}`);
    // the strip is docked flat and full width under the title (not Framework7 v9's floating glass capsule)
    const bar = await page.locator(`${PLAN} .subnavbar`).evaluate((e) => ({ r: getComputedStyle(e).borderRadius, w: e.getBoundingClientRect().width, bg: getComputedStyle(e).backgroundColor }));
    if (bar.r !== '0px' || Math.abs(bar.w - 393) > 1 || bar.bg === 'rgba(0, 0, 0, 0)') throw new Error(`the strip's bar is ${JSON.stringify(bar)}`);
    // issue #67: a day's items for the whole day first, then by meal, each meal labelled
    if ((await rowsOn(today0)).join() !== 'Corn pudding,Mustard Dill Chicken Thighs') throw new Error(`today shows ${JSON.stringify(await rowsOn(today0))}`);
    const slots = await page.locator(`${PLAN} .ck-plan-day[data-day="${today0}"] .ck-plan-slot-label`).allTextContents();
    if (slots.join() !== 'Dinner') throw new Error(`today's meal labels are ${JSON.stringify(slots)}`);
    // the strip ends in a clear line and a soft shadow over the agenda (#67)
    const edge = await page.locator(`${PLAN} .subnavbar`).evaluate((e) => ({ shadow: getComputedStyle(e).boxShadow, line: getComputedStyle(e, '::after').backgroundColor }));
    if (edge.shadow === 'none' || edge.line !== 'rgb(201, 201, 206)') throw new Error(`the strip's edge is ${JSON.stringify(edge)}`);
    // issue #84: room to breathe under the title row, between the week line and the days, under the dots, and before
    // the first day
    const room = await page.locator(PLAN).evaluate((p) => {
      const r = (sel) => p.querySelector(sel).getBoundingClientRect();
      const nav = p.querySelector(':scope > .navbar');
      const titleRow = nav.getBoundingClientRect().top + nav.offsetHeight;
      return {
        underTitle: Math.round(r('.ck-week-label').top - titleRow),
        toDays: Math.round(r('.swiper-slide-active .ck-week-letter').top - r('.ck-week-label').bottom),
        underDots: Math.round(r('.subnavbar').bottom - r('.swiper-slide-active .ck-week-dot').bottom),
        // the agenda opens scrolled to today
        toFirstDay: Math.round(r('.ck-plan-day-today').top - r('.subnavbar').bottom),
      };
    });
    if (room.underTitle < 10 || room.toDays < 12 || room.underDots < 14 || room.toFirstDay < 16) throw new Error(`the Planner's header is crowded: ${JSON.stringify(room)}`);
    if ((await page.locator(`${PLAN} .ck-plan-day-today h2`).textContent()).trim().split(' ')[0] !== 'Today') throw new Error('today’s heading doesn’t say Today');
    // days with something planned have a dot
    if (!(await page.locator(`${PLAN} .swiper-slide-active .ck-week-day.ck-week-today.ck-week-busy`).count())) throw new Error('today has no dot');
    if (await page.locator(`${PLAN} .navbar a.ck-plan-today`).count()) throw new Error('Today shows while today is picked');
  });
  // picking another day fills it dark (today stays Tomato), scrolls the agenda to it, and offers Today to come back
  await step('62b-planner-pick-day', async () => {
    const target = await page.locator(`${PLAN} .swiper-slide-active .ck-week-day:not(.ck-week-today)`).last();
    await target.tap(); await page.waitForTimeout(900);
    if (!(await target.getAttribute('class')).includes('ck-week-selected')) throw new Error('the tapped day isn’t picked');
    const fill = await target.locator('.ck-week-num').evaluate((e) => getComputedStyle(e).backgroundColor);
    if (fill !== 'rgb(38, 38, 40)') throw new Error(`a picked day is filled ${fill}, not dark`);
    if (!(await page.locator(`${PLAN} .navbar a.ck-plan-today`).isVisible())) throw new Error('no Today button');
  });
  // swiping the strip shows the next week and picks the same weekday there; next week holds the recipe planned a week on
  await step('62c-planner-next-week', async () => {
    await page.locator(`${PLAN} .navbar a.ck-plan-today`).tap(); await page.waitForTimeout(800);
    // most of the way across, as the photo swipe (17c): Swiper only counts a short drag when it's quick
    const strip = await page.locator(`${PLAN} .ck-week-swiper`).boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const at = (x) => [{ x, y: strip.y + strip.height / 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(340) });
    for (let x = 320; x >= 60; x -= 20) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x) }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(900);
    const label = await page.locator(`${PLAN} .ck-week-label`).textContent();
    if (!label.startsWith('Next week · ')) throw new Error(`after a swipe the week reads "${label}"`);
    const picked = await page.locator(`${PLAN} .swiper-slide-active .ck-week-day.ck-week-selected`).getAttribute('aria-label');
    if (!picked.includes(await shortLabel(today7))) throw new Error(`picked "${picked}", not a week from today`);
    if ((await rowsOn(today7)).join() !== 'Italian Turkey Zucchini Meatballs') throw new Error(`a week from today shows ${JSON.stringify(await rowsOn(today7))}`);
  });
  await step('62d-planner-today', async () => {
    await page.locator(`${PLAN} .navbar a.ck-plan-today`).tap(); await page.waitForTimeout(900);
    if (!(await page.locator(`${PLAN} .ck-week-label`).textContent()).startsWith('This week')) throw new Error('Today didn’t come back to this week');
    if (!(await page.locator(`${PLAN} .swiper-slide-active .ck-week-day.ck-week-today.ck-week-selected`).count())) throw new Error('Today didn’t pick today');
  });
  // + adds to the picked day: recipes or a note (#67), then the recipe picker with a meal choice, ticks, Done
  await step('62e0-planner-add-menu', async () => {
    await page.locator(`${PLAN} > .navbar a.ck-nav-primary`).tap(); await page.waitForTimeout(700);
    const buttons = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (buttons.join() !== 'Recipes,A note,Cancel') throw new Error(`+ offers ${JSON.stringify(buttons)}`);
  });
  await step('62e-planner-add', async () => {
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Recipes' }).tap(); await page.waitForTimeout(900);
    if ((await page.locator('.popup.modal-in .navbar .title').textContent()) !== 'Add to Today') throw new Error('the picker isn’t titled Add to Today');
    const meals = await page.locator('.popup.modal-in .ck-meal-choice .button').allTextContents();
    if (meals.join() !== 'Any time,Breakfast,Lunch,Dinner') throw new Error(`the meal choice is ${JSON.stringify(meals)}`);
    await page.locator('.popup.modal-in .ck-meal-choice .button', { hasText: 'Dinner' }).tap(); await page.waitForTimeout(300);
    const already = await page.locator('.popup.modal-in li', { hasText: 'Corn pudding' }).locator('.item-footer').textContent();
    if (already !== 'Already planned that day') throw new Error(`a recipe planned today says "${already}"`);
    await page.locator('.popup.modal-in li', { hasText: 'Tahini Sauce' }).locator('label').tap(); await page.waitForTimeout(300);
  });
  await step('62f-planner-added', async () => {
    await page.locator('.popup.modal-in .navbar a', { hasText: 'Done' }).tap(); await page.waitForTimeout(900);
    if ((await rowsOn(today0)).join() !== 'Corn pudding,Mustard Dill Chicken Thighs,Tahini Sauce') throw new Error(`today shows ${JSON.stringify(await rowsOn(today0))}`);
    const dinner = await page.locator(`${PLAN} .ck-plan-day[data-day="${today0}"] .ck-plan-slot`, { hasText: 'Dinner' }).locator('.item-title').count();
    if (dinner !== 2) throw new Error(`today's Dinner has ${dinner} rows, not 2 (Tahini Sauce wasn't added to Dinner)`);
  });
  // swiping a row offers Move and Remove
  await step('62g-planner-swipe-row', async () => {
    await swipeLeft(ctx, page, page.locator(`${PLAN} .ck-plan-day[data-day="${today0}"] li.swipeout`, { hasText: 'Tahini Sauce' }));
    await page.waitForTimeout(700);
    if (!(await page.locator(`${PLAN} li.swipeout-opened .ck-plan-move`).isVisible())) throw new Error('no Move button');
    if (!(await page.locator(`${PLAN} li.swipeout-opened .ck-plan-meal`).isVisible())) throw new Error('no Meal button');
  });
  // Move picks another day from a month calendar (today in Tomato, dots on planned days)
  await step('62h-planner-move-calendar', async () => {
    await page.locator(`${PLAN} li.swipeout-opened .ck-plan-move`).tap(); await page.waitForTimeout(900);
    if (!(await page.locator('.calendar.ck-calendar.modal-in').isVisible())) throw new Error('no calendar');
    if ((await page.locator('.calendar.modal-in .calendar-header').textContent()).trim() !== 'Move to which day?') throw new Error('the calendar isn’t titled Move to which day?');
    // the month in full (#67: it was cut short)
    const month = await page.locator('.calendar.modal-in .current-month-value').evaluate((e) => ({ text: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 }));
    if (month.cut) throw new Error(`the month "${month.text}" is cut short`);
    if ((await page.locator('.calendar.modal-in .calendar-month-current .calendar-day-event').count()) < 2) throw new Error('no dots on planned days');
    // a day looks the same here as in the week strip, in every state: plain, today, picked, and today picked. The
    // circle's size and fill, the number's font, weight and colour, and the dot's size and gap under the circle.
    // (They differed: 36px circles in a lighter font, dots 1px under them, and a picked day bolder in the calendar.)
    // Each state is set on a plain day with a dot in each, by its own classes, measured, then put back.
    const looks = await page.evaluate(() => {
      const strip = document.querySelector('.ck-week-day.ck-week-busy:not(.ck-week-today):not(.ck-week-selected)');
      const cal = [...document.querySelectorAll('.calendar.modal-in .calendar-month-current .calendar-day:not(.calendar-day-today):not(.calendar-day-selected)')].find((d) => d.querySelector('.calendar-day-event'));
      const look = (num, dot) => {
        const n = num.getBoundingClientRect(), d = dot.getBoundingClientRect(), cs = getComputedStyle(num);
        return { circle: Math.round(n.width), fill: cs.backgroundColor, font: `${cs.fontFamily.split(',')[0]} ${cs.fontSize} ${cs.fontWeight}`, color: cs.color, dot: Math.round(d.width), gap: Math.round(d.top - n.bottom) };
      };
      const out = [];
      for (const state of [[], ['today'], ['selected'], ['today', 'selected']]) {
        const sc = state.map((x) => `ck-week-${x}`), cc = state.map((x) => `calendar-day-${x}`);
        strip.classList.add(...sc); cal.classList.add(...cc);
        const a = look(strip.querySelector('.ck-week-num'), strip.querySelector('.ck-week-dot'));
        const b = look(cal.querySelector('.calendar-day-number'), cal.querySelector('.calendar-day-event'));
        strip.classList.remove(...sc); cal.classList.remove(...cc);
        if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${state.join(' + ') || 'plain'}: strip ${JSON.stringify(a)} vs calendar ${JSON.stringify(b)}`);
      }
      return out;
    });
    if (looks.length) throw new Error(`a day in the strip and in the calendar differ: ${looks.join('; ')}`);
  });
  await step('62i-planner-moved', async () => {
    await pickInCalendar(today1);
    if ((await rowsOn(today0)).includes('Tahini Sauce')) throw new Error('still today after Move');
    if (!(await rowsOn(today1)).includes('Tahini Sauce')) throw new Error(`tomorrow shows ${JSON.stringify(await rowsOn(today1))}`);
  });
  await step('62j-planner-removed', async () => {
    await swipeLeft(ctx, page, page.locator(`${PLAN} .ck-plan-day[data-day="${today1}"] li.swipeout`, { hasText: 'Tahini Sauce' }));
    await page.waitForTimeout(700);
    await page.locator(`${PLAN} li.swipeout-opened .swipeout-delete`).tap(); await page.waitForTimeout(900);
    if ((await rowsOn(today1)).includes('Tahini Sauce')) throw new Error('Remove left it there');
  });
  // a recipe's page lists the days it's planned for; its ⋯ menu adds it to another day
  await step('62k-recipe-planned', async () => {
    await page.locator(`${PLAN} .ck-plan-day[data-day="${today0}"] li`, { hasText: 'Corn pudding' }).locator('a.item-link').tap(); await page.waitForTimeout(1200);
    await page.locator(`${PLAN} > .page-content`).evaluate((e) => e.scrollTo(0, e.scrollHeight)); await page.waitForTimeout(500);
    const chips = await page.locator(`${PLAN} .ck-plan-chip`).allTextContents();
    if (chips.join() !== 'Today') throw new Error(`Planned shows ${JSON.stringify(chips)}`);
  });
  await step('62l-recipe-add-to-planner', async () => {
    await page.locator(`${PLAN} > .navbar a[aria-label="More actions"]`).tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Add to Planner' }).tap(); await page.waitForTimeout(900);
    if ((await page.locator('.calendar.modal-in .calendar-header').textContent()).trim() !== 'Plan for which day?') throw new Error('the calendar isn’t titled Plan for which day?');
  });
  // after the day, which meal (#67)
  await step('62l2-recipe-which-meal', async () => {
    await pickInCalendar(today7);
    const buttons = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (buttons.join() !== 'Breakfast,Lunch,Dinner,Any time,Cancel') throw new Error(`the meal sheet offers ${JSON.stringify(buttons)}`);
  });
  await step('62m-recipe-added-to-planner', async () => {
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Lunch' }).tap(); await page.waitForTimeout(900);
    const chips = await page.locator(`${PLAN} .ck-plan-chip`).allTextContents();
    if (chips.length !== 2 || chips[1] !== (await shortLabel(today7))) throw new Error(`Planned shows ${JSON.stringify(chips)}`);
  });
  // a Planned chip opens the Planner on that day
  await step('62n-planned-chip', async () => {
    await page.locator(`${PLAN} .ck-plan-chip`).nth(1).tap(); await page.waitForTimeout(1200);
    if ((await page.locator(`${PLAN} > .navbar .title`).textContent()) !== 'Planner') throw new Error('the chip didn’t go back to the Planner');
    const picked = await page.locator(`${PLAN} .swiper-slide-active .ck-week-day.ck-week-selected`).getAttribute('aria-label');
    if (!picked.includes(await shortLabel(today7))) throw new Error(`the Planner picked "${picked}"`);
    if (!(await rowsOn(today7)).includes('Corn pudding')) throw new Error(`that day shows ${JSON.stringify(await rowsOn(today7))}`);
    const lunch = await page.locator(`${PLAN} .ck-plan-day[data-day="${today7}"] .ck-plan-slot`, { hasText: 'Lunch' }).count();
    if (!lunch) throw new Error('it wasn’t added to Lunch');
  });

  // ── Planner improvements (issue #67) ──
  // tomorrow: kebabs for lunch at 8 servings (changed on the recipe page when planned), and a note for dinner
  await step('67a-planner-servings-and-note', async () => {
    await page.locator(`${PLAN} .navbar a.ck-plan-today`).tap(); await page.waitForTimeout(900);
    const kebabs = page.locator(`${PLAN} .ck-plan-day[data-day="${today1}"] li`, { hasText: 'Kebabs' });
    const meta = await kebabs.locator('.item-footer').textContent();
    if (!meta.startsWith('8 servings')) throw new Error(`the kebabs read "${meta}", not 8 servings`);
    const note = page.locator(`${PLAN} .ck-plan-day[data-day="${today1}"] .ck-plan-slot`, { hasText: 'Dinner' }).locator('li.ck-plan-note');
    if ((await note.locator('.item-title').textContent()).trim() !== 'Eating out with Sam') throw new Error('no note at dinner tomorrow');
  });
  // a planned recipe opens at its planned servings
  await step('67b-planner-opens-at-servings', async () => {
    await page.locator(`${PLAN} .ck-plan-day[data-day="${today1}"] li`, { hasText: 'Kebabs' }).locator('a.item-link').tap(); await page.waitForTimeout(1200);
    const pill = await page.locator(`${PLAN} .ck-scale-button`).textContent();
    if (!pill.includes('8 servings')) throw new Error(`the recipe opened at "${pill}"`);
  });
  // ... and adding it to the Planner from there keeps those servings
  await step('67c-recipe-adds-servings', async () => {
    await page.locator(`${PLAN} > .navbar a[aria-label="More actions"]`).tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Add to Planner' }).tap(); await page.waitForTimeout(900);
    await pickInCalendar(today0);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Any time' }).tap(); await page.waitForTimeout(900);
    await page.locator(`${PLAN} > .navbar a.back`).tap(); await page.waitForTimeout(1200);
    const meta = await page.locator(`${PLAN} .ck-plan-day[data-day="${today0}"] li`, { hasText: 'Kebabs' }).locator('.item-footer').textContent();
    if (!meta.startsWith('8 servings')) throw new Error(`added from the recipe page, it reads "${meta}"`);
  });
  // a note for a day: + → A note
  await step('67d-planner-add-note', async () => {
    await page.locator(`${PLAN} .ck-plan-day[data-day="${today0}"] .ck-plan-add`).tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'A note' }).tap();
    await page.waitForSelector('.dialog.modal-in input');
    await page.locator('.dialog.modal-in input').fill('Leftovers for lunch');
  });
  await step('67e-planner-note-added', async () => {
    await page.locator('.dialog.modal-in .dialog-button', { hasText: 'OK' }).tap(); await page.waitForTimeout(900);
    if (!(await rowsOn(today0)).includes('Leftovers for lunch')) throw new Error(`today shows ${JSON.stringify(await rowsOn(today0))}`);
  });
  // swipe → Meal puts it in a slot
  await step('67f-planner-meal-sheet', async () => {
    await swipeLeft(ctx, page, page.locator(`${PLAN} .ck-plan-day[data-day="${today0}"] li.swipeout`, { hasText: 'Leftovers' }));
    await page.waitForTimeout(700);
    await page.locator(`${PLAN} li.swipeout-opened .ck-plan-meal`).tap(); await page.waitForTimeout(800);
    const buttons = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (buttons.join() !== 'Breakfast,Lunch,Dinner,Any time,Cancel') throw new Error(`Meal offers ${JSON.stringify(buttons)}`);
  });
  await step('67g-planner-in-lunch', async () => {
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Lunch' }).tap(); await page.waitForTimeout(900);
    const lunch = await page.locator(`${PLAN} .ck-plan-day[data-day="${today0}"] .ck-plan-slot`, { hasText: 'Lunch' }).locator('.item-title').allTextContents();
    if (!lunch.some((t) => t.includes('Leftovers'))) throw new Error(`today's Lunch shows ${JSON.stringify(lunch)}`);
  });
  // the strip follows the agenda: scrolling picks the day at the top, and the last day at the end
  await step('67h-strip-follows-scroll', async () => {
    const day2 = await dayKey(2);
    const inWeek = await page.locator(`${PLAN} .ck-plan-day[data-day="${day2}"]`).count();
    const target = inWeek ? day2 : today0;
    await page.waitForTimeout(1000);
    await page.locator(`${PLAN} > .page-content`).evaluate((c, d) => {
      const el = c.querySelector(`[data-day="${d}"]`);
      c.scrollTop += el.getBoundingClientRect().top - c.getBoundingClientRect().top - parseFloat(getComputedStyle(c).paddingTop) + 2;
    }, target);
    await page.waitForTimeout(600);
    const picked = await page.locator(`${PLAN} .swiper-slide-active .ck-week-day.ck-week-selected`).getAttribute('aria-label');
    if (!picked.includes(await shortLabel(target))) throw new Error(`scrolled to ${target}, the strip picked "${picked}"`);
  });
  // the last day has room after it, so scrolling to the end brings it up under the strip and picks it
  await step('67i-strip-follows-to-the-end', async () => {
    await page.locator(`${PLAN} > .page-content`).evaluate((c) => { c.scrollTop = c.scrollHeight; });
    await page.waitForTimeout(600);
    const last = await page.locator(`${PLAN} .ck-plan-day`).last().getAttribute('data-day');
    const picked = await page.locator(`${PLAN} .swiper-slide-active .ck-week-day.ck-week-selected`).getAttribute('aria-label');
    if (!picked.includes(await shortLabel(last))) throw new Error(`at the end, the strip picked "${picked}"`);
  });
  // follow-up to #67: one Tomato for today's filled date and the +, recipe names in semibold, empty days muted, lighter
  // day names, the thumbnail as far from the card's edge on the left as above and below, no line under a card's last row
  await step('67j-planner-look', async () => {
    // Today scrolls the agenda back to today (scrolling to the top instead would pick Monday)
    await page.locator(`${PLAN} .navbar a.ck-plan-today`).tap(); await page.waitForTimeout(1200);
    const look = await page.locator(PLAN).evaluate((pg) => {
      const css = (sel, prop) => { const e = pg.querySelector(sel); return e && getComputedStyle(e)[prop]; };
      const li = pg.querySelector('.ck-plan-list li:not(.ck-plan-note)');
      const c = li.querySelector('.item-content').getBoundingClientRect(), m = li.querySelector('.ck-picker-thumb').getBoundingClientRect();
      return {
        todayFill: css('.swiper-slide-active .ck-week-today.ck-week-selected .ck-week-num', 'backgroundColor'),
        plus: css('.navbar .ck-nav-primary', 'backgroundColor'),
        title: css('.ck-plan-list li:not(.ck-plan-note) .item-title', 'fontWeight'),
        dayName: css('.ck-plan-day-head h2', 'fontWeight'),
        empty: css('.ck-plan-day-empty:not(.ck-plan-day-today) h2', 'color'),
        busy: css('.ck-plan-day:not(.ck-plan-day-empty):not(.ck-plan-day-today) h2', 'color'),
        gaps: [m.left - c.left, m.top - c.top, c.bottom - m.bottom].map(Math.round),
        lastLine: getComputedStyle(pg.querySelector('.ck-plan-list li:last-child .item-inner'), '::after').display,
      };
    });
    if (look.todayFill !== look.plus) throw new Error(`today's date is ${look.todayFill}, the + is ${look.plus}`);
    if (look.title !== '600') throw new Error(`a recipe's name is weight ${look.title}`);
    if (look.dayName !== '500') throw new Error(`a day's name is weight ${look.dayName}`);
    if (look.empty !== 'rgb(110, 110, 115)') throw new Error(`an empty day's name is ${look.empty}, not muted`);
    if (look.busy === look.empty) throw new Error('a day with plans is as dim as an empty one');
    if (look.lastLine !== 'none') throw new Error('a hairline under the last row of a card');
    if (new Set(look.gaps).size !== 1) throw new Error(`the thumbnail's gaps (left, top, bottom) are ${look.gaps}`);
  });

  // Issue #82: a recipe without directions says so under the heading, with Add directions (opening the editor there),
  // and cook mode shows the ingredients alone, filling the screen, with no divider
  await step('82a-recipe-no-directions', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('.view.tab-active .page-current .ck-card', { hasText: 'Tahini Sauce' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(700);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap(); await page.waitForTimeout(1000);
    for (let n = 0; n < 2; n++) {
      const li = page.locator('.view.tab-active .page-current .ck-edit-list li.ck-step-row').first();
      await swipeLeft(ctx, page, li); await page.waitForTimeout(600);
      await li.locator('.swipeout-delete').tap(); await page.waitForTimeout(800);
    }
    if (await page.locator('.view.tab-active .page-current .ck-edit-list li.ck-step-row').count()) throw new Error('the directions were not deleted');
    await page.locator('.view.tab-active .page-current .navbar a', { hasText: 'Save' }).tap(); await page.waitForTimeout(1000);
    await page.locator('.view.tab-active .page-current .ck-sec-empty').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
    const empty = await page.locator('.view.tab-active .page-current .ck-panel-rest .ck-sec-empty').innerText();
    if (!empty.includes('No directions yet.') || !empty.includes('Add directions')) throw new Error(`under Directions: "${empty}"`);
  });
  await step('82b-add-directions-opens-editor', async () => {
    await page.locator('.view.tab-active .page-current .ck-sec-empty .button', { hasText: 'Add directions' }).tap(); await page.waitForTimeout(1200);
    const t = await page.evaluate(() => {
      const pg = document.querySelector('.view.tab-active .page-current');
      return { bar: pg.querySelector('.navbar').getBoundingClientRect().bottom, title: pg.querySelector('.block-title[data-at="directions"]').getBoundingClientRect().top };
    });
    if (t.title < t.bar || t.title > t.bar + 40) throw new Error(`the editor opens with Directions ${Math.round(t.title - t.bar)}px under the title bar`);
    await page.locator('.view.tab-active .page-current .navbar a', { hasText: 'Cancel' }).first().tap(); await page.waitForTimeout(1000);
  });
  await step('82c-cook-no-directions', async () => {
    await page.locator('.view.tab-active .page-current .ck-cta-button', { hasText: 'Start cooking' }).tap(); await page.waitForTimeout(900);
    const t = await page.evaluate(() => {
      const body = document.querySelector('.ck-cook .ck-split-body').getBoundingClientRect();
      const ing = document.querySelector('.ck-cook .ck-pane-ingredients').getBoundingClientRect();
      return {
        steps: document.querySelectorAll('.ck-cook .ck-pane-steps').length,
        handle: document.querySelectorAll('.ck-cook .ck-split-handle').length,
        fill: Math.round(ing.height - body.height),
        note: document.querySelector('.ck-cook .ck-pane-note')?.textContent,
      };
    });
    if (t.steps || t.handle) throw new Error('cook mode still shows a Directions half or the divider');
    if (Math.abs(t.fill) > 1) throw new Error(`the ingredients don't fill cook mode (${t.fill}px)`);
    if (t.note !== 'No directions for this recipe.') throw new Error(`the note reads "${t.note}"`);
  });
  await step('82d-cook-no-directions-done', async () => {
    // every ingredient ticked counts as done: closing offers Mark as made
    const rows = page.locator('.ck-cook .ck-pane-ingredients li label');
    for (let n = 0; n < (await rows.count()); n++) { await rows.nth(n).tap(); await page.waitForTimeout(120); }
    await page.locator('.ck-cook .navbar a[aria-label="Close cook mode"]').tap(); await page.waitForTimeout(700);
    if (!(await page.locator('.dialog.modal-in', { hasText: 'Done cooking?' }).count())) throw new Error('closing with every ingredient ticked does not offer Mark as made');
  });
  await page.locator('.dialog.modal-in .dialog-button', { hasText: 'Not now' }).tap().catch(() => {});
  await page.waitForTimeout(800);

  // Issue #85: cook mode stays while you look at other recipes. The chevron tucks it away behind the Cooking bar
  // (bottom centre, above the tab bar, like Instacart's cart bar), which brings it back as it was; Start cooking on
  // another recipe adds a tab; X closes the shown recipe. It's also kept on the phone, so it comes back after iOS reloads
  // the app.
  const cookOpen = () => page.locator('.popup.ck-cook.modal-in').count();
  const fab = '.view.tab-active .page-current .ck-cooking-fab';
  await step('36a-cook-minimized', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.locator('#view-recipes .page-current .ck-card', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(900);
    await page.locator('#view-recipes .page-current .ck-cta-button').tap(); await page.waitForTimeout(1200);
    await page.locator('.ck-cook .ck-pane-steps .ck-timer-button').first().tap(); await page.waitForTimeout(300);
    await page.locator('.ck-cook .ck-pane-ingredients li').first().locator('label').tap(); await page.waitForTimeout(300);
    await page.locator('.ck-cook a[aria-label="Minimize cook mode"]').tap(); await page.waitForTimeout(1000);
    if (await cookOpen()) throw new Error('the chevron didn’t tuck cook mode away');
    const cta = await page.locator('#view-recipes .page-current .ck-cta-button').textContent();
    if (cta.trim() !== 'Resume cooking') throw new Error(`the recipe’s button reads "${cta.trim()}" while it’s cooking`);
    // its own Resume cooking button does it here, so no Cooking bar on top of it
    if (await page.locator(fab).isVisible()) throw new Error('the Cooking bar shows over the recipe that’s cooking');
    // iOS's back gesture (the browser's back) with cook mode open tucks it away and leaves the recipe page where it is
    await page.locator('#view-recipes .page-current .ck-cta-button').tap(); await page.waitForTimeout(1000);
    await page.goBack(); await page.waitForTimeout(1000);
    if (await cookOpen()) throw new Error('back didn’t tuck cook mode away');
    if (!page.url().startsWith(BASE)) throw new Error(`back left the app for ${page.url()}`);
    const still = (await page.locator('#view-recipes .page-current .ck-cta-button').textContent().catch(() => '')).trim();
    if (still !== 'Resume cooking') throw new Error('back with cook mode open also left the recipe page');
  });
  await step('36b-cook-minimized-list', async () => {
    await page.goBack(); await page.waitForTimeout(1000);
    if (!(await page.locator(fab).isVisible())) throw new Error('no Cooking bar with cook mode tucked away');
    const f = await page.locator(`${fab} > a`).boundingBox();
    const bar = await page.locator('.views > .toolbar.tabbar').boundingBox();
    if (f.y + f.height > bar.y) throw new Error('the Cooking bar covers the tab bar');
    if (Math.abs(f.x + f.width / 2 - 393 / 2) > 1) throw new Error('the Cooking bar isn’t centred');
    // small: "Cooking • 1" (the dot as far from the word as from the number), flat dark, no iOS 26 glass edge or glow,
    // 10px above the tab bar
    const text = (await page.locator(fab).textContent()).replace(/\s+/g, '');
    if (text !== 'Cooking•1') throw new Error(`the Cooking pill reads "${text}"`);
    const gaps = await page.locator(`${fab} .ck-cooking-fab-dot`).evaluate((d) => {
      const r = d.getBoundingClientRect(), a = d.previousElementSibling.getBoundingClientRect(), b = d.nextElementSibling.getBoundingClientRect();
      return [Math.round(r.left - a.right), Math.round(b.left - r.right)];
    });
    if (gaps[0] !== gaps[1]) throw new Error(`the dot is ${gaps[0]}px from "Cooking" and ${gaps[1]}px from the number`);
    if (Math.round(bar.y - (f.y + f.height)) !== 10) throw new Error(`the Cooking pill is ${Math.round(bar.y - (f.y + f.height))}px above the tab bar, not 10`);
    if (f.width > 200 || f.height > 48) throw new Error(`the Cooking pill is ${Math.round(f.width)}×${Math.round(f.height)}px, not small`);
    const look = await page.locator(`${fab} > a`).evaluate((a) => ({ bg: getComputedStyle(a).backgroundColor, shadow: getComputedStyle(a).boxShadow }));
    if (look.bg !== 'rgb(38, 38, 40)' || look.shadow !== 'none') throw new Error(`the Cooking pill is ${look.bg} with shadow ${look.shadow}`);
  });
  // the pill isn't in Settings
  await step('36b2-cook-pill-not-in-settings', async () => {
    await page.locator('.tabbar a[aria-label="Settings"]').tap(); await page.waitForTimeout(800);
    if (await page.locator(fab).count()) throw new Error('the Cooking pill shows in Settings');
    await page.locator('.tabbar a[aria-label="Recipes"]').tap(); await page.waitForTimeout(800);
    if (!(await page.locator(fab).isVisible())) throw new Error('the Cooking pill didn’t come back on Recipes');
  });
  await step('36c-cook-second-recipe', async () => {
    await page.locator('#view-recipes .page-current .ck-card', { hasText: 'Corn' }).tap(); await page.waitForTimeout(900);
    // another recipe's footer: a dark chef-hat button with how many are cooking (back to cook mode) beside "Add to
    // cooking"; no floating pill on top of it
    if (await page.locator(fab).isVisible()) throw new Error('the Cooking pill shows on a recipe page');
    const back = (await page.locator('#view-recipes .page-current .ck-cta-back').innerText().catch(() => '')).trim();
    const add = (await page.locator('#view-recipes .page-current .ck-cta-button').innerText()).trim();
    if (back !== '1' || add !== 'Add to cooking') throw new Error(`the footer reads "${back}" and "${add}"`);
    // Add to cooking adds it as a tab. Cook mode slides up whole: scrolling the new tab into view once pulled all of it
    // up mid-slide, its top bar cut off and blank underneath
    await page.locator('#view-recipes .page-current .ck-cta-button').tap(); await page.waitForTimeout(150);
    const midTop = await page.evaluate(() => document.querySelector('.popup.ck-cook .navbar').getBoundingClientRect().top);
    if (midTop < -1) throw new Error(`cook mode's top bar is ${Math.round(-midTop)}px above the screen while it slides up`);
    await page.waitForTimeout(1050);
    const tabs = await page.locator('.ck-cook .ck-cook-recipe').allTextContents();
    if (tabs.length !== 2 || !(await page.locator('.ck-cook .ck-cook-recipe-on').textContent()).includes('Corn')) throw new Error(`cook mode has the tabs ${JSON.stringify(tabs)}`);
    await page.locator('.ck-cook a[aria-label="Minimize cook mode"]').tap(); await page.waitForTimeout(1000);
    await page.goBack(); await page.waitForTimeout(1000);
    const text = (await page.locator(fab).textContent()).replace(/\s+/g, '');
    if (text !== 'Cooking•2') throw new Error(`the Cooking pill reads "${text}", not 2 recipes`);
  });
  // no pill over the recipe editor either
  await step('36c2-cook-pill-not-in-editor', async () => {
    await page.locator('#view-recipes .page-current .ck-card', { hasText: 'Corn' }).tap(); await page.waitForTimeout(900);
    await page.locator('.navbar a[aria-label="More actions"]:visible').first().tap(); await page.waitForTimeout(600);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Edit Recipe' }).tap(); await page.waitForTimeout(1000);
    if (await page.locator(fab).isVisible()) throw new Error('the Cooking pill shows over the recipe editor');
    await page.goBack(); await page.waitForTimeout(900);
    await page.goBack(); await page.waitForTimeout(900);
    if (!(await page.locator(fab).isVisible())) throw new Error('the Cooking pill didn’t come back on the recipe list');
  });
  await step('36d-cook-resumed', async () => {
    await page.locator(`${fab} > a`).tap(); await page.waitForTimeout(1000);
    if (!(await cookOpen())) throw new Error('the Cooking bar didn’t bring cook mode back');
    // the pill waits behind open cook mode, so tucking it away uncovers it rather than it popping up afterwards
    if (!(await page.locator(fab).count())) throw new Error('the Cooking pill isn’t behind open cook mode');
    await page.locator('.ck-cook .ck-cook-recipe', { hasText: 'Kebabs' }).tap(); await page.waitForTimeout(500);
    if ((await page.locator('.ck-cook .tab-active .ck-pane-ingredients li.ck-done').count()) !== 1) throw new Error('the kebabs’ tick wasn’t kept');
    if (!(await page.locator('.ck-cook .ck-timer-pill').count())) throw new Error('the timer wasn’t kept');
  });
  // swiping the top bar down tucks cook mode away too (Framework7's swipe to close)
  await step('36d2-cook-swiped-down', async () => {
    const nav = await page.locator('.ck-cook .navbar .title').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const x = nav.x + nav.width / 2, y = nav.y + nav.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 15; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 20 * i }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); await page.waitForTimeout(1000);
    if (await cookOpen()) throw new Error('swiping the top bar down didn’t tuck cook mode away');
    if (!(await page.locator(fab).isVisible())) throw new Error('no Cooking pill after swiping cook mode away');
    await page.locator(`${fab} > a`).tap(); await page.waitForTimeout(1000);
    if (!(await cookOpen())) throw new Error('the Cooking pill didn’t bring cook mode back after the swipe');
  });
  // on a tab's first page too, iOS's back gesture (the browser's back) tucks cook mode away, and the list stays put
  await step('36d3-cook-back-on-list', async () => {
    await page.goBack(); await page.waitForTimeout(1000);
    if (await cookOpen()) throw new Error('back on the recipe list didn’t tuck cook mode away');
    if (!page.url().startsWith(BASE)) throw new Error(`back left the app for ${page.url()}`);
    if (!(await page.locator('#view-recipes .page-current .ck-card').count())) throw new Error('back moved the page under cook mode');
    if (!(await page.locator(fab).isVisible())) throw new Error('no Cooking pill after back');
    await page.locator(`${fab} > a`).tap(); await page.waitForTimeout(1000);
    if (!(await cookOpen())) throw new Error('the Cooking pill didn’t bring cook mode back after back');
  });
  // iOS often reloads the home-screen app after you've been in another app: cook mode comes back as it was (the same
  // recipes, ticks, a running timer and where Directions was scrolled to)
  await step('36e-cook-after-reload', async () => {
    await page.locator('.ck-cook .tab-active .ck-pane-steps li:has(label)').first().locator('label').tap(); await page.waitForTimeout(700);
    await page.locator('.ck-cook .tab-active .ck-pane-steps').evaluate((el) => el.scrollTo(0, 160)); await page.waitForTimeout(300);
    const scrolled = await page.locator('.ck-cook .tab-active .ck-pane-steps').evaluate((el) => el.scrollTop);
    await page.reload(); await page.waitForTimeout(2000);
    if (!(await cookOpen())) throw new Error('after a reload the app didn’t come back into cook mode');
    const on = await page.locator('.ck-cook .ck-cook-recipe-on').textContent();
    if (!on.includes('Kebabs') || (await page.locator('.ck-cook .ck-cook-recipe').count()) !== 2) throw new Error(`cook mode came back on "${on}"`);
    if ((await page.locator('.ck-cook .tab-active .ck-pane-ingredients li.ck-done').count()) !== 1) throw new Error('the ticked ingredient wasn’t kept');
    if ((await page.locator('.ck-cook .tab-active .ck-pane-steps li.ck-done').count()) !== 1) throw new Error('the ticked step wasn’t kept');
    if (!(await page.locator('.ck-cook .ck-timer-pill').count())) throw new Error('the running timer wasn’t kept');
    const folded = await page.locator('.ck-cook .tab-active .ck-pane-steps li.ck-done .accordion-item-content').first().evaluate((e) => e.getBoundingClientRect().height).catch(() => 0);
    if (folded !== 0) throw new Error(`the ticked step’s ingredients and timers are open again (${Math.round(folded)}px)`);
    const at = await page.locator('.ck-cook .tab-active .ck-pane-steps').evaluate((el) => el.scrollTop);
    if (Math.abs(at - scrolled) > 4) throw new Error(`Directions came back scrolled to ${at}px, not ${scrolled}px`);
  });
  await step('36f-cook-x-closes-recipe', async () => {
    await cookClose();
    if (!(await cookOpen())) throw new Error('X closed cook mode with two recipes open');
    const title = await page.locator('.ck-cook .navbar .title').textContent();
    if (!title.includes('Corn') || (await page.locator('.ck-cook .ck-cook-recipes').count())) throw new Error(`after X the top bar reads "${title}" with the tabs still there`);
  });
  await step('36g-cook-closed-not-resumed', async () => {
    await cookClose();
    if (await cookOpen()) throw new Error('X on the last recipe didn’t close cook mode');
    if (await page.locator('.ck-cooking-fab').count()) throw new Error('the Cooking bar stayed after cook mode closed');
    await page.reload(); await page.waitForTimeout(2000);
    if ((await cookOpen()) || (await page.locator('.ck-cooking-fab').count())) throw new Error('cook mode came back after it was closed');
  });

  // ── Groceries (issue #64): the list by aisle or by recipe, things from several recipes added up, Instacart's search
  // per row (↗) at the store picked, swipe for Aisle / Store / Delete, the add sheets. The demo's list: today's Mustard
  // Dill Chicken and part of tomorrow's kebabs at 8 servings, paper towels, two ticked, yogurt pinned to the 2nd store. ──
  const GRO = '#view-groceries .page-current';
  const groRow = (text) => page.locator(`${GRO} .ck-grocery-list li`, { hasText: text }).first();
  const groTitles = () => page.locator(`${GRO} .ck-grocery-list li:not(.ck-done) .item-title`).evaluateAll((els) => els.map((e) => [...e.childNodes].filter((n) => !(n.classList && n.classList.contains('item-footer'))).map((n) => n.textContent).join('').trim()));
  await step('40a-groceries-by-aisle', async () => {
    await page.goto(BASE); await page.waitForTimeout(1200);
    await page.evaluate(() => localStorage.removeItem('cookbook.demoSettings'));
    await page.reload(); await page.waitForTimeout(1200);
    await page.locator('.tabbar a[aria-label="Groceries"]').tap(); await page.waitForTimeout(1000);
    const titles = await groTitles();
    for (const want of ['3 lemons', '10 cloves garlic', '6 lb boneless chicken thighs', 'paper towels']) {
      if (!titles.some((t) => t.startsWith(want))) throw new Error(`no "${want}" line (lines: ${titles.join(' | ')})`);
    }
    const labels = await page.locator(`${GRO} .ck-grocery-group > .ck-plan-slot-label`).allTextContents();
    if (labels[0] !== 'Produce' || !labels.includes('Meat & seafood') || !labels.some((l) => l.startsWith('Got it'))) throw new Error(`aisles read ${labels.join(', ')}`);
    if (!(await page.locator(`${GRO} .ck-scale-button`, { hasText: 'Shopping at Acme Market' }).isVisible())) throw new Error('no "Shopping at" store pill');
    if (!(await page.locator(`${GRO} .ck-instacart-note`).textContent()).includes('opens Instacart')) throw new Error('no note that the links open Instacart');
    const href = await groRow('lemons').locator('a.ck-instacart-link').getAttribute('href');
    if (href !== 'https://www.instacart.com/store/acme-market/s?k=lemons') throw new Error(`lemons' ↗ goes to ${href}`);
    const yogurt = groRow('Greek yogurt');
    if ((await yogurt.locator('.ck-store-tag').textContent()) !== 'Corner Grocer') throw new Error('the yogurt pinned to Corner Grocer has no tag');
    if (!(await yogurt.locator('a.ck-instacart-link').getAttribute('href')).includes('/store/corner-grocer/')) throw new Error('the pinned yogurt searches the list’s store');
    if ((await groRow('lemons').locator('.item-footer').textContent()) !== 'Mustard Dill Chicken Thighs · Middle Eastern Chicken Kebabs') throw new Error('a line doesn’t say which recipes it’s for');
  });
  await step('40b-groceries-got-it', async () => {
    await page.locator(`${GRO} > .page-content`).evaluate((e) => e.scrollTo(0, e.scrollHeight)); await page.waitForTimeout(400);
    const got = await page.locator(`${GRO} .ck-grocery-got span`).textContent();
    if (got !== 'Got it · 2') throw new Error(`the ticked group reads "${got}"`);
    if (await page.locator(`${GRO} li.ck-done a.ck-instacart-link`).count()) throw new Error('ticked rows still have ↗');
  });
  await step('40c-groceries-tick', async () => {
    await groRow('paper towels').locator('.item-title').tap(); await page.waitForTimeout(600);
    if ((await page.locator(`${GRO} .ck-grocery-got span`).textContent()) !== 'Got it · 3') throw new Error('ticking paper towels didn’t move it to Got it');
    if (!(await page.locator(`${GRO} li.ck-done`, { hasText: 'paper towels' }).count())) throw new Error('paper towels isn’t crossed out');
  });
  await step('40d-groceries-swipe', async () => {
    await page.locator(`${GRO} > .page-content`).evaluate((e) => e.scrollTo(0, 0)); await page.waitForTimeout(300);
    await swipeLeft(ctx, page, page.locator(`${GRO} .ck-grocery-list li.swipeout`, { hasText: 'lemons' }));
    await page.waitForTimeout(600);
    for (const b of ['.ck-grocery-aisle', '.ck-grocery-store']) if (!(await page.locator(`${GRO} li.swipeout-opened ${b}`).isVisible())) throw new Error(`no ${b} button`);
    if (!(await page.locator(`${GRO} li.swipeout-opened .swipeout-delete`).isVisible())) throw new Error('no Delete button');
  });
  await step('40e-groceries-store-for-one', async () => {
    await page.locator(`${GRO} li.swipeout-opened .ck-grocery-store`).tap(); await page.waitForTimeout(800);
    if (!(await page.locator('.actions-modal.modal-in .actions-label').textContent()).includes('Which store for lemons')) throw new Error('no store question');
  });
  await step('40f-groceries-pinned', async () => {
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Corner Grocer' }).tap(); await page.waitForTimeout(900);
    const row = groRow('lemons');
    if ((await row.locator('.ck-store-tag').textContent()) !== 'Corner Grocer') throw new Error('lemons has no Corner Grocer tag');
    if (!(await row.locator('a.ck-instacart-link').getAttribute('href')).includes('/store/corner-grocer/')) throw new Error('lemons still searches Acme Market');
  });
  await step('40g-groceries-aisle-for-one', async () => {
    await swipeLeft(ctx, page, page.locator(`${GRO} .ck-grocery-list li.swipeout`, { hasText: 'honey' }));
    await page.waitForTimeout(600);
    await page.locator(`${GRO} li.swipeout-opened .ck-grocery-aisle`).tap(); await page.waitForTimeout(800);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Spices & seasonings' }).tap(); await page.waitForTimeout(900);
    const group = await groRow('honey').evaluate((li) => li.closest('.ck-grocery-group').querySelector('.ck-plan-slot-label').textContent);
    if (group !== 'Spices & seasonings') throw new Error(`honey is under ${group}`);
  });
  await step('40h-groceries-by-recipe', async () => {
    await page.locator(`${GRO} .ck-grocery-view .button`, { hasText: 'By recipe' }).tap(); await page.waitForTimeout(700);
    const heads = await page.locator(`${GRO} .ck-grocery-recipe-head h2`).allTextContents();
    if (heads.join('|') !== 'Mustard Dill Chicken Thighs|Middle Eastern Chicken Kebabs') throw new Error(`recipes read ${heads.join(', ')}`);
    const meta = await page.locator(`${GRO} .ck-grocery-recipe-head .ck-note`).first().textContent();
    if (meta !== '4 servings · Today, dinner') throw new Error(`the first recipe's line reads "${meta}"`);
    const thighs = await page.locator(`${GRO} .ck-grocery-list li`, { hasText: 'chicken thighs' }).first().locator('.item-footer').textContent();
    if (thighs !== '6 lb in all, with Middle Eastern Chicken Kebabs') throw new Error(`the thighs' footer reads "${thighs}"`);
  });
  await step('40i-groceries-store-menu', async () => {
    await page.locator(`${GRO} .ck-grocery-view .button`, { hasText: 'By aisle' }).tap(); await page.waitForTimeout(500);
    await page.locator(`${GRO} .ck-scale-button`).tap(); await page.waitForTimeout(800);
    const buttons = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (!buttons.includes('Acme Market') || !buttons.includes('Corner Grocer') || !buttons.includes('Edit stores…')) throw new Error(`store menu reads ${buttons.join(', ')}`);
  });
  await step('40j-groceries-switch-store', async () => {
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Corner Grocer' }).tap(); await page.waitForTimeout(800);
    if (!(await page.locator(`${GRO} .ck-scale-button`, { hasText: 'Shopping at Corner Grocer' }).count())) throw new Error('the pill didn’t change');
    if (!(await groRow('garlic').locator('a.ck-instacart-link').getAttribute('href')).includes('/store/corner-grocer/')) throw new Error('rows still search Acme Market');
    // the lemons, pinned to Corner Grocer, are now just with the rest: no tag
    if (await groRow('lemons').locator('.ck-store-tag').count()) throw new Error('lemons still shows a tag at its own store');
  });
  await step('40k-groceries-plus', async () => {
    await page.locator(`${GRO} > .navbar a[aria-label="Add to the grocery list"]`).tap(); await page.waitForTimeout(800);
    const buttons = await page.locator('.actions-modal.modal-in .actions-button').allTextContents();
    if (buttons.slice(0, 3).join('|') !== 'Shop this week|A recipe…|An item') throw new Error(`+ offers ${buttons.join(', ')}`);
  });
  await step('40l-groceries-add-item', async () => {
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'An item' }).tap(); await page.waitForTimeout(800);
    await page.locator('.dialog.modal-in input').fill('2 limes');
    await page.locator('.dialog.modal-in .dialog-button', { hasText: 'OK' }).tap(); await page.waitForTimeout(800);
    if (!(await groTitles()).some((t) => t.startsWith('2 limes'))) throw new Error('the typed item isn’t on the list');
  });
  await step('40m-shop-week', async () => {
    await page.locator(`${GRO} > .navbar a[aria-label="Add to the grocery list"]`).tap(); await page.waitForTimeout(800);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Shop this week' }).tap(); await page.waitForTimeout(1000);
    const sheet = page.locator('.ck-shop-week-sheet.modal-in');
    if (!(await sheet.isVisible())) throw new Error('Shop this week didn’t open');
    const mustard = sheet.locator('li', { hasText: 'Mustard Dill' });
    if (await mustard.locator('input').isChecked()) throw new Error('a recipe already on the list starts ticked');
    if (!(await mustard.locator('.item-footer').textContent()).includes('Already on your list')) throw new Error('doesn’t say it’s already on the list');
    if (!(await sheet.locator('li', { hasText: 'Corn pudding' }).locator('input').isChecked())) throw new Error('today’s corn pudding starts unticked');
  });
  await step('40n-shop-week-ingredients', async () => {
    const sheet = page.locator('.ck-shop-week-sheet.modal-in');
    await sheet.locator('.toolbar a', { hasText: 'Next' }).tap(); await page.waitForTimeout(800);
    const flour = sheet.locator('li', { hasText: 'all-purpose flour' });
    if (await flour.locator('input').isChecked()) throw new Error('flour (usually in the pantry) starts ticked');
    if ((await flour.locator('.item-footer').textContent()) !== 'Usually in the pantry') throw new Error('flour doesn’t say why it’s unticked');
    if (!(await sheet.locator('li', { hasText: 'fresh corn kernels' }).locator('input').isChecked())) throw new Error('corn starts unticked');
  });
  await step('40o-shop-week-added', async () => {
    const before = (await groTitles()).length;
    await page.locator('.ck-shop-week-sheet.modal-in .toolbar a', { hasText: 'Add' }).tap(); await page.waitForTimeout(1200);
    if (await page.locator('.ck-shop-week-sheet.modal-in').count()) throw new Error('the sheet stayed open');
    const after = await groTitles();
    if (after.length <= before || !after.some((t) => t.includes('fresh corn kernels'))) throw new Error('the week’s ingredients weren’t added');
    await page.waitForTimeout(2200); // the toast
  });
  await step('40p-recipe-add-sheet', async () => {
    await page.locator('.tabbar a[aria-label="Recipes"]').tap(); await page.waitForTimeout(800);
    await page.locator('#view-recipes .page-current .ck-card', { hasText: 'Pulled Beef' }).first().tap(); await page.waitForTimeout(1200);
    await page.locator('#view-recipes .page-current a[aria-label="More actions"]').tap(); await page.waitForTimeout(800);
    await page.locator('.actions-modal.modal-in .actions-button', { hasText: 'Add to Grocery List' }).tap(); await page.waitForTimeout(1000);
    const sheet = page.locator('.ck-add-recipe-sheet.modal-in');
    if (!(await sheet.isVisible())) throw new Error('Add to Grocery List didn’t open its sheet');
    if (!(await sheet.locator('.ck-add-recipe-name').textContent()).includes('Pulled Beef')) throw new Error('the sheet doesn’t name the recipe');
  });
  await step('40q-recipe-add-more-servings', async () => {
    const sheet = page.locator('.ck-add-recipe-sheet.modal-in');
    const first = async () => (await sheet.locator('.ck-add-list li').first().locator('.item-title').textContent()).trim();
    const was = await first();
    await sheet.locator('.stepper-button-plus').tap(); await page.waitForTimeout(400);
    if ((await first()) === was) throw new Error(`more servings didn't change "${was}"`);
  });
  await step('40r-recipe-added', async () => {
    await page.locator('.ck-add-recipe-sheet.modal-in .toolbar a', { hasText: 'Add' }).tap(); await page.waitForTimeout(1200);
    await page.locator('.tabbar a[aria-label="Groceries"]').tap(); await page.waitForTimeout(800);
    if (!(await groTitles()).some((t) => /beef/i.test(t))) throw new Error('the recipe’s ingredients aren’t on the list');
    await page.waitForTimeout(2000); // the toast
  });
  await step('40s-planner-shop-button', async () => {
    await page.locator('.tabbar a[aria-label="Plan"]').tap(); await page.waitForTimeout(900);
    await page.locator('#view-plan .page-current > .navbar a[aria-label="Shop this week"]').tap(); await page.waitForTimeout(1000);
    if (!(await page.locator('.ck-shop-week-sheet.modal-in').isVisible())) throw new Error('the Planner’s cart didn’t open Shop this week');
  });
  await step('40t-grocery-stores', async () => {
    await page.locator('.sheet-backdrop.backdrop-in').first().tap({ position: { x: 20, y: 60 } }); await page.waitForTimeout(800);
    await page.locator('.tabbar a[aria-label="Settings"]').tap(); await page.waitForTimeout(800);
    await page.locator('#view-settings .page-current li', { hasText: 'Grocery Stores' }).locator('a').tap(); await page.waitForTimeout(1000);
    const names = await page.locator('#view-settings .page-current .ck-store-list li .item-title').evaluateAll((els) => els.map((e) => e.firstChild.textContent.trim()));
    if (names.join('|') !== 'Acme Market|Corner Grocer') throw new Error(`stores read ${names.join(', ')}`);
  });

  // Issue #35: while the recipes and cookbooks first load, grey placeholders in their shape: no lone "All" chip, no
  // "0 recipes", no small spinner. ?loading makes the demo's recipes and cookbooks never arrive.
  const noLoadingTells = async (where) => {
    const pg = page.locator('.view.tab-active .page-current');
    if (await pg.locator('.preloader').count()) throw new Error(`${where} shows a spinner while loading`);
    if (await pg.locator('.chip').count()) throw new Error(`${where} shows chips while loading`);
    const text = await pg.evaluate((el) => [...el.querySelectorAll(':not(.skeleton-text)')].filter((e) => !e.closest('.skeleton-text') && !e.children.length).map((e) => e.textContent).join(' '));
    if (/\b0 (recipes|cookbooks)\b/.test(text)) throw new Error(`${where} counts 0 while loading`);
  };
  await step('35a-recipes-loading', async () => {
    await page.goto(`${BASE}?loading`); await page.waitForTimeout(1200);
    await noLoadingTells('Recipes');
    if ((await page.locator('#view-recipes .page-current .ck-skeleton-card').count()) < 4) throw new Error('no placeholder recipe tiles');
    if ((await page.locator('#view-recipes .page-current .ck-skeleton-chip').count()) < 3) throw new Error('no placeholder chips');
    const photo = await page.locator('#view-recipes .page-current .ck-skeleton-card .ck-card-photo').first().boundingBox();
    if (!photo || Math.abs(photo.width - photo.height) > 2) throw new Error(`a placeholder tile's photo isn't square (${JSON.stringify(photo)})`);
  });
  await step('35b-cookbooks-loading', async () => {
    await page.locator('.tabbar a[aria-label="Cookbooks"]').tap(); await page.waitForTimeout(800);
    await noLoadingTells('Cookbooks');
    if ((await page.locator('#view-cookbooks .page-current .ck-skeleton-tile').count()) < 2) throw new Error('no placeholder cookbook cards');
    if (await page.locator('#view-cookbooks .page-current', { hasText: 'No cookbooks yet' }).count()) throw new Error('says "No cookbooks yet" while loading');
  });
  await step('35c-cookbooks-list-loading', async () => {
    await page.locator('#view-cookbooks .page-current > .navbar .ck-view-switch').tap(); await page.waitForTimeout(600);
    await noLoadingTells('Cookbooks as a list');
    if ((await page.locator('#view-cookbooks .page-current .ck-book-list .skeleton-block').count()) < 3) throw new Error('no placeholder cookbook rows');
  });
  // the Planner (issue #62): the days and the strip are there at once (they're dates), each day a grey row, no
  // "Nothing planned" and no dots until the recipes arrive
  await step('35d-planner-loading', async () => {
    await page.locator('.tabbar a[aria-label="Plan"]').tap(); await page.waitForTimeout(800);
    const pg = page.locator('#view-plan .page-current');
    if (await pg.locator('.preloader').count()) throw new Error('the Planner shows a spinner while loading');
    if ((await pg.locator('.ck-plan-day').count()) !== 7) throw new Error('the week’s days don’t show while loading');
    if ((await pg.locator('.ck-plan-list .skeleton-block').count()) < 7) throw new Error('no placeholder rows');
    if (await pg.locator('.ck-plan-empty').count()) throw new Error('says "Nothing planned" while loading');
    if (await pg.locator('.ck-week-busy').count()) throw new Error('dots on the strip while loading');
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
    if (!(await page.locator('.view.tab-active .page-current .ck-card').count())) throw new Error('no recipes after signing in');
  });

  if (errors.length) {
    console.log(`✗ page errors:\n    ${errors.join('\n    ')}`);
    total += errors.length;
  }
  await browser.close();
  console.log(total ? `\n${total} issue(s). Screenshots: ui-states/` : '\nNo issues. Screenshots: ui-states/');
  process.exit(total ? 2 : 0);
})();
