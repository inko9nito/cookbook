# Cookbook

Personal recipe app (PWA) for iPhone, built with Framework7 v9 (iOS theme) + React, hosted on Netlify at https://cookbk.netlify.app.

- Plan and requirements: [`docs/PLAN.md`](docs/PLAN.md)
- Rules for Claude: [`CLAUDE.md`](CLAUDE.md)

## Develop

```bash
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build to dist/
```

Netlify builds with `npm run build` and publishes `dist/` (see `netlify.toml`).

## Status

**Phase 0 (feel check):** demo screens with in-memory sample data, so nothing is saved yet. Covers:
- tab bar
- recipe list with remembered sort and tag filters
- push and swipe-back to a recipe
- servings scaling, including ranges
- the New/Edit Recipe popup, with swipe-down to close and a discard prompt
- the ingredient sheet
- paste ingredients
- drag to reorder and swipe to delete

## Design systems

Settings (gear icon) → **Design System** lets you pick any of 195 Open Design design systems. The choice applies live and is remembered.
To refresh the token data:

```bash
git clone --depth 1 https://github.com/feimacode/open-design-agent-kit /tmp/odak
node scripts/import-design-systems.mjs /tmp/odak/packages/content/assets/open-design/design-systems
```
