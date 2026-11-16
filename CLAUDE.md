# Cookbook — instructions for Claude

Personal recipe PWA for one user on an iPhone. Mobile-first, iOS-native feel. Full plan: `docs/PLAN.md`.

## Non-negotiable: never hand-roll iOS UI
- UI library is **Framework7 v9 + framework7-react**, theme locked to `ios`.
- Use Framework7 components for every sheet, popup, drawer, page transition, swipe gesture, action sheet, picker, stepper, sortable list, swipeout, toast, searchbar, and tab bar.
- Use the **Framework7 router** (not React Router) so iOS push transitions and swipe-back work.
- Do **not** write custom CSS or JS for animations, transforms, gestures, or z-index. Do not wrap `Page` content in custom scroll containers.
- Custom styling is limited to colors, spacing, corners and typography, preferably through Framework7 CSS variables.
- **No iOS 26 look.** The user rejected Framework7 v9's liquid glass, floating tab bar and capsule nav buttons. The "Not iOS 26" block in `src/theme/cookbook.css` restyles them to the agreed design (flat docked tab bar, left titles, separate round buttons). Keep new screens consistent with it.
- If Framework7 lacks something, **stop and ask the user** before building a custom version.
- **Approved exception (Nov 2026):** cook mode's split screen (Ingredients over Directions, each half scrolling on its own) with a hand-built drag handle between them (`src/components/CookMode.tsx`), because Framework7 has no split view. The handle only sets the top half's height (pointer events, no transforms, animation or z-index: it is last in the markup and each half has `isolation: isolate`, so it paints on top). Don't reuse it elsewhere without asking.
- **Approved exception (Nov 2026):** photo cropping uses **Cropper.js 1.x** (`src/components/PhotoCropper.tsx`), because Framework7 has no cropper. It runs inside a Framework7 Popup, with a fixed 4:3 frame (pinch to zoom, drag to move). Swiping through photos and full-screen zoom stay Framework7 (Swiper, Photo Browser).
- **Approved exception (Nov 2026):** Settings → Version has a refresh icon that **spins** (a CSS rotation, `.ck-spinning`) while it checks for a new version of the app, because the user asked for exactly that instead of Framework7's preloader dialog and a toast. Don't reuse the spin elsewhere without asking.
- Check the Framework7 v9 docs for a component's props before using it. Don't guess.

