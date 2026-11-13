# Cookbook — Plan

A personal recipe app to replace **Prepear** (a subscription app that hasn't improved in years). It's for one user (me), on my iPhone, as an installable web app (PWA) that should feel native. Hosted on **Netlify**.

**Current focus: creating and editing recipes.** Cookbooks and meal plans come later, but the architecture needs to plan for them now.

---

## 1. What Prepear does today (from my screen recordings)

**Recipes home ("Me" tab):** profile header with counts (16 cookbooks, 1 meal plan, 353 recipes). Two-column grid of recipe cards (photo, title, source site, star rating). A floating **Sort Recipes** button. Bottom tabs: Discover, Planner, **+**, Shopping List, Me.

**Add a Recipe:** a full-screen flow with an **X** close button, a **Next** button, and three top tabs:
1. **Name:** photo ("Add a luscious food photo") and recipe name.
2. **Ingredients & Directions**
   - Ingredients: a text box ("Add one ingredient per line, or paste your ingredient list here"). Pasting works well: each line becomes an ingredient row showing amount + unit on top and name/note below.
   - Each row shows a check mark (matched to Prepear's food database) or **?** (not matched).
   - **Groups:** "Separate these ingredients into groups" → named groups ("Ingredients Group 1", "Bechamel sauce") with up/down arrows to move them.
   - **Move/Delete** mode: drag handles and red trash icons on every row, then **Done**.
   - **Tapping an ingredient** opens an "Edit Ingredient" panel: a header line, "Name of ingredient", Amount, Measurement, Detail, a "We can't find *X* in our database… Send it to our review team" message, and a red **Delete Ingredient** button. There's no clear save, so I'm never sure whether to tap something or just close it.
   - Directions: numbered steps, the same paste, groups, and Move/Delete. Pasting with blank lines creates **empty numbered steps**. Sub-headings like "Now make some béchamel sauce" become numbered steps.
   - Notes, plus a Reminder (**not wanted**, left out).
3. **Info:** course-type icon grid (Breakfast, Lunch, Snack, Dinner, Appetizer, Soup, Salad, Side, Dessert, Drink; more than one allowed). Picking one also adds a **#hashtag** (#dinner, #dessert). Free-form hashtags; How many servings, How much in a serving ("1 slice"), Prep time, Cook time; Privacy (Public / Grapevine / Secret, which I don't need).

**Cookbooks:**
- **Cookbook list:** a two-column grid of cover tiles with name and recipe count (Bread 6, Dressings and sauces 2, Everything else 70, Grilling 11…).
- **Inside a cookbook ("Everything else"):** a search bar ("Search Cookbook") and a **⋯** menu.
  - **Sections** shown as cover tiles with counts (Meat 18, Seafood 13, Other 17).
  - Below them, **"Uncategorized Recipes (22)"**: recipes in the cookbook but in no section. It has **Organize** and **Add Recipes** buttons.
- **Inside a section ("Meat"):** a header showing the parent cookbook, "Recipes (18)" with **Organize** / **Add Recipes**, and a recipe card grid.
  - The **⋯** menu has Edit Section Title, Select Cover Image, Delete Section.
- **Add Recipes:** a search screen with recent searches. Each result has an **Add** button.

**Meal plans** (in Prepear these are reusable *templates*, separate from the dated **Planner** tab):
- **Plan page:**
  - Hero photo, title, "by Vera", length (1 Week) and recipe count (8).
  - A **Meal Plan Guide** text with a "More" link.
  - An **Add To Planner** button, and a "Search this Meal Plan" bar.
- **Days:** plan days are listed ("Tuesday, Week 1", "Wednesday, Week 1"…), each with its recipes. Each week has a **"This Week's Prep Tips and Notes"** row.
- **⋯ menu:** Start Meal Plan, Edit Meal Plan, Delete Meal Plan.

---

## 2. My frustrations → requirements

| # | Prepear problem | Requirement for this app |
|---|---|---|
| R1 | Recipe list **never remembers sort**, and it always opens oldest-first | Default sort is **Newest first**. Whatever sort I pick is **saved** (in my settings in the database, so it survives reinstalling) and used every time the list opens. |
| R2 | Can tag recipes (dessert, soup…) but **can't filter by tags** | A row of tag chips under the search bar. Tap one or more to filter (match **all** selected, with an option to match **any**). Course types are just tags in a "Course" group. Search + tag filter + sort work together, and the last filter is remembered. |
| R3 | Websites **block Prepear's share-sheet import** ("this website asks that we don't allow Prepear to import it") | The app has no blocklist and imports anything it can read. The main import path runs **on my phone, in Safari, on the page I'm already viewing** (see §6), so sites that block servers still work. There are several fallbacks, down to "paste the whole page text". |
| R4 | **Editing an ingredient** is convoluted, with weird options and no clear save | Tap a row → a small iOS sheet with exactly **Amount, Unit, Ingredient, Note**. Changes apply **immediately** (the row behind updates as I type). There's one **Done** button and swipe-down also closes. No save step, no "database" or "review team". Delete is a swipe on the row (or a button at the bottom of the sheet). |
| R5 | **Ranges don't scale**: "1–2 tsp" stays "1–2 tsp" when doubling | Amounts are stored as numbers: `qty` and an optional `qty_max`. ×2 turns "1–2 tsp" into "2–4 tsp", and "½–1 cup" into "1–2 cups". Fractions display nicely (⅓, ¾, 1½). Amounts that aren't numbers ("pinch", "to taste") are shown as written and labeled as not scaled, so they never silently go wrong. |
| R6 | (seen in video) Blank lines in pasted directions become **empty steps**; sub-headings become numbered steps | Pasting skips blank lines. A line ending in ":" (e.g. "For the sauce:") or written as a heading becomes a **section header**, not a step. I can also turn any row into a header. |
| R7 | (seen in video) Separate "Move/Delete" mode | Reorder by **long-press and drag** at any time, and delete by **swipe**. No mode switch needed. If drag handles turn out to be needed, Framework7's sortable list provides them. |
| R8 | **No export**, and I'm locked in | Built-in **Export all** (JSON, plus a printable/PDF view per recipe). My data is never trapped again. |

---

## 3. UI library decision

### The rule
We do **not** build iOS components, animations, gestures, or overlay stacking ourselves. Every drawer, sheet, page transition, swipe-back, action sheet, swipe-to-delete row, reorder handle, picker, and toast comes from the library. If the library doesn't have something, we stop and decide together. We don't hand-roll a replacement.

### Choice: **Framework7 v9 + Framework7 React (React 19)**

| Need | Framework7 provides |
|---|---|
| Native-feeling navigation | Its own router with iOS push/pop page transitions, **swipe-back from the left edge**, and a navbar whose title animates between pages |
| Current iOS look | v9 ships **iOS 26 styling** across all components |
| Drawers / bottom sheets (ingredient editor, R4) | `Sheet` with swipe-to-close, swipe-to-step, and breakpoints, plus a backdrop |
| Full-screen "New Recipe" form | `Popup` with swipe-to-close and the iOS "push" style (the page behind shrinks back) |
| Overlay stacking / z-index | Handled by the framework's modal stack, so we never set z-index ourselves |
| Ingredient and step editing (R7) | `List` with **sortable** (reorder) and **swipeout** (swipe to delete) |
| Servings / scaling | `Stepper` |
| Times, tags, filters (R2) | `Picker`, `Smart Select`, `Chips`, `Segmented` |
| Confirmations | `Actions` (iOS action sheet), `Dialog` |
| Recipe photos | `Photo Browser` (pinch-zoom, swipe between photos) |
| Lists of many recipes | `Searchbar`, `Virtual List`, `Pull to refresh` |
| Extras | `Tabs`, `Toast`, `Preloader`, Framework7 Icons (SF Symbols look-alikes) |

**Runner-up: Ionic 9 (React).** It's company-backed with a very solid overlay system, but it has no official iOS 26 styling (only community themes) and it lacks a stepper and photo browser. It's the fallback if Framework7 turns out to have a dealbreaker.
**Not chosen:** Konsta UI (components only, no router or transitions). Plain React + Radix/shadcn (that's the "build the iOS feel ourselves" path we want to avoid).

### Rules that come with this choice
- **Use the Framework7 router, not React Router.** The iOS transitions and swipe-back depend on it.
- Use Framework7 layout primitives (`App`, `View`, `Page`, `Navbar`, `Toolbar`). No custom scroll containers.
- No custom CSS for animation, transforms, or z-index. Styling is limited to colors, spacing, and typography through Framework7 CSS variables.
- Theme is locked to `ios`, with automatic dark mode.

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Build | Vite + TypeScript | |
| UI | Framework7 v9, framework7-react, framework7-icons | see above |
| PWA | `vite-plugin-pwa` | Add to Home Screen, standalone display, safe-area insets, offline app shell |
| Server data | TanStack Query | caching, optimistic saves, persisted to IndexedDB so recipes open offline in the kitchen |
| Validation / types | Zod | one schema shared by forms and DB rows |
| Ingredient parsing | `parse-ingredient` | "1-2 tsp kosher salt, divided" → `qty 1, qty_max 2, unit tsp, name kosher salt, note divided` (it understands ranges and fractions) |
| Hosting + backend | **All on Netlify** | one account, auto-deploys from this GitHub repo |
| ↳ App | Netlify static hosting | the PWA itself |
| ↳ API | Netlify Functions | small server code: save/load recipes, URL import, export |
| ↳ Database | **Netlify Database** (Postgres) | recipes, tags, cookbooks, meal plans, settings |
| ↳ Photos | **Netlify Blobs** + Netlify Image CDN | photos are resized automatically for fast loading |
| ↳ Login | single-user passcode | one passcode (stored as a Netlify secret) → a long-lived secure cookie. No accounts or sign-up. Only I use it. |
| Testing | Vitest (parsing and scaling logic, heavily), Playwright with iPhone emulation | final feel-check is always on my real phone |

**Why a backend and not local-only:** iOS can clear website storage, and 350+ recipes must not live only in one browser's IndexedDB. The TanStack Query cache gives offline reading.
**Why all-Netlify:** one account I already have, nothing to sign up for, and no "paused after a week of inactivity" problem.
*Check before Phase 1:* Netlify Database is only offered on Netlify's credit-based plans, and pricing should be confirmed for my account. **Fallback:** Supabase (free Postgres + photo storage) with the app still hosted on Netlify. The data model doesn't change either way.

---

## 5. Data model (designed for all future features)

```
recipes
  id, title, description
  servings (number), serving_size_text ("1 slice"), yield_text ("1 loaf")
  prep_minutes, cook_minutes, total_minutes
  source_name, source_url
  ingredients  jsonb  -- ordered list of rows:
                      --   { type: "header", text: "Bechamel sauce" }
                      --   { type: "item", raw: "1-2 tsp salt, divided",
                      --     qty: 1, qty_max: 2, unit: "tsp", name: "salt", note: "divided" }
  steps        jsonb  -- ordered: { type: "header", text } | { type: "step", text, timer_minutes? }
  notes, rating (0–5), is_favorite
  created_at, updated_at, last_cooked_at

recipe_photos      id, recipe_id, storage_path, position, is_cover
tags               id, name, group ("course" | null)  -- course: breakfast, lunch, dinner, snack,
                                                       -- appetizer, soup, salad, side, dessert, drink
recipe_tags        recipe_id, tag_id
user_settings      recipe_sort ("newest" default), recipe_filter_tags[], filter_mode ("all"|"any"), …

-- LATER: cookbooks (tables created now so the shape is settled)
cookbooks          id, name, description, cover_photo_path?, position
cookbook_sections  id, cookbook_id, name, cover_photo_path?, position   -- "Meat", "Seafood"
cookbook_recipes   cookbook_id, section_id? (null = Uncategorized), recipe_id, position
                   -- a recipe can be in many cookbooks; cover defaults to the first recipe's photo

-- LATER: meal plans = reusable templates (like Prepear's "Dr. Gundry's 3-day kickstart")
meal_plans         id, name, cover_photo_path?, guide_text, length_weeks
meal_plan_weeks    meal_plan_id, week_number, prep_tips_text
meal_plan_items    id, meal_plan_id, week_number, day_of_week, slot?, recipe_id | note, position

-- LATER: the Planner = my actual calendar
planner_entries    id, date, slot ("breakfast"|"lunch"|"dinner"|"snack")?,
                   recipe_id | note, servings?, position, from_meal_plan_id?
                   -- "Add To Planner" places a template's items on real dates from a start date I pick

-- MAYBE LATER: grocery list
grocery_items      id, name, qty, unit, aisle, checked, from_recipe_id?
```

Design notes:
- **Ingredients keep the raw line exactly as typed** plus parsed fields. A bad parse never loses data, and the editor (R4) edits the parsed fields, which rebuild the raw line.
- Headers live inline in the ordered list, so "groups" are just header rows. Moving a header moves its section, with no up/down arrows needed.
- Scaling is one pure function `scale(item, factor)` that handles `qty`/`qty_max`, unit pluralization, and nice fractions. It's covered by a large unit-test table (ranges, mixed numbers, "pinch", "to taste", "1 (14 oz) can").

---

## 6. Importing recipes (R3)

Most recipe sites publish a machine-readable `schema.org/Recipe` block (JSON-LD) inside the page. That's where we read from, in this order of preference:

1. **iOS Shortcut in the Safari share sheet ("Save to Cookbook"):** the main path.
   The Shortcuts action *Run JavaScript on Web Page* runs on the page **already loaded in my Safari**, reads the recipe JSON-LD, and opens my app with it. The app shows a pre-filled **New Recipe** form for review and saving. No server ever fetches the site, so bot-blocking and "don't import" lists don't apply. I install the shortcut once from a link the app provides. (A PWA can't add itself to the iOS share sheet directly, which is why we use a Shortcut.)
2. **Paste a link** in the app → a Netlify Function fetches the page and reads the JSON-LD. This is convenient, but some sites block servers, so it falls back to option 1 or 3.
3. **Paste the whole page** (Select All → Copy in Safari, or a Reader-mode copy) → the app finds the ingredient and direction lists in the text and opens them for review.
4. **Paste ingredients / directions separately:** the Prepear-style paste box, which already works well and stays.
5. *(Optional, later)* **Photo/screenshot of a recipe** (cookbook page, Instagram) → AI extraction into the form.

**Bringing my 353 Prepear recipes over:** Prepear has no export button. To investigate in Phase 3:
- (a) Prepear's website, while I'm logged in: if it loads my recipes as data, a one-time script I run in my own browser can download them all.
- (b) My recipes' public Prepear pages may carry JSON-LD, which the importer can read.
- (c) Fallback: most of my recipes came from websites, so the original source URLs can be re-imported in bulk.

---

## 7. App structure (screens)

Bottom tab bar (Framework7 tabbar, with a `View` per tab so each tab keeps its own history like a native app):

1. **Recipes**
   - Large title, iOS searchbar, and a horizontally scrolling **tag chip row** (R2).
   - A sort menu (`Actions` sheet: Newest, Oldest, A–Z, Recently cooked, Rating) that is **remembered** (R1).
   - Grid or list toggle, also remembered.
   - **+** in the navbar → New Recipe (Write manually / Paste link / Paste text).
2. **Cookbooks** *(later)*
   - Cover grid of cookbooks → a cookbook page with section tiles and "Uncategorized" recipes below → a section page.
   - Navigation uses normal iOS push pages with swipe-back.
   - **Add Recipes** opens a `Popup` with a searchbar, where tapping recipes toggles a check mark (adding several at once).
   - **Organize** means drag-to-reorder and moving recipes between sections.
   - The **⋯** menus are `Actions` sheets.
3. **Plan** *(later)*
   - Top `Segmented` control: **Calendar** (the dated planner: week view, tap a day, add recipe or note) and **Meal Plans** (templates).
   - A template page shows the guide, then days grouped by week with prep tips.
   - **Add to Calendar** asks for a start date (`Calendar` picker) and places the template's recipes onto real days.
4. **Groceries** *(maybe later)*

**Recipe detail** (pushed page)
- Photo, title, source link, times, tags.
- **Servings stepper / ×½ ×2 ×3 chips** that scale ingredients live, ranges included (R5).
- Ingredients you can tap to check off while cooking, then numbered steps with section headers, then notes.
- Navbar: Edit, plus a **⋯** menu: Add to cookbook, Add to meal plan, Duplicate, Share, Delete.

**New / Edit Recipe** (`Popup`, push style, swipe-down to dismiss). Everything is **one scrolling page** rather than Prepear's three tabs with Next buttons.
- Navbar: **Cancel** / title / **Save**. Cancel or swipe-down with unsaved changes → action sheet "Discard changes?"
- Photos (camera or library, reorder, set cover), title, description.
- **Ingredients:** a row per item (amount + unit in bold, then name, then note in grey).
  - Tap a row → the **ingredient sheet** (R4).
  - Long-press to drag (R7), swipe to delete.
  - **"+ Add ingredient"** and **"Paste ingredients"** (each line becomes an item, headers detected, blank lines ignored, R6).
- **Directions:** the same pattern. Tap a step to edit its text in place.
- Course (tap-to-toggle chips: Breakfast, Lunch, Dinner…) and free tags.
- Servings (`Stepper`), serving size, yield, prep/cook time (`Picker`).
- Notes, source name/URL, rating.
- **Draft autosave**, so a crash or accidental close never loses work.

**Ingredient sheet (R4):** a half-height `Sheet`.
```
 ┌───────────────────────────────┐
 │  Edit Ingredient        Done  │
 │  Amount  [ 1-2   ]  Unit [tsp]│   ← "1-2", "1 1/2", "½" all accepted
 │  Ingredient [ kosher salt   ] │
 │  Note       [ divided       ] │
 │  ───────────────────────────  │
 │  Preview: 1–2 tsp kosher salt,│
 │           divided             │
 │        [ Delete Ingredient ]  │
 └───────────────────────────────┘
```
Edits are live. **Done**, swipe-down, and tapping outside all keep the changes. Undo comes from the toast after a delete.

---

## 8. Phases

**Phase 0: Feel check.**
- Scaffold Vite + React + Framework7 + PWA and deploy to Netlify.
- Build throwaway demos: tab bar, push/swipe-back, a popup with swipe-down, the **ingredient sheet**, a sortable/swipeout list, and an action sheet.
- I add it to my home screen and **confirm it feels native** before real work starts.

**Phase 1: Foundations and the recipe list.**
- Netlify Database, schema and migrations, Functions API, passcode login, photo storage in Blobs.
- Ingredient parser and **scaling engine with tests (R5)**.
- Recipe list with **remembered sort (R1)** and **tag filters (R2)**, plus recipe detail with scaling, all on seed data.

**Phase 2: Create and edit recipes** *(the main goal)*.
- The New/Edit popup, the ingredient sheet (R4), paste with header detection (R6), reorder and delete (R7), photos, draft autosave.
- Delete and duplicate recipes.

**Phase 3: Getting recipes in (R3).**
- The Safari share-sheet Shortcut, paste link, paste page text.
- The Prepear migration investigation, then a bulk import of my 353 recipes.
- Export all (R8).

**Phase 4: Cookbooks.** **Phase 5: Meal plans.** **Phase 6 (maybe): Grocery list, cook mode (screen stays awake, big text, step timers).**
Reminders: **not wanted**, dropped.

---

## 9. Still open

1. **Netlify setup (Phase 0):** connect this GitHub repo to a new Netlify site, so every push auto-deploys. Before Phase 1, check whether my account can use Netlify Database (credit-based plan) and what it costs. If not, fall back to Supabase for data only.
2. **Prepear migration:** Prepear has a website (app.prepear.com). Claude's sandbox can't reach it, and my recipes need my login anyway. Plan: in Phase 3, Claude writes a one-time script that I run in my **own browser while logged into Prepear** (easiest on a computer). It downloads my recipes, cookbooks and meal plans as a file, which this app imports. Do I have a Mac/PC to run it on?
