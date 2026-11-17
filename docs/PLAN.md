# Cookbook — Plan

A personal recipe app to replace **Prepear** (a subscription app that hasn't improved in years). It's for one user (me), on my iPhone, as an installable web app (PWA) that should feel native. Hosted on **Netlify** at **https://cookbk.netlify.app**.

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

**Recipe page and its actions:**
- **Top bar icons:** back, **Save** (add to cookbook), **Plan** (add to planner), **Shop** (add to grocery list), **Share**, and **⋯** (Report, Edit, Organize, Print, Delete).
- **Header:**
  - Large hero photo, title and author.
  - Star rating with review count, **"2 Prepear'd"** (times I've made it), and "Ready in 1h 15m".
- **Ingredients:**
  - An **Add to Grocery List** button and a servings control ("8 Servings" with + / −).
  - A bulleted list of ingredients.
  - A floating **Cook Mode** button.
- **Add Recipe to Planner:** a full-screen list of weeks ("Nov 9 – Nov 15"), each with days, and each day has an "Add Recipe to Friday" slot. Tap a day to place the recipe.
- **Add Ingredients to List:** a servings stepper, "What day to cook?" (Fri Nov 13, Edit), and a checklist of every ingredient (all checked by default, untick what I already have) → **Save**.
- **Add Recipe to Cookbook:** "Create a New Cookbook" plus a three-column grid of cookbook covers. Tap to toggle a green check mark (several allowed) → **Save**.
- **Edit:** the same three-tab editor as Add, with delete and replace buttons on the photo.

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
| ↳ Login | **Netlify Identity with Google sign-in** | registration set to *invite only*, and only my Google account is invited, so nobody else can get in. Functions reject any request without my login. |
| Testing | Vitest (parsing and scaling logic, heavily), Playwright with iPhone emulation | final feel-check is always on my real phone |

**Why a backend and not local-only:** iOS can clear website storage, and 350+ recipes must not live only in one browser's IndexedDB. The TanStack Query cache gives offline reading.
**Decision: all-Netlify, one service.** Supabase can't host the app, so using it would mean two services. All-Netlify is one account I already have, and it has no "paused after a week of inactivity" problem.
*Check before Phase 1:* Netlify Database runs on Netlify's credit-based plans (the Free plan includes 300 credits/month). Confirm my team is on a credit-based plan and watch credit usage for the first month. A one-person recipe app should use very little.

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
  notes, rating (0–5), is_favorite, times_cooked ("Made it" count, like "2 Prepear'd")
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
2. **Paste a link** in the app → a Netlify Function fetches the page and reads the JSON-LD. This is convenient, but some sites block servers, so it falls back to option 1 or 3. *Built (Nov 2026, issue #15):* Recipes **+** → From a link. A page with JSON-LD is read at once without AI; a page without it (a blog without a recipe plugin, a social media post) has its text read by Claude, as the photos are. A site that blocks the server says so and points to From photos or screenshots.
3. **Paste the whole page** (Select All → Copy in Safari, or a Reader-mode copy) → the app finds the ingredient and direction lists in the text and opens them for review.
4. **Paste ingredients / directions separately:** the Prepear-style paste box, which already works well and stays.
5. **Photo/screenshot of a recipe** (cookbook page, Instagram) → AI extraction into the form. *Built (Nov 2026, issue #17):* Recipes **+** → From photos or screenshots. Claude reads the photos through **Netlify's AI Gateway** (no second service or API key; billed as Netlify credits) and the New Recipe editor fills in for checking before saving.

**Bringing my 353 Prepear recipes over: a bookmarklet.** Prepear has no export button, but it has a website (app.prepear.com) that I can log into. Claude's sandbox can't reach that site, and my data needs my login anyway, so the work runs in **my own browser**:
1. **Step 1, a "peek" bookmarklet.** I tap it once while logged into app.prepear.com. It saves a small file describing how Prepear's site loads my recipes (no password or login token in it), and I send that file to Claude. Claude can't see the site, so this is how it learns its shape.
2. **Step 2, the export bookmarklet.** Claude writes it from what the peek showed. I tap it on app.prepear.com and it downloads **all my recipes, cookbooks (with sections) and meal plans** as one file.
3. **Step 3:** in my app, Settings → Import from Prepear → choose that file. Photos are copied over too.
- Best run on my **Mac in Safari or Chrome**, which handles a big download more easily. It also works on iPhone Safari.
- Fallback if Prepear's site doesn't expose the data: most of my recipes came from websites, so their source URLs can be re-imported in bulk.
- *Step 1 built (Nov 2026, issue #14):* Settings → Import → From Prepear copies the peek bookmarklet (source: `src/prepear/peek.ts`; the page turns that function's own code into the bookmarklet). On app.prepear.com it shows a small panel and records the app's API calls while I browse (address, method, header names, a trimmed copy of each answer), plus where the page keeps its sign-in (names only), the API addresses in its code, and its routes. Save file downloads `prepear-peek.json`; Copy puts it on the clipboard. Passwords, tokens, cookies, signed links and email addresses are replaced by `<hidden>` / `<email>`. A page reload stops it; tapping the bookmarklet again carries on with what it had. The file has my real recipe text, so it goes to Claude in chat, never into this public repo.
- *What the first peek showed (Nov 16):*
  - Prepear's web app (React) reads everything from `https://api.prepear.com/api/...`. It signs in with **cookies the page can't read** (no token in storage or headers), so the export bookmarklet just asks with `credentials: 'include'` from app.prepear.com and never handles a token.
  - **Recipe list:** `GET /api/v3/profiles/<user id>/recipes?q=&sort=&skip=<n>&limit=35` → `{ total, results: [{ id, title, imageUrls, attrUrl, timePrep, timeCook, servings, rating, userRating, ... }] }`.
  - **A recipe:** `GET /api/v3/recipes/<id>` → `{ adapted: { recipe, meta, ... }, original: { recipe, ... } }`. *adapted* is my own edited copy of someone else's recipe (it's `null`-ish or missing when I never edited it); use it when present. Cookbooks and the list refer to a recipe by either id, so the import maps both to one recipe.
  - **Recipe fields:** `title`, `attr_url` (source), `servings`, `serving_size`, `time_prep` / `time_cook` (minutes, as text), `tags`, `notes` (list of text), `image_urls` (sizes 120/640/1080 on ImageKit, `ik.imagekit.io/prepear/...`), `ingredients: [{ title, ingredients: [{ amount, measurement, ingredient_name, note }] }]` (groups; a group title is a section header) and `directions: [{ title, directions: [text] }]`. My rating and notes are in `meta`.
  - **No raw ingredient line:** Prepear keeps only the split fields, so the import rebuilds the line ("1 cup plain yogurt, note") as the raw text. Some lines were split badly by Prepear ("1" + "-3/4 teaspoons salt" for "1-3/4 teaspoons salt"); rebuilding joins those without a space.
  - **A cookbook:** `GET /api/v3/cookbooks/<id>` → `{ cookbook: { title, coverRecipeId, sections: [{ title, recipes: [ids] }], uncategorizedRecipes: [ids] }, recipes: {...} }`.
  - **Profile:** `GET /api/v3/profiles/<profile name>?useCookbooks=true` → `{ profile: { id, slug, ... }, recipes: { total, results }, cookbooks: { total, results: [{ id, title, coverRecipeId, sectionsNumOf, numOfRecipes }] }, library: { total, results: [meal plans: { id, title, num_of_weeks, ... }] } }`. (Found by the second peek run.)
  - **A meal plan:** `GET /api/v2/plans/<id>` → `{ plan: { title, numOfWeeks, generalGuide, coverRecipeId, weeks: [{ guide, days: [7 × { meals: [{ mealTime, recipeId, dayIdx, weekIdx, recipe: { title, ... } }] }] }] } }`. `mealTime` is a number (0 breakfast, 3 lunch, 4 snack, 6 dinner, as far as one plan shows).
- *Step 2 built (Nov 16): the export bookmarklet* (`src/prepear/export.ts`, Settings → From Prepear → Copy the export bookmarklet). It reads the profile, pages through the recipe list, then each cookbook, meal plan and recipe (also recipes a cookbook or plan names that aren't in the list; one answer covers a recipe's own id and its original's), 3 at a time, trying busy answers again. Answers are kept in IndexedDB on Prepear's site as they arrive, so after a reload the bookmarklet carries on. Save file gives `prepear-export-<date>.json`: `{ format: 'prepear-export', version: 1, profile, recipeList, recipes: { <id>: answer }, cookbookList, cookbooks, planList, plans, failed }`. `npm run check:export` runs it against a fake Prepear.
  - *Fixed after the first real run:* a list page can hold fewer than 35 (Prepear moves the originals of recipes I edited into `filteredOriginals`: 30 + 5), so the bookmarklet stopped after the first page and saved 263 recipes, only those also named by a cookbook or the plan. It now pages until the total, and fetches the `filteredOriginals` ids too. Running it again reuses what it kept.
- *Step 3 built (Nov 16): the import.* Settings → From Prepear → Choose the export file. It shows what's in the file (recipes to import, with a photo, already imported, can't import), then imports with a progress bar, keeping the screen on.
  - **The whole file is kept** on the server first (`/api/imports/prepear`, Netlify Blobs store `imports`), for the cookbooks (#25) and meal plan (#26) later.
  - **Photos:** each recipe's photo is copied by the server from ImageKit (`POST /api/photos` with `{ prepear: "<path>" }`; only `ik.imagekit.io/prepear`, only id paths). A photo that can't be copied leaves the recipe without one, and the page says how many.
  - **Prepear ids:** recipes keep them (`prepearIds`, column `prepear_ids`), so importing again skips recipes already here.
- *How a Prepear recipe becomes a recipe* (`src/lib/prepear.ts`, tests beside it; tried on the real export: 262 of 263, the other was deleted in Prepear):
  - My edited copy is the recipe when there is one. The original fills in what the copy lacks: my rating, "made it", notes and the photo.
  - **Date added:** my copy's id is a time-based UUID, so it's dated when I made the copy. A recipe I imported uses Prepear's `imported_at`, and anything else the original's id. This keeps newest-first (R1) meaningful: 2018 to 2026.
  - **Ingredients:** Prepear's parts are kept, and the raw line is rebuilt from them (Prepear never kept the typed line). Badly split lines are put back together and read again: "1" + "-3/4 teaspoons salt" becomes "1-3/4 teaspoons salt", read as 1 3/4 tsp salt; "3" + "-4 tbsp oil" becomes the range 3-4 tbsp. Ingredient and direction group titles become section headers.
  - **Text:** HTML left over from recipe sites (`&nbsp;`, `<br>`) becomes plain text.
  - **Tags:** courses, diets (vegan, gluten-free, paleo, "low sodium") and my own hashtags (#gundry → gundry, phase1 → phase 1) are kept. The allergens Prepear adds itself (milk, wheat, tree_nut…) are left out: as tags they'd read like ingredients.
  - **Titles** typed in lower case get a capital ("mustard dill chicken thighs" → "Mustard dill chicken thighs"); a first word like "iPhone" is left alone.
  - **Other fields:** "made it" in Prepear becomes 1× made. A recipe without servings gets the app's default of 4. The source is the website's name (example.com) with its link.
- *Decided (Nov 16):* the five sample recipes are deleted by a migration (`20261116120100_delete_sample_recipes.sql`). Prepear's calendar (Meal Planner) isn't exported: there's nothing in it worth keeping.
- *Decided:* the export file holds **Prepear's own answers, unchanged** (every recipe, cookbook and plan), not a converted copy. The import (in the app, with tests) turns them into this app's recipes, so a mistake in the conversion is fixed in the app and the import run again, without exporting again. Photos are copied from ImageKit into this app's photo store.

---

## 7. App structure (screens)

Bottom tab bar (Framework7 tabbar, with a `View` per tab so each tab keeps its own history like a native app):

1. **Recipes**
   - Large title, iOS searchbar, and a horizontally scrolling **tag chip row** (R2).
   - A sort menu (`Actions` sheet: Newest, Oldest, A–Z, Recently cooked, Rating) that is **remembered** (R1).
   - Grid or list toggle, also remembered.
   - **+** in the navbar → New Recipe (Write manually / Paste link / Paste text).
2. **Cookbooks** *(built in issue #25; the plan and decisions are in the issue)*
   - Cover grid of cookbooks → a cookbook page with section tiles and "Uncategorized" recipes below → a section page.
   - Navigation uses normal iOS push pages with swipe-back.
   - **Add Recipes** opens a `Popup` with a searchbar, where tapping recipes toggles a check mark (adding several at once).
   - **Organize** means drag-to-reorder and moving recipes between sections.
   - The **⋯** menus are `Actions` sheets.
3. **Plan**
   - **Planner** *(built in issues #62, #67)*: the dated calendar. A week's strip under the title (today picked, swipe for other weeks, follows the agenda's scroll), then the week as an agenda of days. A day holds recipes and notes, for the whole day or in a Breakfast / Lunch / Dinner slot. + adds recipes (in a slot) or a note; swipe a row to change its Meal, Move or Remove it. The recipe page's ⋯ → Add to Planner picks a day and a meal and keeps the servings shown; its Planned section lists the days it's planned for.
   - **Meal Plans** *(later, #26)*: templates. They may join the Planner under a `Segmented` control (Planner | Meal Plans).
   - A template page shows the guide, then days grouped by week with prep tips.
   - **Add to Calendar** asks for a start date (`Calendar` picker) and places the template's recipes onto real days.
4. **Groceries** *(maybe later)*

**Recipe detail** (pushed page)
- Large photo (tap → `Photo Browser`), title, source link, star rating, "Made it N times", and Prep / Cook / Total time.
- **Action row** under the title, with icon buttons like Apple's apps:
  - **Cookbook:** a `Popup` with a cover grid. Tap to toggle a check mark, "+ New Cookbook" at the top, and pick a section if the cookbook has sections.
  - **Plan** (built in #62 as ⋯ → Add to Planner): Framework7's Calendar in a sheet. Tap a day to add the recipe there.
  - **Groceries** *(later)*: a `Sheet` with a servings stepper and an ingredient checklist (untick what I have).
  - **Share:** the iOS share sheet via the Web Share API, sending a link or the recipe as text.
- **Servings stepper / ×½ ×2 ×3 chips** that scale ingredients live, ranges included (R5).
- Ingredients you can tap to check off while cooking, then numbered steps with section headers, then notes.
- **Cook Mode** button: keeps the screen awake (Wake Lock API), big text, one step at a time, with ingredients a swipe away.
- **"I made this"** button: adds 1 to times-cooked and sets the last-cooked date (feeds the "Recently cooked" sort).
- Navbar: back, plus **Edit** and a **⋯** `Actions` sheet: Duplicate, Print / Save as PDF (a clean print layout), Delete (confirm).
  - Prepear's "Report" isn't needed, and "Organize" moves into the Cookbook popup.

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
Issue #11 added one row under the four fields: **Recipe**, a picker (not a field to type in) that links the ingredient to another recipe, so "1 pie crust" opens the Pie Crust recipe. The ingredient stores the recipe's id (`recipeId`), never a copy, and keeps its own words. Later, the grocery list can add a linked recipe's ingredients in its place.

---

## 8. Phases

**Phase 0: Feel check.**
- Scaffold Vite + React + Framework7 + PWA and deploy to Netlify.
- Build throwaway demos: tab bar, push/swipe-back, a popup with swipe-down, the **ingredient sheet**, a sortable/swipeout list, and an action sheet.
- I add it to my home screen and **confirm it feels native** before real work starts.

**Phase 1: Foundations and the recipe list.**
- Netlify Database, schema and migrations, Functions API, Google sign-in (Netlify Identity, invite-only), photo storage in Blobs.
- Ingredient parser and **scaling engine with tests (R5)**.
- Recipe list with **remembered sort (R1)** and **tag filters (R2)**, plus recipe detail with scaling, all on seed data.
- *Done (Nov 2026), decisions made while building it:*
  - Phase 0 was approved and merged; its screens (including editing, photos and cook mode) now save through the API.
  - Ingredients, directions and photos are JSON lists on the recipe row; tags are a text array on the recipe. One person's few dozen tags don't need their own tables, and filtering uses an index on the array. Each ingredient keeps its amount as typed (scaling reads the numbers from it) plus the raw line.
  - Netlify Identity: Netlify deprecated it in 2025, then reversed that in February 2026; it's supported. The app signs in through gotrue-js (what Netlify's Identity widget is built on), the same way as my HPDE app, because `@netlify/identity` keeps the sign-in in cookies that iOS drops when it closes the home-screen app. Besides invite-only registration, the API only answers accounts with the `admin` role (given in the Netlify UI).
  - The five sample recipes are seeded by a migration so the app isn't empty before Phase 3's import. (Deleted by a later migration once the Prepear import existed, #14.)

**Phase 2: Create and edit recipes** *(the main goal)*.
- The New/Edit popup, the ingredient sheet (R4), paste with header detection (R6), reorder and delete (R7), photos, draft autosave.
- Delete and duplicate recipes.

**Phase 3: Getting recipes in (R3).**
- The Safari share-sheet Shortcut, paste link, paste page text.
- The Prepear migration investigation, then a bulk import of my 353 recipes.
- Export all (R8).

**Phase 4: Cookbooks.** **Phase 5: Meal plans.** **Phase 6: Grocery list** (if I use it). **Cook mode and "I made this"** were pulled forward into Phase 0 (I use cook mode all the time): screen stays on, one step per swipe, step timers, the step's ingredients, and a checklist.
Reminders: **not wanted**, dropped.

---

## 9. Still open

1. **Netlify site:** `cookbk.netlify.app` exists. Confirm it's linked to this GitHub repo so pushes auto-deploy, and that the team is on a credit-based plan (needed for Netlify Database).
2. **Google sign-in:** enable Netlify Identity on the site, add the Google provider, set registration to invite-only, invite my Google address, and give my user the `admin` role (see the README's Netlify setup).
