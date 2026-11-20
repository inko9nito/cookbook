/**
 * Temporary, for issue #141 (the Cookbooks header gone on the iPhone after deleting a cookbook, still gone after the
 * app's refresh), which doesn't happen in Chromium. On deploy previews (or locally with ?diag) the Cookbooks page shows
 * a "Copy report" link: it copies what Safari has for that page's header (where it is, its styles and its ancestors',
 * what's drawn where its title and buttons should be, open modals, the history and the stored keys), so the report can
 * be pasted into the issue. No recipe or cookbook names and no stored values: titles are given as lengths, storage as
 * key names. Remove once #141 is understood.
 */

import { photosOff } from '../components/ui/photo';

declare const __APP_VERSION__: string;

export const headerReportOn = (() => {
  try {
    if (location.hostname.startsWith('deploy-preview-')) return true;
    if (new URLSearchParams(location.search).has('diag')) sessionStorage.setItem('ck-diag', '1');
    return sessionStorage.getItem('ck-diag') === '1';
  } catch {
    return false;
  }
})();

const PROPS = ['display', 'visibility', 'opacity', 'transform', 'will-change', 'backface-visibility', 'z-index', 'position', 'overflow', 'contain', 'isolation', 'filter', 'backdrop-filter', 'clip-path', 'mask-image', 'content-visibility', 'top', 'height', 'background-color', 'color'];
const QUIET = new Set(['none', 'auto', 'visible', 'normal', 'static', '1', '0px']);

function name(el: Element | null): string {
  if (!el) return 'null';
  const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') ?? '');
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls.trim().split(/\s+/).join('.')}` : ''}`;
}

function box(el: Element): string {
  const r = el.getBoundingClientRect();
  return `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}]`;
}

function styles(el: Element): string {
  const cs = getComputedStyle(el);
  return PROPS.map((p) => [p, cs.getPropertyValue(p)] as const)
    .filter(([, v]) => v && !QUIET.has(v))
    .map(([p, v]) => `${p}:${v}`)
    .join('; ');
}

function line(el: Element, depth = 0): string {
  const inline = el.getAttribute('style');
  return `${'  '.repeat(depth)}${name(el)} ${box(el)} ${styles(el)}${inline ? ` | style="${inline}"` : ''}`;
}

// what is drawn at the middle of an element: the element itself (or something inside it) means it's laid out where it
// should be and on top, so a missing header would be Safari not painting it
function hit(label: string, el: Element | null): string {
  if (!el) return `${label}: no element`;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return `${label}: zero size`;
  const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const path: string[] = [];
  for (let e = at, i = 0; e && i < 4; e = e.parentElement, i++) path.push(name(e));
  return `${label}: ${at && (el === at || el.contains(at)) ? 'itself' : 'SOMETHING ELSE'} → ${path.join(' < ')}`;
}

// the photos' real sizes (they're shown as CSS backgrounds): how many the whole app holds and the current page shows, and
// the pixel size of a sample from this page, with what each takes once decoded. No addresses (a photo's address opens it).
async function photoReport(pageEl: Element | null): Promise<string[]> {
  const urlsIn = (root: ParentNode) =>
    new Set([...root.querySelectorAll<HTMLElement>('[style*="background-image"]')].map((e) => e.style.backgroundImage.match(/url\("?(.*?)"?\)/)?.[1]).filter((u): u is string => !!u));
  const all = urlsIn(document);
  const here = pageEl ? urlsIn(pageEl) : new Set<string>();
  const sample = [...here].slice(0, 8);
  const sizes = await Promise.all(
    sample.map(
      (u) =>
        new Promise<[number, number]>((done) => {
          const img = new Image();
          img.onload = () => done([img.naturalWidth, img.naturalHeight]);
          img.onerror = () => done([0, 0]);
          img.src = u;
        }),
    ),
  );
  const mb = (w: number, h: number) => (w * h * 4) / 1e6;
  const avg = sizes.length ? sizes.reduce((t, [w, h]) => t + mb(w, h), 0) / sizes.length : 0;
  const shown = pageEl ? [...pageEl.querySelectorAll<HTMLElement>('[style*="background-image"]')].slice(0, 8).map((e) => `${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`) : [];
  return [
    `photos: ${photosOff ? 'OFF (test)' : 'on'} · ${all.size} different in the app's pages · ${here.size} on this page`,
    `  sizes on this page: ${sizes.map(([w, h]) => `${w}×${h} (${mb(w, h).toFixed(1)} MB decoded)`).join(', ') || 'none'}`,
    `  shown at (points): ${shown.join(', ') || 'none'}`,
    `  if all ${all.size} are decoded: about ${Math.round(avg * all.size)} MB`,
  ];
}

