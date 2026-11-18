// The home-screen app's launch images: what iOS shows the moment the app is tapped, before the page has loaded.
// Without them iOS shows a blank screen until the page first paints (which waits for the app's stylesheet). Each image
// is index.html's own launch loader (the pot), rendered still, with the lid at rest, at one iPhone screen's size; when
// the page paints, its loader is in the same place and the lid starts rocking. The same approach as the user's HPDE
// app (its #365).
//
//   npm run launch-screens
//
// writes public/launch/*.png and the <link rel="apple-touch-startup-image"> lines in index.html (between the
// "launch images" comments). Run it again after changing the loader in index.html or the list below.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// iOS shows the image whose media query matches the phone exactly, and nothing (a blank screen) when none does: a new
// iPhone size needs a row here. Points (CSS pixels) and pixel ratio, portrait.
const SCREENS = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus and Pro Max, 16 Plus
  { width: 428, height: 926, ratio: 3 }, // 12 and 13 Pro Max, 14 Plus
  { width: 420, height: 912, ratio: 3 }, // Air
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 736, ratio: 3 }, // 6s, 7 and 8 Plus
  { width: 402, height: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 390, height: 844, ratio: 3 }, // 12, 13, 14, 16e
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 and 13 mini
  { width: 375, height: 667, ratio: 2 }, // 6s, 7, 8, SE (2nd and 3rd)
  { width: 320, height: 568, ratio: 2 }, // SE (1st)
];

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'public', 'launch');
const START = '<!-- launch images: start -->';
const END = '<!-- launch images: end -->';

const file = ({ width, height, ratio }) => `/launch/${width}x${height}@${ratio}x.png`;
const link = (s) =>
  `<link rel="apple-touch-startup-image" media="(device-width: ${s.width}px) and (device-height: ${s.height}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)" href="${file(s)}" />`;

(async () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  if (!html.includes(START) || !html.includes(END)) throw new Error(`index.html needs the ${START} and ${END} comments`);
  // index.html as it first paints: no scripts (the app's, and the one that takes the loader away in automated
  // browsers), and the loader held still at its first frame (the lid at rest, the pot unsquashed)
  const page0 = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace('</head>', '<style>.ck-launch * { animation: none !important; }</style></head>');

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const s of SCREENS) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.ratio });
    await page.setContent(page0);
    if (!(await page.locator('#ck-launch .ck-launch-lid').isVisible())) throw new Error('the loader isn’t showing');
    await page.screenshot({ path: path.join(ROOT, 'public', file(s)) });
    console.log(`wrote public${file(s)} (${s.width * s.ratio}×${s.height * s.ratio})`);
    await page.close();
  }
  await browser.close();

  const indent = html.slice(html.lastIndexOf('\n', html.indexOf(START)) + 1, html.indexOf(START));
  const block = [START, ...SCREENS.map(link), END].join(`\n${indent}`);
  fs.writeFileSync(INDEX, html.slice(0, html.indexOf(START)) + block + html.slice(html.indexOf(END) + END.length));
  console.log(`updated the launch image links in index.html (${SCREENS.length})`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
