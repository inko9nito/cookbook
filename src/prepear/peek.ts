/*
  The Prepear "peek" bookmarklet (issue #14, docs/PLAN.md §6, step 1).

  It runs on app.prepear.com in the user's own browser, where they're signed in. Claude's sandbox can't reach
  Prepear, so this is how Claude learns the shape of Prepear's site before writing the export bookmarklet:
  - what the page is built with, and where it keeps its sign-in (key names only, never the values),
  - the API addresses the app's code mentions,
  - while it stays open, every API call the app makes (address, method, header names, and a trimmed copy of
    what came back), as the user opens recipes, cookbooks and the meal plan.
  Save downloads it all as prepear-peek.json (Copy puts it on the clipboard instead).

  What it leaves out: passwords, sign-in tokens, cookies, API keys (any value under a name like token, auth,
  session, password, key...), anything that looks like a token, and email addresses. Lists keep their first few
  items and long text is cut short, so the file stays small. Recipe text stays in: that's the point.

  `prepearPeek` must be self-contained (no imports, nothing from outside the function): the Import from Prepear
  page turns its source into the bookmarklet with `prepearPeek.toString()`. That's also why it styles its small
  panel inline: it's drawn on Prepear's page, not in this app.
*/
export function prepearPeek(): void {
  type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
  type Call = {
    at: string;
    via: string;
    method: string;
    url: string;
    requestHeaders?: Record<string, string>;
    requestBody?: Json;
    status?: number;
    contentType?: string | null;
    response?: Json;
    error?: string;
  };
  type Peek = { started: string; calls: Call[]; patterns: Record<string, number>; sockets: string[] };

  const w = window as unknown as Record<string, any>;
  const STORE = '__cookbookPeek';
  // tapped again: show the panel again (it keeps recording)
  if (w[STORE]) {
    w[STORE].show();
    return;
  }

  const MAX_CALLS = 400;
  const SAMPLES_PER_PATTERN = 3;
  // (auth, but not author: a recipe's author is wanted)
  const SECRET_NAME = /pass(word|wd)?|secret|token|auth(?!or)|session|cookie|csrf|xsrf|jwt|bearer|credential|api[-_]?key|private[-_]?key|signature|^key$|^otp/i;
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const STATIC = /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp4|webm|m3u8|ts)(\?|#|$)/i;

  const hidden = (s: string) => `<hidden: ${s.length} chars>`;
  // a token: a JWT, or a long run of base64-ish characters with no spaces (recipe text has spaces; ids are short)
  const looksLikeToken = (s: string) =>
    /^eyJ[\w-]{8,}\.[\w-]{8,}/.test(s) || (s.length >= 40 && /^[A-Za-z0-9+/=_.~-]+$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s));

  const cleanText = (s: string, limit: number): string => {
    if (UUID.test(s)) return s;
    if (looksLikeToken(s)) return hidden(s);
    // a "Bearer xyz" or "Token xyz" value keeps its scheme only
    const scheme = /^(Bearer|Token|JWT|Basic)\s+(\S+)$/i.exec(s);
    if (scheme) return `${scheme[1]} ${hidden(scheme[2])}`;
    let out = s.replace(EMAIL, '<email>');
    if (out.length > limit) out = `${out.slice(0, limit)}…(+${out.length - limit} chars)`;
    return out;
  };

  const cleanUrl = (raw: string): string => {
    try {
      const u = new URL(raw, location.href);
      u.username = '';
      u.password = '';
      for (const [k, v] of [...u.searchParams]) {
        if (SECRET_NAME.test(k) || looksLikeToken(v) || /X-Amz-|Signature|Expires|Policy|Key-Pair/i.test(k)) u.searchParams.set(k, '<hidden>');
        else if (v.replace(EMAIL, '') !== v) u.searchParams.set(k, v.replace(EMAIL, '<email>'));
      }
      return u.toString().replace(/%3Chidden%3E/g, '<hidden>').replace(/%3Cemail%3E/g, '<email>');
    } catch {
      return cleanText(String(raw), 300);
    }
  };

  // a trimmed, token-free copy: lists keep their first few items, text is cut short, secret-named values hidden
  const clean = (value: unknown, depth = 0, listItems = 4, textLimit = 600): Json => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return /^https?:\/\//.test(value) ? cleanUrl(value) : cleanText(value, textLimit);
    if (depth > 14) return '<deeper>';
    if (Array.isArray(value)) {
      // small items (a recipe's ingredients and steps) are kept whole, up to 60; big ones (a page of recipes) a few
      const items: Json[] = [];
      let size = 0;
      for (const v of value) {
        if (items.length >= 60 || (items.length >= listItems && size > 8000)) break;
        const c = clean(v, depth + 1, listItems, textLimit);
        size += JSON.stringify(c).length;
        items.push(c);
      }
      if (value.length > items.length) items.push(`…(+${value.length - items.length} more, ${value.length} in all)`);
      return items;
    }
    if (typeof value === 'object') {
      const out: Record<string, Json> = {};
      const entries = Object.entries(value as object);
      for (const [k, v] of entries.slice(0, 120)) {
        if (SECRET_NAME.test(k) && v !== null && typeof v !== 'boolean' && typeof v !== 'number') out[k] = typeof v === 'string' ? hidden(v) : '<hidden>';
        else out[k] = clean(v, depth + 1, listItems, textLimit);
      }
      if (entries.length > 120) out['…'] = `+${entries.length - 120} more keys`;
      return out;
    }
    return `<${typeof value}>`;
  };

  const parse = (text: string): Json => {
    try {
      return clean(JSON.parse(text));
    } catch {
      // GraphQL and form bodies are text: keep the text (a GraphQL query is the most useful part)
      return cleanText(text, 4000);
    }
  };

  const headerNames = (h: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      // a secret header keeps its scheme only ("Bearer <hidden: 812 chars>"): that says how the app signs in
      const scheme = /^(Bearer|Token|JWT|Basic)\s+/i.exec(v);
      out[k] = !SECRET_NAME.test(k) ? cleanText(v, 200) : scheme ? `${scheme[1]} ${hidden(v.slice(scheme[0].length))}` : hidden(v);
    }
    return out;
  };

  // calls with the same shape (ids swapped for :id) are one pattern; a few samples of each are enough
  const pattern = (method: string, url: string) => {
    try {
      const u = new URL(url, location.href);
      const path = u.pathname
        .split('/')
        .map((p) => (/^\d+$/.test(p) || UUID.test(p) || /^[0-9a-f]{16,}$/i.test(p) || (p.length >= 16 && /\d/.test(p) && /^[\w-]+$/.test(p)) ? ':id' : p))
        .join('/');
      return `${method} ${u.host}${path}${u.search ? '?' + [...u.searchParams.keys()].join('&') : ''}`;
    } catch {
      return `${method} ${url}`;
    }
  };

  // ── the recording, kept in sessionStorage so it survives a page reload (tap the bookmarklet again) ──
  let peek: Peek;
  try {
    peek = JSON.parse(sessionStorage.getItem(STORE) || '');
    if (!Array.isArray(peek.calls)) throw new Error();
  } catch {
    peek = { started: new Date().toISOString(), calls: [], patterns: {}, sockets: [] };
  }
  const persist = () => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(peek));
    } catch {
      /* full: the copy in memory still saves */
    }
  };

  const worthKeeping = (url: string) => !STATIC.test(url.split('?')[0]) && !/google-analytics|googletagmanager|doubleclick|facebook|hotjar|segment\.|sentry|intercom|mixpanel|amplitude|branch\.io|clarity\.ms/i.test(url);

  const record = (call: Call) => {
    const key = pattern(call.method, call.url);
    peek.patterns[key] = (peek.patterns[key] || 0) + 1;
    if (peek.patterns[key] <= SAMPLES_PER_PATTERN && peek.calls.length < MAX_CALLS) peek.calls.push(call);
    persist();
    update();
  };

  // fetch
  const realFetch = window.fetch;
  window.fetch = async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : String(input instanceof URL ? input.href : input);
    const method = (init?.method || req?.method || 'GET').toUpperCase();
    const res = await realFetch.call(this as typeof window, input, init);
    // read a copy of the answer on the side, so Prepear gets its own straight away
    if (worthKeeping(url))
      (async () => {
        const call: Call = { at: new Date().toISOString(), via: 'fetch', method, url: cleanUrl(url) };
        try {
          const h: Record<string, string> = {};
          new Headers(init?.headers || req?.headers || {}).forEach((v, k) => (h[k] = v));
          call.requestHeaders = headerNames(h);
          if (typeof init?.body === 'string') call.requestBody = parse(init.body);
          else if (init?.body) call.requestBody = `<${Object.prototype.toString.call(init.body)}>`;
          call.status = res.status;
          call.contentType = res.headers.get('content-type');
          if (/json|text|graphql/i.test(call.contentType || '')) call.response = parse(await res.clone().text());
        } catch (e) {
          call.error = String(e);
        }
        record(call);
      })();
    return res;
  } as typeof window.fetch;

  // XMLHttpRequest
  const XHR = XMLHttpRequest.prototype;
  const realOpen = XHR.open;
  const realSetHeader = XHR.setRequestHeader;
  const realSend = XHR.send;
  XHR.open = function (this: any, method: string, url: string | URL, ...rest: any[]) {
    this.__peek = { method: String(method).toUpperCase(), url: String(url), headers: {} as Record<string, string> };
    return (realOpen as any).call(this, method, url, ...rest);
  } as typeof XHR.open;
  XHR.setRequestHeader = function (this: any, k: string, v: string) {
    if (this.__peek) this.__peek.headers[k] = v;
    return realSetHeader.call(this, k, v);
  };
  XHR.send = function (this: any, body?: Document | XMLHttpRequestBodyInit | null) {
    const p = this.__peek;
    if (p && worthKeeping(p.url)) {
      this.addEventListener('loadend', () => {
        const call: Call = { at: new Date().toISOString(), via: 'xhr', method: p.method, url: cleanUrl(p.url), requestHeaders: headerNames(p.headers) };
        try {
          if (typeof body === 'string') call.requestBody = parse(body);
          else if (body) call.requestBody = `<${Object.prototype.toString.call(body)}>`;
          call.status = this.status;
          call.contentType = this.getResponseHeader('content-type');
          if (this.responseType === 'json') call.response = clean(this.response);
          else if (this.responseType === '' || this.responseType === 'text') call.response = parse(this.responseText);
          else call.response = `<${this.responseType}>`;
        } catch (e) {
          call.error = String(e);
        }
        record(call);
      });
    }
    return realSend.call(this, body);
  };

  // WebSockets (Firebase and the like): where they connect, nothing they say
  const RealSocket = window.WebSocket;
  window.WebSocket = function (url: string | URL, protocols?: string | string[]) {
    const u = cleanUrl(String(url));
    if (!peek.sockets.includes(u)) peek.sockets.push(u);
    persist();
    return new RealSocket(url, protocols);
  } as unknown as typeof WebSocket;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, prototype: RealSocket.prototype });

  // ── what the page is, taken when Save is tapped ──
  const storage = (s: Storage) => {
    const out: Record<string, Json> = {};
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)!;
      if (k === STORE) continue;
      const v = s.getItem(k) || '';
      out[k] = SECRET_NAME.test(k) ? hidden(v) : parse(v);
    }
    return out;
  };

  // the page's own globals: what a fresh window doesn't have
  const appGlobals = () => {
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    document.body.appendChild(frame);
    const plain = new Set(Object.keys(frame.contentWindow || {}));
    frame.remove();
    const out: Record<string, Json> = {};
    for (const k of Object.keys(window)) {
      if (plain.has(k) || k === STORE || /^(webkit|on)/.test(k)) continue;
      const v = w[k];
      const t = typeof v;
      if (t === 'function') out[k] = 'function';
      else if (v && t === 'object') {
        try {
          out[k] = { type: v.constructor?.name || 'object', keys: Object.keys(v).slice(0, 40) };
        } catch {
          out[k] = 'object';
        }
      } else out[k] = clean(v);
    }
    // state some frameworks leave on the page
    for (const k of ['__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', '__PRELOADED_STATE__', '__APOLLO_STATE__']) if (w[k]) out[`${k} (content)`] = clean(w[k], 0, 3, 300);
    return out;
  };

  const frameworks = () => {
    const found: string[] = [];
    const ng = document.querySelector('[ng-version]');
    if (ng) found.push(`Angular ${ng.getAttribute('ng-version')}`);
    if (w.angular) found.push(`AngularJS ${w.angular.version?.full ?? ''}`);
    if (w.__NEXT_DATA__) found.push('Next.js');
    if (w.__NUXT__) found.push('Nuxt');
    if (w.Vue || document.querySelector('[data-v-app]')) found.push('Vue');
    if (w.Ember) found.push('Ember');
    if (w.React || [...document.querySelectorAll('body *')].slice(0, 300).some((el) => Object.keys(el).some((k) => k.startsWith('__react')))) found.push('React');
    if (w.firebase || peek.sockets.some((s) => /firebase|firestore/.test(s))) found.push('Firebase');
    if (w.Ionic || document.querySelector('ion-app')) found.push('Ionic');
    return found;
  };

  // the routes the page links to, with ids swapped for :id
  const links = () => {
    const set = new Set<string>();
    document.querySelectorAll('a[href]').forEach((a) => {
      const href = (a as HTMLAnchorElement).href;
      if (href.startsWith(location.origin)) set.add(pattern('', href).trim());
    });
    return [...set].slice(0, 150);
  };

  // API addresses mentioned in the app's own code (finds cookbook and meal plan calls even if they weren't opened)
  const scanCode = async () => {
    const srcs = [...document.scripts].map((s) => s.src).filter(Boolean);
    const found = new Set<string>();
    const ops = new Set<string>();
    for (const src of srcs.slice(0, 40)) {
      try {
        const text = await (await realFetch(src)).text();
        for (const m of text.matchAll(/["'`]((?:https?:\/\/[\w.-]+)?\/[\w./:${}-]*(?:api|graphql|v\d)[\w./:${}?=&-]*)["'`]/gi)) if (found.size < 600) found.add(m[1]);
        for (const m of text.matchAll(/["'`](https?:\/\/[\w.-]+\.[a-z]{2,}(?:\/[\w./-]*)?)["'`]/gi)) if (found.size < 600 && worthKeeping(m[1])) found.add(m[1]);
        for (const m of text.matchAll(/\b(query|mutation)\s+([A-Z]\w+)\s*[({]/g)) if (ops.size < 200) ops.add(`${m[1]} ${m[2]}`);
      } catch {
        /* another host that won't share its code: its address is still in "scripts" */
      }
    }
    return { scripts: srcs.map(cleanUrl), apiAddresses: [...found].map(cleanUrl).sort(), graphqlOperations: [...ops].sort() };
  };

  const report = async () => {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const hosts: Record<string, number> = {};
    for (const r of resources) {
      try {
        const h = new URL(r.name).host;
        hosts[h] = (hosts[h] || 0) + 1;
      } catch {
        /* skip */
      }
    }
    return {
      about: 'Cookbook peek of Prepear (issue #14). Tokens, cookies, passwords and email addresses are left out.',
      version: 1,
      started: peek.started,
      saved: new Date().toISOString(),
      page: { url: cleanUrl(location.href), title: document.title, userAgent: navigator.userAgent },
      frameworks: frameworks(),
      // names only: where the sign-in lives, not what it is
      cookieNames: document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter(Boolean),
      localStorage: storage(localStorage),
      sessionStorage: storage(sessionStorage),
      indexedDB: await (async () => {
        try {
          return (await indexedDB.databases()).map((d) => `${d.name} (v${d.version})`);
        } catch {
          return [];
        }
      })(),
      globals: appGlobals(),
      routes: links(),
      code: await scanCode(),
      hostsLoaded: hosts,
      // before the bookmarklet was tapped: addresses only
      earlierCalls: [...new Set(resources.filter((r) => /fetch|xmlhttprequest/.test(r.initiatorType)).map((r) => cleanUrl(r.name)))].slice(0, 200),
      imageExamples: [...new Set([...document.images].map((i) => i.currentSrc || i.src).filter((s) => /^https?:/.test(s)).map(cleanUrl))].slice(0, 12),
      sockets: peek.sockets,
      callPatterns: peek.patterns,
      calls: peek.calls,
    };
  };

  // ── the panel: drawn on Prepear's page, so it's styled inline ──
  const panel = document.createElement('div');
  panel.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:420px;margin:0 auto;z-index:2147483647;background:#fff;color:#1c1c1e;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.25);padding:14px 16px;font:15px/1.35 -apple-system,system-ui,sans-serif');
  panel.innerHTML = `
    <div style="font-weight:700;font-size:16px;margin-bottom:4px">Cookbook peek <span data-n style="font-weight:400;color:#6e6e73"></span></div>
    <div style="color:#3a3a3c;margin-bottom:10px">Recording. Scroll your recipe list to the end, open a recipe or two, a cookbook with sections and your meal plan. Then Save and send the file to Claude.<br><span style="color:#6e6e73;font-size:13px">If the page reloads, tap the bookmarklet again: it carries on.</span></div>
    <div style="display:flex;gap:8px">
      <button data-save style="flex:1;border:0;border-radius:10px;padding:10px;background:#c4421c;color:#fff;font:inherit;font-weight:600">Save file</button>
      <button data-copy style="flex:1;border:0;border-radius:10px;padding:10px;background:#f2f2f4;color:#1c1c1e;font:inherit;font-weight:600">Copy</button>
      <button data-hide style="border:0;border-radius:10px;padding:10px 12px;background:#f2f2f4;color:#1c1c1e;font:inherit">Hide</button>
    </div>`;
  document.body.appendChild(panel);
  const count = panel.querySelector('[data-n]') as HTMLElement;
  function update() {
    count.textContent = `· ${Object.keys(peek.patterns).length} kinds of call, ${peek.calls.length} saved`;
  }
  update();

  const button = (name: string) => panel.querySelector(`[data-${name}]`) as HTMLButtonElement;
  const busy = async (b: HTMLButtonElement, work: () => Promise<string>) => {
    const label = b.textContent;
    b.textContent = 'Working…';
    try {
      b.textContent = await work();
    } catch (e) {
      b.textContent = 'Failed';
      alert(`Cookbook peek: ${e}`);
    }
    setTimeout(() => (b.textContent = label), 2500);
  };
  button('save').onclick = () =>
    busy(button('save'), async () => {
      const blob = new Blob([JSON.stringify(await report(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'prepear-peek.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      return 'Saved';
    });
  button('copy').onclick = () =>
    busy(button('copy'), async () => {
      // Safari only allows clipboard writes straight from a tap, so hand it a promise of the text
      const text = report().then((r) => JSON.stringify(r));
      if (typeof ClipboardItem === 'undefined') await navigator.clipboard.writeText(await text);
      else await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
      return 'Copied';
    });
  button('hide').onclick = () => (panel.style.display = 'none');

  w[STORE] = { show: () => (panel.style.display = ''), report };
  persist();
}
