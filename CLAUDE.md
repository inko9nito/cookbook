# Cookbook — instructions for Claude

Personal recipe PWA for one user on an iPhone. Mobile-first, iOS-native feel. Full plan: `docs/PLAN.md`.

## Non-negotiable: never hand-roll iOS UI
- UI library is **Framework7 v9 + framework7-react**, theme locked to `ios`.
- Use Framework7 components for every sheet, popup, drawer, page transition, swipe gesture, action sheet, picker, stepper, sortable list, swipeout, toast, searchbar, and tab bar.
- Use the **Framework7 router** (not React Router) so iOS push transitions and swipe-back work.
- Do **not** write custom CSS or JS for animations, transforms, gestures, or z-index. Do not wrap `Page` content in custom scroll containers.
- Custom styling is limited to colors, spacing, and typography, preferably through Framework7 CSS variables.
- If Framework7 lacks something, **stop and ask the user** before building a custom version.
- Check the Framework7 v9 docs for a component's props before using it. Don't guess.

## Design: the Cookbook design system
- Spec: `DESIGN.md`. Tokens and Framework7 mapping: `src/theme/cookbook.css`. Visual check: in-app Settings → Style Guide.
- The user picked each component's shape from a different design system (RED, Starbucks, Headspace, Pinterest, Instacart, DoorDash) and unified all colors: Cool grey neutrals, **Tomato `#e4572e`** accent, iPhone system font. Light mode only for now.
- Never hard-code colors in components. Use `var(--ck-*)` tokens or Framework7 variables. Add new tokens to `cookbook.css` and `DESIGN.md` (both the YAML front matter and the prose) together.
- Tomato for **text** is `--ck-accent-ink` `#c4421c` (also Framework7's theme color); bright Tomato `--ck-accent` is for fills only. Muted text is `#6e6e73`. These were chosen to pass WCAG AA contrast.
- **Icons: Lucide only** (`lucide-react`, the same library as the user's other apps). Use the shared props in `src/components/ui/icons.ts` (`navIcon`, `tabIcon`, `inlineIcon`). Don't add another icon set. Framework7's built-in glyphs (back chevron, list chevrons, checkmarks, search magnifier) stay as they are.
- The repo is public: never commit the user's personal or scraped recipe photos. `src/theme/placeholder-photos.css` is temporary until real photos exist.

## Impeccable (design quality)
- Installed for Claude Code at `.claude/skills/impeccable` (v4.9.1, copied from github.com/pbakaus/impeccable because impeccable.style is blocked in cloud sessions). Its design hook in `.claude/settings.json` checks UI files after every edit and does a deeper pass at the end of a turn.
- Context: `PRODUCT.md` (who and why) and `DESIGN.md` (tokens and components) at the repo root. Keep both current.
- After building or changing a screen, run `/impeccable polish <screen>` or `/impeccable audit <screen>`. Before calling UI work done, scan the running app: `CHROME_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome .claude/skills/impeccable/scripts/impeccable detect http://localhost:4173/` (after `npm run build && npx vite preview --port 4173`). Fix findings rather than ignoring them; record any deliberate exception in `.impeccable/config.json` with a reason.
- Impeccable guidance never overrides the Framework7 rules above: no hand-built animations, gestures or z-index.

## Stack
Vite + TypeScript, TanStack Query, Zod, vite-plugin-pwa, `parse-ingredient`.
Everything runs on **Netlify**: static hosting, Netlify Functions (API), Netlify Database (Postgres), Netlify Blobs (photos), Netlify Identity with Google sign-in (invite-only, the user's account only). Do NOT add Supabase or any second service; the user wants one.
Live site: https://cookbk.netlify.app
No reminders feature (user declined).

## Data rules
- Always keep the raw ingredient line exactly as typed, alongside the parsed fields.
- Cookbooks and meal plans reference recipes by id. Never copy recipe data into them.

## Requirements from the user's Prepear frustrations (see docs/PLAN.md §2)
- R1 recipe sort defaults to newest-first and is remembered. R2 filter recipes by tags.
- R4 ingredient edit sheet: only Amount / Unit / Ingredient / Note, changes apply live, single Done.
- R5 ranges scale ("1-2 tsp" ×2 → "2-4 tsp"); non-numeric amounts are never silently scaled.
- R6 pasting ignores blank lines; heading-like lines become section headers, not steps.
