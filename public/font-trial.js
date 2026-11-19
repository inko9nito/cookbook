/*
  Trying fonts (issue #135). Loaded by index.html's head before the first paint, and used by the app afterwards
  (src/data/font.ts) through window.ckFontTrial, so the font and its sizes are drawn the same way from the first frame
  (a font arriving after the first paint drew everything twice).

  The trial is kept on this phone only (localStorage 'ck-font-trial'): { font, sizes: { [font]: { display, text } },
  button }. Sizes are percentages for the font for titles and buttons (display) and the font for reading (text), kept
  per font because each runs larger or smaller. They scale the font itself (@font-face size-adjust), not the layout.
  Fredoka + Nunito at 100% writes nothing: the app's own @font-face rules and tokens (src/theme/cookbook.css) apply.
*/
(function () {
  var KEY = 'ck-font-trial';
  var LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
  var EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
  // each face's files in /fonts and its weight range
  var FACES = {
    fredoka: { weight: '300 700', ext: true },
    nunito: { weight: '200 1000', ext: true },
    'funnel-display': { weight: '300 800' },
    'funnel-sans': { weight: '300 800' },
    parkinsans: { weight: '300 800' },
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
  var FALLBACK = "-apple-system, system-ui, 'SF Pro Text', 'Helvetica Neue', sans-serif";

  function clampSize(n) {
    n = Math.round(Number(n));
    return n >= 70 && n <= 140 ? n : 100;
  }

  function read() {
    var t = null;
    try { t = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!t || typeof t !== 'object') {
      t = {};
      // the first version kept only the font, as 'ck-font'
      try { t.font = localStorage.getItem('ck-font'); } catch (e) {}
    }
    var sizes = {};
    for (var id in FONTS) {
      var s = t.sizes && t.sizes[id];
      if (s) sizes[id] = { display: clampSize(s.display), text: clampSize(s.text) };
    }
    // the Aa button starts out shown; in automated checks (check:ui) hidden, so it isn't over every screenshot
    var button = typeof t.button === 'boolean' ? t.button : !navigator.webdriver;
    return { font: FONTS[t.font] ? t.font : 'fredoka', sizes: sizes, button: button };
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
    var font = FONTS[t.font] ? t.font : 'fredoka';
    var size = t.sizes[font] || { display: 100, text: 100 };
    var css = '';
    if (font !== 'fredoka' || size.display !== 100 || size.text !== 100) {
      var f = FONTS[font];
      css = faceRule('ck-display', f.display, size.display) + '\n' + faceRule('ck-text', f.text, size.text) + '\n' +
        ':root:root { --ck-font-display: \'ck-display\', ' + FALLBACK + '; --ck-font: \'ck-text\', ' + FALLBACK + '; }';
      if (font !== 'fredoka') { preload(f.display); preload(f.text); }
    }
    var style = document.getElementById('ck-font-trial');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ck-font-trial';
      document.head.appendChild(style);
    }
    if (style.textContent !== css) style.textContent = css;
    if (font === 'fredoka') delete html.dataset.font;
    else html.dataset.font = font;
  }

  function save(t) {
    try {
      localStorage.setItem(KEY, JSON.stringify(t));
      localStorage.removeItem('ck-font');
    } catch (e) {
      // private browsing: the change still shows until the app is closed
    }
    apply(t);
  }

  window.ckFontTrial = { read: read, save: save };
  apply(read());
})();
