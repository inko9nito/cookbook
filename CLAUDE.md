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

## Stack
Vite + TypeScript, TanStack Query, Zod, vite-plugin-pwa, `parse-ingredient`.
Everything runs on **Netlify**: static hosting, Netlify Functions (API), Netlify Database (Postgres), Netlify Blobs (photos), single-user passcode login. Fallback for data only: Supabase.
No reminders feature (user declined).

## Data rules
- Always keep the raw ingredient line exactly as typed, alongside the parsed fields.
- Cookbooks and meal plans reference recipes by id. Never copy recipe data into them.

## Requirements from the user's Prepear frustrations (see docs/PLAN.md §2)
- R1 recipe sort defaults to newest-first and is remembered. R2 filter recipes by tags.
- R4 ingredient edit sheet: only Amount / Unit / Ingredient / Note, changes apply live, single Done.
- R5 ranges scale ("1-2 tsp" ×2 → "2-4 tsp"); non-numeric amounts are never silently scaled.
- R6 pasting ignores blank lines; heading-like lines become section headers, not steps.
