# Cookbook

Personal recipe app (PWA) for iPhone, built with Framework7 v9 (iOS theme) + React, hosted on Netlify at https://cookbk.netlify.app.

- Plan and requirements: [`docs/PLAN.md`](docs/PLAN.md)
- Rules for Claude: [`CLAUDE.md`](CLAUDE.md)

## Develop

```bash
npm install
npm run dev       # local dev server (demo data, no sign-in)
npm test          # ingredient parsing and scaling, and the database queries on a local Postgres
npm run build     # typecheck (app and API) + production build to dist/
```

Netlify builds with `npm run build`, publishes `dist/`, deploys the API in `netlify/functions/` and applies the database migrations in `netlify/database/migrations/` (see `netlify.toml`).

**Running locally** (`localhost`), the app uses a demo backend: the sample recipes in memory, no sign-in, nothing saved. Sign-in only works on a Netlify deploy (Netlify Identity doesn't run locally). Add `?signin` to the address to see the sign-in screen.

## Netlify setup (once, in the Netlify UI)

1. **Plan:** Netlify Database needs a credit-based plan (the Free plan has one).
2. **Identity:** Project configuration → Identity → Enable Identity. Registration → **Invite only**. External providers → add **Google**. Then Users → **Invite users** → your Google address. Open the invite email's link, then tap Continue with Google.
3. **Owner:** Project configuration → Environment variables → add `OWNER_EMAIL` = your Google address (scope: Functions). The API answers no one else, even if registration is left open.
4. **Database and photos** need nothing: installing `@netlify/database` makes Netlify create the database on the next deploy and apply the migrations; photos go in a Netlify Blobs store called `photos`.

## Status

**Phase 0 (feel check):** done. The design is in `DESIGN.md`.

**Phase 1 (foundations):**
- Netlify Database: recipes and settings (`netlify/database/migrations/`), seeded with the five sample recipes.
- API (`netlify/functions/`): `/api/recipes`, `/api/settings`, `/api/photos` (Netlify Blobs), owner-only.
- Google sign-in (Netlify Identity, invite-only) on a Framework7 login screen.
- The app reads and saves through TanStack Query, shows changes at once, and keeps a copy in IndexedDB so recipes open offline. Photos are cached offline too.
- Ingredient parser (`parse-ingredient`) and scaling engine with tests (`src/lib/ingredients.ts`): ranges, fractions, units that agree with the amount, header lines when pasting.
- Recipes list: remembered sort (R1), tag chips from the tags in use, matching all or any, remembered (R2).

## Design

The app uses its own **Cookbook design system** (`DESIGN.md`): component shapes picked from six design systems, with one unified theme (Cool grey, Tomato accent, iPhone system font). See it on the phone under Settings → Style Guide.

- Icons: [Lucide](https://lucide.dev) (`lucide-react`).
- Design quality: [Impeccable](https://impeccable.style) is installed for Claude Code (`.claude/skills/impeccable`), with `PRODUCT.md` and `DESIGN.md` as its context. Scan the running app with `.claude/skills/impeccable/scripts/impeccable detect http://localhost:4173/`.