## Workflow: preview before merging
- Every change goes to the user as a **pull request with a Netlify deploy preview**: push to the working branch, open a PR into `main` if none is open (or keep updating the open one), and give the user the preview link `https://deploy-preview-<PR number>--cookbk.netlify.app` each time it updates.
- **Merge only when the user asks.** They look at the preview on the phone first.
- **Plans live in their GitHub issue.** For an issue worked through in steps (e.g. #14, the Prepear import), keep the plan in the issue's description: tick steps as they land, note decisions and open questions, and add a dated line under Status at each milestone (PR opened, waiting on the user, merged). Update it as part of the work, without being asked. No private data in it (the repo and its issues are public).
- Preview links are public, and a preview has its own copy of the production database (real recipes). Previews share the photo store with production.

## Design: the Cookbook design system
- Spec: `DESIGN.md`. Tokens and Framework7 mapping: `src/theme/cookbook.css`. Visual check: in-app Settings → Style Guide.
- The user picked each component's shape from a different design system (RED, Starbucks, Headspace, Pinterest, Instacart, DoorDash; recipe cards from Prepear itself) and unified all colors: Cool grey neutrals, **Tomato `#e4572e`** accent, iPhone system font. Light mode only for now.
- Never hard-code colors in components. Use `var(--ck-*)` tokens or Framework7 variables. Add new tokens to `cookbook.css` and `DESIGN.md` (both the YAML front matter and the prose) together.
- Tomato for **text** is `--ck-accent-ink` `#c4421c` (also Framework7's theme color); bright Tomato `--ck-accent` is for fills only. Muted text is `#6e6e73`. These were chosen to pass WCAG AA contrast.
- **Icons: Lucide only** (`lucide-react`, the same library as the user's other apps). Use the shared props in `src/components/ui/icons.ts` (`navIcon`, `tabIcon`, `inlineIcon`). Don't add another icon set. Framework7's built-in glyphs (back chevron, list chevrons, checkmarks, search magnifier) stay as they are.
- The repo is public. The user explicitly approved committing the sample photos in `public/photos/` (cropped from their Prepear recordings; mostly from recipe websites). Don't add more third-party photos without asking. Real photos will live in Netlify Blobs (Phase 1). A recipe without a photo shows plain soft grey with a muted chef hat (`.ck-photo-empty`), never a colored placeholder.

## Impeccable (design quality)
- Installed for Claude Code at `.claude/skills/impeccable` (v4.9.1, copied from github.com/pbakaus/impeccable because impeccable.style is blocked in cloud sessions). Its design hook in `.claude/settings.json` checks UI files after every edit and does a deeper pass at the end of a turn.
- Context: `PRODUCT.md` (who and why) and `DESIGN.md` (tokens and components) at the repo root. Keep both current.
- After building or changing a screen, run `/impeccable polish <screen>` or `/impeccable audit <screen>`. Before calling UI work done, scan the running app: `CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome .claude/skills/impeccable/scripts/impeccable detect http://localhost:4173/` (after `npm run build && npx vite preview --port 4173`). Fix findings rather than ignoring them; record any deliberate exception in `.impeccable/config.json` with a reason.
- Impeccable only scans a page as it first loads. Also run **`npm run check:ui`** (with the preview server running): it taps through interactive states (selected segments, swiped rows, open sheets and action sheets, the editor), runs axe contrast checks and flags overlapping buttons, and saves screenshots to `ui-states/`. **Look at those screenshots** before saying UI work is done. It runs in Chromium; iPhone Safari can still differ (e.g. sticky hover after a tap), so ask the user to check on the phone.
- When you add a screen or an interactive state, add it to `scripts/check-ui-states.cjs`.
- Impeccable guidance never overrides the Framework7 rules above: no hand-built animations, gestures or z-index.

## Stack
Vite + TypeScript, TanStack Query, Zod, vite-plugin-pwa, `parse-ingredient`, Vitest.
Everything runs on **Netlify**: static hosting, Netlify Functions (API), Netlify Database (Postgres), Netlify Blobs (photos), Netlify Identity with Google sign-in (invite-only, the user's account only). Do NOT add Supabase or any second service; the user wants one.
Live site: https://cookbk.netlify.app

### Where things are (Phase 1)
- `src/lib/recipe.ts`: the recipe shape (Zod), shared by the app and the API. `src/lib/ingredients.ts`: parsing and scaling (tests beside it; run `npm test`).
- `src/data/`: `api.ts` (the API client, plus a **demo backend** used on `localhost` so the UI check runs without sign-in), `identity.ts` + `auth.tsx` (Netlify Identity with Google through **gotrue-js, the same way as the user's HPDE app**: the sign-in lives in localStorage only, never cookies, which iOS drops when it closes the home-screen app; every API call sends `Authorization: Bearer`; renewed when the app comes to the front; a renewal that fails offline doesn't sign out), `store.tsx` (TanStack Query, optimistic changes, IndexedDB cache; `useStore()` is what pages use).
- `netlify/functions/*.mts`: the API (v2 functions, `export default`), each checks `refuseUnlessAdmin(req)` first: it asks Netlify Identity (`/.netlify/identity/user`) whose Bearer token it is and requires the `admin` role (given in the Netlify UI; counts at once). `netlify/lib/`: shared server code, tested against a local Postgres (`@netlify/database-dev`).
- `netlify/database/migrations/`: SQL migrations applied by the deploy. **Never edit or delete one that has been deployed**; add a new one (`<timestamp>_<slug>.sql`). Never run DDL against the hosted database directly.
- Photos: picked and cropped on the phone, uploaded to Netlify Blobs (`photos` store) on save; the recipe stores their `/api/photos/<key>` addresses. Reading a photo needs no sign-in (`<img>` can't send the header; keys are random UUIDs); storing one needs the admin role. Only the production deploy deletes stored photos (deploy previews share the store).
- Prepear import (issue #14, `docs/PLAN.md` §6): `src/prepear/peek.ts` is the peek bookmarklet (self-contained: Settings → Import → From Prepear turns the function's own source into the bookmarklet). `npm run check:peek` checks on a fake page that its file leaves out tokens, cookies and email addresses. The peek file has real recipe data: it comes to Claude in chat, never into this public repo.
- Deploy previews get their own copy of the production database, with real recipes, and preview links are public: say so before sharing one.
No reminders feature (user declined).

## Data rules
- Always keep the raw ingredient line exactly as typed, alongside the parsed fields.
- Cookbooks, meal plans and ingredients made from another recipe (`recipeId`, issue #11) reference recipes by id. Never copy recipe data into them.

## Requirements from the user's Prepear frustrations (see docs/PLAN.md §2)
- R1 recipe sort defaults to newest-first and is remembered. R2 filter recipes by tags.
- R4 ingredient edit sheet: only Amount / Unit / Ingredient / Note, changes apply live, single Done.
- R5 ranges scale ("1-2 tsp" ×2 → "2-4 tsp"); non-numeric amounts are never silently scaled.
- R6 pasting ignores blank lines; heading-like lines become section headers, not steps.
