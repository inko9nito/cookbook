// Imports Open Design design systems (https://github.com/feimacode/open-design-agent-kit)
// into src/theme/design-systems.json, keeping only the tokens the Framework7 adapter uses.
//
// Usage:
//   git clone --depth 1 https://github.com/feimacode/open-design-agent-kit /tmp/odak
//   node scripts/import-design-systems.mjs /tmp/odak/packages/content/assets/open-design/design-systems
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Pass the path to .../open-design/design-systems');
  process.exit(1);
}

// Tokens the adapter (src/theme/adapter.css) maps onto Framework7 variables.
const KEEP = [
  'bg', 'surface', 'surface-warm', 'fg', 'fg-2', 'muted', 'border', 'border-soft',
  'accent', 'accent-on', 'danger', 'success',
  'font-display', 'font-body', 'tracking-display',
  'radius-sm', 'radius-md', 'radius-lg',
];

const parseRoot = (css) => {
  const block = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  const vars = {};
  if (!block) return vars;
  for (const m of block[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[m[1]] = m[2].trim();
  return vars;
};

// Inline var(--x) references so each kept token stands on its own.
const resolve = (value, all, depth = 0) =>
  depth > 8 ? value : value.replace(/var\(--([a-z0-9-]+)\)/gi, (_, n) => (all[n] ? resolve(all[n], all, depth + 1) : `var(--${n})`));

const out = [];
for (const id of fs.readdirSync(src).sort()) {
  const dir = path.join(src, id);
  const tokensFile = path.join(dir, 'tokens.css');
  const manifestFile = path.join(dir, 'manifest.json');
  if (!fs.existsSync(tokensFile) || !fs.existsSync(manifestFile)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const all = parseRoot(fs.readFileSync(tokensFile, 'utf8'));
  const tokens = {};
  for (const k of KEEP) if (all[k]) tokens[k] = resolve(all[k], all);
  if (!tokens.bg || !tokens.accent || !tokens.fg) continue;
  let summary = '';
  const designFile = path.join(dir, 'DESIGN.md');
  if (fs.existsSync(designFile)) {
    const quote = fs
      .readFileSync(designFile, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('>') && !/^>\s*Category:/i.test(l))
      .map((l) => l.replace(/^>\s?/, '').trim())
      .join(' ')
      .trim();
    summary = quote.slice(0, 220);
  }
  out.push({ id, name: manifest.name ?? id, category: manifest.category ?? 'Other', summary, tokens });
}

const dest = path.resolve('src/theme/design-systems.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`Wrote ${out.length} design systems to ${path.relative(process.cwd(), dest)}`);
