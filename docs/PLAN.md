# Cookbook — Plan

A personal recipe app to replace the subscription app I've been using. It's for one user (me), on my iPhone, as an installable web app (PWA) that should feel native.

**Current focus: creating and editing recipes.** Cookbooks and meal plans come later, but the architecture needs to plan for them now.

---

## 1. UI library decision

### The rule
We do **not** build iOS components, animations, gestures, or overlay stacking ourselves. Every drawer, sheet, page transition, swipe-back, action sheet, swipe-to-delete row, reorder handle, picker, and toast comes from the library. If the library doesn't have something, we stop and decide together. We don't hand-roll a replacement.

### Choice: **Framework7 v9 + Framework7 React (React 19)**

Why Framework7:

| Need | Framework7 provides |
|---|---|
| Native-feeling navigation | Its own router with iOS push/pop page transitions, **swipe-back from the left edge**, and a navbar whose title animates between pages |
| Current iOS look | v9 ships **iOS 26 styling** across all components |
| Drawers / bottom sheets | `Sheet` with swipe-to-close, swipe-to-step, and breakpoints, plus a backdrop |
| Full-screen "New Recipe" form | `Popup` with swipe-to-close and the iOS "push" style (the page behind shrinks back, like the iOS compose screens) |
| Overlay stacking / z-index | Handled by the framework's modal stack, so we never set z-index ourselves |
| Ingredient and step editing | `List` with **sortable** (drag handles to reorder) and **swipeout** (swipe left to delete) |
| Servings | `Stepper` |
| Times, categories, tags | `Picker`, `Smart Select`, `Chips` |
| Confirmations | `Actions` (iOS action sheet), `Dialog` |
| Recipe photos | `Photo Browser` (pinch-zoom, swipe between photos) |
| Lists of many recipes | `Searchbar`, `Virtual List`, `Pull to refresh` |
| Cook mode / other extras | `Tabs`, `Toast`, `Preloader`, Framework7 Icons (SF Symbols look-alikes) |

**Runner-up: Ionic 9 (React).** It's company-backed, has a very solid overlay system, and now supports React Router 6. But it does **not** ship official iOS 26 styling (only community themes), and it lacks a stepper and photo browser. It's the fallback if Framework7 turns out to have a dealbreaker.

**Not chosen:** Konsta UI (components only, no router or page transitions; it's meant to be paired with Framework7 or Ionic). Building on plain React + Radix/shadcn (that's the "build all the iOS feel ourselves" path we want to avoid).

### Rules that come with this choice
- **Use the Framework7 router, not React Router.** The iOS transitions and swipe-back depend on it.
- Use Framework7 layout primitives (`App`, `View`, `Page`, `Navbar`, `Toolbar`). Don't wrap pages in custom scroll containers.
- No custom CSS for animation, transforms, or z-index. Styling is limited to colors, spacing, and typography through Framework7 CSS variables.
- Theme is locked to `ios`, with automatic dark mode.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Build | Vite + TypeScript | |
| UI | Framework7 v9, framework7-react, framework7-icons | see above |
| PWA | `vite-plugin-pwa` | "Add to Home Screen", standalone display, safe-area insets, offline app shell |
| Server data | TanStack Query | caching, optimistic saves, persisted to IndexedDB so recipes open offline in the kitchen |
| Validation / types | Zod | one schema shared by forms and DB rows |
| Ingredient parsing | `parse-ingredient` | "1 1/2 cups flour, sifted" → qty / unit / name / note, which serving-scaling needs |
| Backend | **Supabase** (Postgres + Auth + Storage + Edge Functions) | one magic-link login for me, photo storage, server-side URL import |
| Hosting | Vercel / Netlify / Cloudflare Pages (static) | free tier is fine |
| Testing | Vitest (logic), Playwright with iPhone emulation (screens) | final feel-check is always on my real phone |

**Why a backend and not local-only:** iOS can clear website storage, and years of recipes must not live only in one browser's IndexedDB. Supabase stores everything server-side, and the TanStack Query cache gives offline reading.
*Caveat:* Supabase's free tier pauses a project after a week with no activity. That's fine for regular use, and we can add a tiny scheduled ping if it becomes a problem.

---

## 3. Data model (designed for all future features)

