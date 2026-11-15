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

## Design

The app uses its own **Cookbook design system** (`DESIGN.md`): component shapes picked from six design systems, with one unified theme (Cool grey, Tomato accent, iPhone system font). See it on the phone under Settings → Style Guide.

- Icons: [Lucide](https://lucide.dev) (`lucide-react`).
- Design quality: [Impeccable](https://impeccable.style) is installed for Claude Code (`.claude/skills/impeccable`), with `PRODUCT.md` and `DESIGN.md` as its context. Scan the running app with `.claude/skills/impeccable/scripts/impeccable detect http://localhost:4173/`.