export async function headerReport(pageEl: Element | null): Promise<string> {
  const out: string[] = [];
  const add = (s: string) => out.push(s);
  add(`#141 header report · ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '?'} · ${new Date().toISOString()}`);
  (await photoReport(pageEl)).forEach(add);
  add(`ua: ${navigator.userAgent}`);
  const vv = window.visualViewport;
  add(`standalone: ${(navigator as { standalone?: boolean }).standalone ?? matchMedia('(display-mode: standalone)').matches} · dpr ${devicePixelRatio} · screen ${screen.width}×${screen.height} · inner ${innerWidth}×${innerHeight}` +
    (vv ? ` · visualViewport ${Math.round(vv.width)}×${Math.round(vv.height)} offsetTop ${Math.round(vv.offsetTop)} pageTop ${Math.round(vv.pageTop)} scale ${vv.scale}` : ''));
  add(`scroll: window ${scrollX},${scrollY} · scrollingElement ${document.scrollingElement?.scrollTop} · body ${document.body.scrollTop}`);
  add(`html: ${document.documentElement.className}`);
  add(`fonts: ${document.fonts?.status}`);
  add(`location: ${location.pathname}${location.hash} · history ${history.length} · state ${JSON.stringify(history.state)?.slice(0, 300)}`);
  try {
    add(`localStorage keys: ${Object.keys(localStorage).join(', ')}`);
    add(`sessionStorage keys: ${Object.keys(sessionStorage).join(', ')}`);
  } catch {
    add('storage: not readable');
  }
  add(`open: ${[...document.querySelectorAll('.modal-in, .modal-out, .backdrop-in, .toast, .dialog, .popup-push-in, .popup-push-closing, .popup-behind')].map(name).join(' | ') || 'nothing'}`);
  add('views:');
  document.querySelectorAll('.view').forEach((v) => {
    add(`  ${name(v)} ${box(v)} · pages: ${[...v.querySelectorAll(':scope > .page')].map((p) => `${(p as HTMLElement).dataset.name ?? '?'}{${p.className}}`).join(' ')}`);
  });
  const navbar = pageEl?.querySelector(':scope > .navbar') ?? null;
  if (!pageEl || !navbar) {
    add(`page: ${name(pageEl)} · navbar: ${navbar ? 'yes' : 'NONE'}`);
    return out.join('\n');
  }
  const title = navbar.querySelector('.title');
  add(`title: ${title ? `${title.textContent?.length ?? 0} letters` : 'none'}`);
  add('header:');
  const walk = (el: Element, depth: number) => {
    add(line(el, depth + 1));
    if (depth < 3) for (const c of el.children) if (c.tagName.toLowerCase() !== 'svg') walk(c, depth + 1);
  };
  walk(navbar, 0);
  ['::before', '::after'].forEach((p) => {
    const bg = navbar.querySelector('.navbar-bg');
    if (bg) {
      const cs = getComputedStyle(bg, p);
      add(`  navbar-bg${p}: content ${cs.content} display ${cs.display} bg ${cs.backgroundColor} opacity ${cs.opacity} transform ${cs.transform}`);
    }
  });
  add('above it:');
  for (let e = navbar.parentElement; e; e = e.parentElement) add(line(e, 1));
  add('drawn there:');
  add(`  ${hit('title', title)}`);
  navbar.querySelectorAll('.right .link, .left .link').forEach((l, i) => add(`  ${hit(`button ${i + 1}`, l)}`));
  add(`  ${hit('header', navbar)}`);
  return out.join('\n');
}

/**
 * Copies text that takes a moment to make: Safari only lets a page write to the clipboard in the tap itself, so the text
 * goes in as a promise (ClipboardItem); falls back to copying it once made.
 */
export async function copyLater(text: Promise<string>): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return true;
    }
  } catch {
    // fall through
  }
  return copyText(await text);
}

/** Copies the text (Safari allows it in a tap); falls back to a hidden text box when the clipboard API refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
