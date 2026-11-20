/*
  The app's font (issue #135): Parkinsans at 90%, unless another is picked in Settings → Appearance → Font
  (src/pages/FontPage.tsx), with its own sizes. Loaded by index.html's head before the first paint, and used by the app
  afterwards (src/data/font.ts) through window.ckFonts, so the font and its sizes are drawn the same way from the first
  frame (a font arriving after the first paint drew everything twice).

  The choice is kept on this phone (localStorage 'ck-fonts'): { font, sizes: { [font]: { display, text } } }. Sizes are
  percentages for the font for titles and buttons (display) and the font for reading (text), kept per font because each
  runs larger or smaller. They scale the font itself (@font-face size-adjust), not the layout.
  The default (Parkinsans, 90% and 90%) writes nothing: src/theme/cookbook.css has it, so it never depends on this file.
*/
(function () {
  var KEY = 'ck-fonts';
  var DEFAULT_FONT = 'parkinsans';
  // a font's sizes until they're changed: Parkinsans runs large, the user picked 90% for both
  var LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
  var EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
  // each face's files in /fonts and its weight range
  var FACES = {
    fredoka: { weight: '300 700', ext: true },
    nunito: { weight: '200 1000', ext: true },
    'funnel-display': { weight: '300 800' },
    'funnel-sans': { weight: '300 800' },
    parkinsans: { weight: '300 800', ext: true },
    'red-hat-display': { weight: '300 900' },
    'red-hat-text': { weight: '300 700' },
  };
  // the fonts being tried: the face for titles and buttons, and the face for reading
  var FONTS = {
    fredoka: { display: 'fredoka', text: 'nunito' },
    funnel: { display: 'funnel-display', text: 'funnel-sans' },
    parkinsans: { display: 'parkinsans', text: 'parkinsans' },
    redhat: { display: 'red-hat-display', text: 'red-hat-text' },
  };
  function defaultSizes(id) {
    return id === 'parkinsans' ? { display: 90, text: 90 } : { display: 100, text: 100 };
  }
  var FALLBACK = "-apple-system, system-ui, 'SF Pro Text', 'Helvetica Neue', sans-serif";

  function clampSize(n) {
    n = Math.round(Number(n));
    return n >= 70 && n <= 140 ? n : 100;
  }

  function read() {
    var t = null;
    try { t = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!t || typeof t !== 'object') t = {};
    var sizes = {};
    for (var id in FONTS) {
      var s = t.sizes && t.sizes[id];
      if (s) sizes[id] = { display: clampSize(s.display), text: clampSize(s.text) };
    }
    return { font: FONTS[t.font] ? t.font : DEFAULT_FONT, sizes: sizes };
  }

  function faceRule(family, file, scale) {
    var f = FACES[file];
    var rule = function (name, range) {
      var url = "url('/fonts/" + file + '-' + name + ".woff2')";
      return '@font-face { font-family: \'' + family + '\'; font-style: normal; font-display: block; font-weight: ' + f.weight +
        '; size-adjust: ' + scale + '%; src: ' + url + " format('woff2-variations'), " + url + " format('woff2'); unicode-range: " + range + '; }';
    };
    return rule('latin', LATIN) + (f.ext ? '\n' + rule('latin-ext', EXT) : '');
  }

  var preloaded = {};
  function preload(file) {
    if (preloaded[file]) return;
    preloaded[file] = true;
    var l = document.createElement('link');
    l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.crossOrigin = 'anonymous'; l.href = '/fonts/' + file + '-latin.woff2';
    document.head.appendChild(l);
  }

  function apply(t) {
    var html = document.documentElement;
    var font = FONTS[t.font] ? t.font : DEFAULT_FONT;
    var size = t.sizes[font] || defaultSizes(font);
    var usual = defaultSizes(DEFAULT_FONT);
    var css = '';
    if (font !== DEFAULT_FONT || size.display !== usual.display || size.text !== usual.text) {
      var f = FONTS[font];
      css = faceRule('ck-display', f.display, size.display) + '\n' + faceRule('ck-text', f.text, size.text) + '\n' +
        ':root:root { --ck-font-display: \'ck-display\', ' + FALLBACK + '; --ck-font: \'ck-text\', ' + FALLBACK + '; }';
      if (font !== DEFAULT_FONT) { preload(f.display); preload(f.text); }
    }
    var style = document.getElementById('ck-fonts');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ck-fonts';
      document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    if (font === DEFAULT_FONT) delete html.dataset.font;
    else html.dataset.font = font;
  }

  function save(t) {
    try {
      localStorage.setItem(KEY, JSON.stringify(t));
    } catch (e) {
      // private browsing: the change still shows until the app is closed
    }
    apply(t);
  }

  window.ckFonts = { read: read, save: save, defaultSizes: defaultSizes };
  apply(read());
})();