```
recipes
  id, title, description, servings (number), yield_text ("1 loaf")
  prep_minutes, cook_minutes, total_minutes
  source_name, source_url
  ingredients  jsonb  -- [{ section?: "For the sauce", items: [{ raw, qty, unit, name, note }] }]
  steps        jsonb  -- [{ section?: "...", items: [{ text, photo_id?, timer_minutes? }] }]
  notes, rating (0–5), is_favorite
  nutrition    jsonb? -- optional, later
  created_at, updated_at, last_cooked_at

recipe_photos      id, recipe_id, storage_path, position, is_cover
tags               id, name              -- "vegetarian", "weeknight", "Thanksgiving"
recipe_tags        recipe_id, tag_id

-- LATER: cookbooks (tables created now so the shape is settled)
cookbooks          id, name, description, cover_photo_path, position
cookbook_recipes   cookbook_id, recipe_id, position   -- a recipe can be in many cookbooks

-- LATER: meal plans
meal_plan_entries  id, date, slot ("breakfast"|"lunch"|"dinner"|"snack"),
                   recipe_id? , note? , servings?, position

-- MAYBE LATER: grocery list generated from meal plans
grocery_items      id, name, qty, unit, aisle, checked, from_recipe_id?
```

Design notes:
- Ingredients are stored as **raw text plus parsed fields**. The raw line is always kept exactly as typed, so a bad parse never loses data. Parsed fields power serving scaling and grocery lists later.
- Ingredient and step lists are ordered JSON on the recipe, which makes reordering a single update. Cookbooks and meal plans reference recipes by id.
- Sections ("For the dough" / "For the filling") are supported from day one.

---

## 4. App structure (screens)

Bottom tab bar (Framework7 `Toolbar` tabbar with a `View` per tab, so each tab keeps its own navigation history, as in native iOS apps):

1. **Recipes**: searchable list (large title, iOS searchbar), sort and filter by tag. Tap → Recipe detail.
2. **Cookbooks**: *(later)* grid of cookbooks → recipes in a cookbook.
3. **Meal Plan**: *(later)* week view → day → planned recipes.
4. **(maybe) Groceries**: *(later)*

**Recipe detail** (pushed page): cover photo, title, times, servings stepper (scales ingredients live), ingredients (tap to check off while cooking), steps, notes, source link. Navbar actions: Edit, Share, more (`Actions` sheet: Add to cookbook, Add to meal plan, Duplicate, Delete).

**New / Edit Recipe** (`Popup`, push style, swipe-down to dismiss):
- Navbar: **Cancel** / title / **Save**. Cancel or swiping down with unsaved changes → action sheet "Discard changes?"
- Photos row: add from camera or library, reorder, choose a cover.
- Title, description.
- Servings (`Stepper`), yield text, prep and cook time (`Picker`, hours + minutes).
- **Ingredients**: list with drag-to-reorder and swipe-to-delete. "Add ingredient" row plus a **"Paste ingredients"** sheet where each pasted line becomes an item (the fastest way to bring in a recipe from anywhere). Add section headers.
- **Steps**: same pattern, with auto-numbering and a bulk "paste steps" option.
- Tags (`Smart Select` with create-new), notes, source name and URL, rating.
- **Draft autosave** to local storage, so a crash or accidental close never loses work.

---

## 5. Phases

**Phase 0: Feel check (before any real features).**
Scaffold Vite + React + Framework7 + PWA. Build throwaway demo pages: tab bar, push/swipe-back, a popup with swipe-to-close, a sheet, a sortable/swipeout list, an action sheet. Deploy it, add it to my iPhone home screen, and **I confirm it feels native**. If it doesn't, we switch libraries now, while switching is cheap.

**Phase 1: Recipes, read side.** Supabase project, schema and migrations, login. Recipe list and detail pages showing seed data. Serving scaling.

**Phase 2: Create and edit recipes** *(the main goal)*. The full New/Edit popup above, photo upload, draft autosave, delete, duplicate.

**Phase 3: Getting recipes in.**
- **Import from URL:** a Supabase Edge Function fetches the page and reads its schema.org `Recipe` data (most recipe sites publish it), then opens a pre-filled New Recipe form for review.
- **Import from my current app's export**, so years of recipes come over.
- iOS Share Sheet → app, if feasible for a PWA (limited on iOS, so we'll test).

**Phase 4: Cookbooks.** **Phase 5: Meal plans.** **Phase 6 (maybe): Grocery list, cook mode (screen stays awake, big text, step timers).**

---

## 6. Open questions for me (the user)

1. Which app am I replacing (Paprika? Prepear? something else), and **can it export** my recipes? This decides the importer.
2. What are the specific **usability issues and missing features** that frustrate me? These become requirements.
3. Videos of the current app's *create recipe*, *cookbooks*, and *meal plans* flows (coming, shortened).
4. OK with Supabase (free, needs an account), or would I prefer a different backend?
5. Where should it be hosted: Vercel, Netlify, or Cloudflare Pages?
