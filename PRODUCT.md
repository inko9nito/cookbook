# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(An installable web app, a PWA, used almost entirely on the owner's iPhone from the home screen. It must look and behave like a native iOS app.)

## Users

One person: the owner. She cooks at home, saves recipes from websites, organizes them into cookbooks and plans meals for the week. She uses the app on her iPhone, often in the kitchen with messy hands, and while browsing recipe sites in Safari.

## Product Purpose

A personal replacement for Prepear, a paid recipe app that stopped improving. It stores her recipes, cookbooks and meal plans, and fixes the specific problems that made Prepear frustrating. Success means she stops opening Prepear: getting a recipe in is fast, finding it again is easy, and cooking from it on the phone is reliable.

## Positioning

Built for exactly one cook's habits, with no social, discovery or sharing features to work around. Every screen exists for her own collection.

## Operating Context

- Saving: from Safari's share sheet while reading a recipe website (some sites block Prepear's importer), or by pasting ingredient and direction lists.
- Cooking: reading ingredients and steps on the phone in the kitchen, scaling servings up or down, checking off ingredients.
- Organizing: cookbooks with sections (for example "Everything else" → Meat / Seafood / Other), and reusable meal-plan templates placed onto a weekly calendar.
- About 353 recipes, 16 cookbooks and 1 meal plan to bring over from Prepear (no export exists; a bookmarklet run while logged into app.prepear.com is the plan).

## Capabilities and Constraints

- Requirements from Prepear frustrations (see `docs/PLAN.md` §2):
  - R1: recipe sort defaults to newest first and is remembered.
  - R2: filter recipes by tags.
  - R3: importing works even on sites that block importers.
  - R4: editing an ingredient uses one simple sheet (Amount, Unit, Ingredient, Note) with live changes and a single Done.
  - R5: ranges scale correctly ("1–2 tsp" ×2 → "2–4 tsp").
  - R6: pasting skips blank lines and turns heading-like lines into section headers.
  - R7: reorder by drag and delete by swipe without a separate edit mode.
  - R8: full export so data is never locked in.
- Stack: Vite + React + TypeScript, Framework7 v9 (iOS theme) for every native-feeling component, gesture and transition. Hosting, functions, database, photo storage and Google sign-in all on Netlify (one service only).
- No reminders feature (declined by the user).
- The GitHub repository is public. Sample photos in `public/photos/` were committed with the owner's approval; real recipe photos belong in Netlify Blobs, not the repo.

## Brand Commitments

- Name: Cookbook.
- Feel: friendly and casual, like a well-made iPhone app; not a business tool.
- The visual system is recorded in `DESIGN.md` (component shapes chosen from six design systems, unified Cool grey neutrals, Tomato accent, iPhone system font).
- Icons: Lucide only.

## Evidence on Hand

- Screen recordings of Prepear's add-recipe, recipe page, cookbook and meal-plan flows (shared in chat, not in the repo).
- Sample recipes with six sample photos (`public/photos/`); the app runs on sample data until Phase 1.

## Product Principles

1. Native first: every interaction should feel like iOS. Use Framework7's components rather than hand-built imitations.
2. Fewer taps than Prepear for the things done most: saving, finding and cooking a recipe.
3. Never lose data: drafts autosave, the raw ingredient text is always kept, and everything can be exported.
4. Remember choices: sort, filters and settings stay as she left them.

## Accessibility & Inclusion

Comfortable reading at arm's length in a kitchen: legible text sizes, strong contrast on anything she reads while cooking, and large tap targets.
