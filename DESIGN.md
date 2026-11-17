---
name: Cookbook
description: Friendly, native-feeling iPhone recipe app. Component shapes mixed from six design systems, one unified theme.
colors:
  page-cool-grey: "#f5f5f5"
  surface-white: "#ffffff"
  soft-fill: "#ececee"
  ink: "#262628"
  ink-secondary: "#55555a"
  ink-muted: "#6e6e73"
  ink-done: "#a5a5aa"
  photo-dark: "#000000"
  on-dark-muted: "#c7c7cc"
  scrim: "rgba(0, 0, 0, 0.62)"
  hairline: "#e6e6e9"
  field-border: "#c9c9ce"
  tomato: "#e4572e"
  tomato-pressed: "#c9461f"
  tomato-ink: "#c4421c"
  error-red: "#d1291f"
  photo-scrim: "rgba(0, 0, 0, 0.58)"
  tag-glass: "rgba(0, 0, 0, 0.45)"
  plate-shadow: "0 3px 8px rgba(0,0,0,0.18)"
  book-blush: "#f6e4dd"
  book-sage: "#e3ebdf"
  book-butter: "#f3ecd6"
  book-sky: "#dfe8ef"
  book-oat: "#ece6dc"
  book-lilac: "#e9e4ef"
  card-shadow: "rgba(0, 0, 0, 0.08)"
typography:
  screen-title:
    fontFamily: "Fredoka, -apple-system, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
  nav-title:
    fontFamily: "Fredoka, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
  section-title:
    fontFamily: "Fredoka, -apple-system, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  feature-title:
    fontFamily: "Fredoka, -apple-system, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
  recipe-title:
    fontFamily: "Fredoka, -apple-system, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
  step:
    fontFamily: "Nunito, -apple-system, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
  edit-text:
    fontFamily: "Nunito, -apple-system, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  body:
    fontFamily: "Nunito, -apple-system, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
  meta:
    fontFamily: "Nunito, -apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  chip:
    fontFamily: "Fredoka, -apple-system, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  button:
    fontFamily: "Fredoka, -apple-system, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
  button-main:
    fontFamily: "Fredoka, -apple-system, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
  tag:
    fontFamily: "Nunito, -apple-system, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  badge:
    fontFamily: "Nunito, -apple-system, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
rounded:
  badge: "6px"
  field: "18px"
  search: "20px"
  list-inset: "16px"
  card: "18px"
  button: "16px"
  main-button: "28px"
  pill: "9999px"
spacing:
  gutter: "16px"
  chip-gap: "8px"
  stack: "10px"
  section-gap: "44px"
  group-gap: "24px"
  group-label-gap: "8px"
components:
  button-main:
    backgroundColor: "{colors.tomato}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.main-button}"
    height: "52px"
  button-main-pressed:
    backgroundColor: "{colors.tomato-pressed}"
  button-soft:
    backgroundColor: "{colors.soft-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    height: "46px"
  chip:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "34px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface-white}"
  search-field:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.pill}"
  field:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.field}"
  recipe-tile:
    backgroundColor: "transparent"
    photoRounded: "16px"
    photoAspect: "1 / 1"
    columns: 2
---

# Design System: Cookbook

## Overview

Chosen in the Mix & match sticker sheet (Nov 2026). Each component keeps the **shape** (corners, sizes, spacing, type weight) of the design system it came from, and **all colors and the font come from one shared theme** below.

Implementation: `src/theme/cookbook.css` (tokens and Framework7 variable mapping) plus a few small components in `src/components/ui/`. Check everything visually on the in-app **Settings → Style Guide** page.

## Colors

| Token | Value | Use |
|---|---|---|
| `--ck-bg` | `#f5f5f5` | Page background (Cool grey, from RED) |
| `--ck-surface` | `#ffffff` | Cards, fields, search bar, lists that sit on the background |
| `--ck-soft` | `#ececee` | Filled buttons, stepper buttons, segmented track |
| `--ck-fg` | `#262628` | Main text, active chip and segment |
| `--ck-fg2` | `#55555a` | Secondary text |
| `--ck-muted` | `#6e6e73` | Meta text, placeholders, inactive tabs (iOS secondary label grey) |
| `--ck-photo-dark` | `#000000` | Behind a photo being cropped (Crop Photo) |
| `--ck-on-dark-muted` | `#c7c7cc` | Small text on `--ck-photo-dark` (the crop hint) |
| `--ck-scrim` | `rgba(0,0,0,0.62)` | Small label over a photo (the "Cover" badge on thumbnails) |
| `--ck-plate-shadow` | `0 3px 8px` 18% black | A cookbook's plates (round recipe photos) on its card |
| `--ck-book-blush` … `--ck-book-lilac` | `#f6e4dd` blush, `#e3ebdf` sage, `#f3ecd6` butter, `#dfe8ef` sky, `#ece6dc` oat, `#e9e4ef` lilac | A cookbook card's soft colour (one per cookbook); text on them is `--ck-fg` and `--ck-fg2` (the muted grey is under 4.5:1 there) |
| `--ck-done-ink` | `#a5a5aa` | Ticked (crossed-out) rows in cook mode, step number included. Deliberately below AA (about 2.3:1 on the page): finished items fade back. The only text exempt from the contrast check |
| `--ck-line` | `#e6e6e9` | Hairlines between rows |
| `--ck-strong` | `#c9c9ce` | Field and chip borders |
| `--ck-accent` | `#e4572e` | **Tomato.** Main buttons, links, checked ingredients, active tab, badges |
| `--ck-accent-press` | `#c9461f` | Pressed main button |
| `--ck-accent-ink` | `#c4421c` | **Tomato ink.** Tomato for text: links, Edit / Save / Done, active tab label, badges. Framework7's theme color |
| `--ck-error` | `#d1291f` | Field errors and destructive actions (Delete, Discard). Replaces iOS's `#ff3b30`, which is too faint on white |

## Typography

- **Fonts: Nunito for reading, Fredoka for titles and buttons** (issue #21). The user wanted something rounder and friendlier than the iPhone font, tried Nunito, M PLUS Rounded, Zen Maru Gothic, Quicksand and Baloo 2, and picked Fredoka as the most fun; Fredoka everywhere was hard to read in body text, so Nunito took that over. **Fredoka** (`--ck-font-display`): tab and top bar titles, the recipe name, section headings (Ingredients, Directions, Notes; the editor's and cook mode's too), sheet and dialog titles, every button and link-button (main and soft buttons, Save, Cancel, Done, the servings pill, dialog and action sheet buttons, swipe Delete) and chips. **Nunito** (`--ck-font`): everything else: ingredients (linked recipe names included), steps, notes, meta lines, stats, group labels, recipe card titles, fields, lists and Settings rows. Both are Google Fonts served from this site (`public/fonts/`, declared in `cookbook.css`, their Latin letters preloaded in `index.html`) so they work offline and the first paint is already in them (a late font set off iPhone Safari's smear of the Start cooking bar; the smear itself was Framework7's toolbar blur, now off, #31); they fall back to the iPhone font, which also covers fractions they lack (⅓, ⅔, ⅛).
- **Weights:** Fredoka's bold is very heavy, so **Fredoka text** (titles, buttons, chips) uses each weight one step lighter than usual: bold 600, semibold 500, plain 400; nothing uses 700, page titles included. **Nunito text** read too light at those weights, so it is one notch heavier than that (issue #21, after the switch to Nunito): plain text 500, semibold 600 (recipe card titles, field labels, linked recipe names), bold 700 (ingredient amounts, group labels, step numbers, stats). In `cookbook.css` the page's base weight is 500 (`body`), Framework7's list text and typed text are set to match, and the few Fredoka links that took the base weight (Cancel in a top bar, Sign Out, swipe Delete) are pinned back to 400. Framework7's own bold (dialog titles, sheet titles, action sheet buttons) follows the Fredoka weights.
- **Icons:** Lucide (`lucide-react`), 22px in navigation bars, 24px in the tab bar, 2px stroke. Framework7's built-in glyphs (back chevron, list chevrons, checkmarks, search magnifier) stay as they are.
- **Light mode only for now.** A dark version can be added later by redefining the tokens.
- **Contrast (checked with Impeccable):** Any Tomato *text* uses Tomato ink (4.6:1 on the grey page). **All orange buttons are the same bright Tomato** with a white 600-weight label: Start cooking, Continue with Google, Save, and the dialogs' main button (OK, Sign out). **Deliberate exception:** that is 3.7:1, under WCAG AA (the main buttons passed before as 700 "large bold" text, and Save was Tomato ink, 5:1). The user chose this in issue #21 over Tomato ink, which looked darker than production. `check:ui` skips these buttons in its contrast check. Muted grey is 4.6:1 on the grey page.

## Components

Where each component's shape comes from:

| Component | Source | Shape |
|---|---|---|
| Background, titles | RED (Xiaohongshu) | Grey page, white content, soft near-black text, no shadows. **No iOS 26 elements:** no liquid glass, no floating bars, and **no backdrop blur** on the top bar, its buttons, the search field or the tab bar (it never showed under the solid colours, and iPhone Safari sometimes left blurred layers blank, so the header vanished; #25). The top bar is solid grey with the title on the left (26px bold on tab screens; 17px semibold on pushed screens) in the same row as separate 40px soft grey round buttons, 8px apart; the bar is 48px tall (plus the safe area), shorter than iOS 26's. Recipes: + (new), sort, settings. The search bar sits 4px under the bar, the chips 12px under the search bar |
| Search bar | Headspace | Soft grey pill (20px corners), no outline, leading magnifier. It sits in the page content and scrolls away |
| Filter chips | Headspace | Full pill, soft grey fill, no border, 500 weight. Active = filled `--ck-fg` with white text. On the Recipes screen they stay on **one line that scrolls sideways** (no wrapping) |
| Recipe tiles | (issue #8) | **Two per row**, 12px apart, 20px between rows. **No card**: a square photo with 16px corners (no photo: plain soft grey with a muted Lucide chef hat centred in it, never a colored placeholder), then the text right on the page below it: 14px semibold title (two lines max), 12px muted total time (only when one is set; no source on a tile, #14), small stars once rated |
| Servings stepper and ×½–×3 | Pinterest | Soft-filled round buttons; segmented control with a dark active segment |
| Ingredients | Instacart | Compact 15px hairline rows (36px minimum, 7px padding, about half Framework7's iOS default) so more of the list fits on screen: bold amount + regular name, 13px muted line under it: the note, and "not scaled" for an amount that isn't a number while scaling. **Unit conversions (issue #6):** an amount in a measuring unit has a **fitted grey underline** (`--ck-strong`, 1.5px, 3px below the text, only under the amount), which says it converts. Tapping it highlights the ingredient row in pale Tomato (`--ck-accent-tint`, the design's selection tint, as for a row held in the editor; 12px corners, set 8px in from the screen edges, since rounded corners never touch them) and opens a **Framework7 bottom sheet**, out from under the thumb that tapped: the ingredient as its bold title with Tomato-ink Done, then **radio rows** (a grey ring; picked: a filled Tomato circle with a white dot): the recipe's own amount first, marked "Original", then the same amount in the other units (4 tbsp: 12 tsp, ¼ cup, 2 fl oz, 59 ml; volume to volume, weight to weight, "about" when rounded, nothing more than 10% off; the neatest one marked "Simpler"). The page isn't dimmed and scrolls so the tapped ingredient sits just above the sheet. Picking one **replaces the amount** in the row (its underline turns Tomato) and closes the sheet; Done, swiping down, tapping elsewhere, or **tapping the same amount again** close it too, and tapping another amount switches the sheet to that ingredient. Tapping a converted amount shows the options with the pick selected, and Original puts it back. Picks last until the recipe is closed. The same works **in cook mode** (tapping the amount converts it; the rest of the row still ticks it off), and a pick in either place shows in both. (A popover beside the amount was tried first and dropped: the thumb that tapped covered it.) Each row has a small grey bullet (5px, `--ck-fg2`, on the first line, indented 6px), which sets the rows in from their group label so the groups stand out, as in Prepear. **No checkboxes** on the recipe page; checking off belongs to Start cooking (cook mode) |
| Direction steps | (plain) | 15px text, 1.45 line height. Step numbers are plain bold text in the text color, no circles or fills |
| Dialogs | Framework7 | Framework7's alert/prompt with pill buttons: main button filled bright Tomato (600, 17px, like every orange button), the other soft grey with dark text (17px). When a label won't fit a half-width button, the buttons stack (main one on top), as iOS alerts do |
| Main button | DoorDash | Pill, 52px tall (48px in the recipe footer), 20px bold (600) white label, bright Tomato fill (a contrast exception, see Typography) |
| Other buttons | Pinterest | Soft grey fill, pill, 46px tall, 500 weight, dark text. **Every button in the app is a pill** (text buttons, dashed "Separate into groups", nav buttons, footer buttons); icon-only buttons are circles |
| Pushed form screens (Edit / New Recipe) | iOS | Cancel (soft pill) · **centered title** · Save (filled bright Tomato pill, like every orange button). Tab screens keep left titles. No photo yet: a 120px soft grey box with a dashed edge, camera icon and "Add a photo"; the whole box is tappable |
| Sheet headers | (RED) | Plain bold title on the left, Tomato ink text button ("Done") on the right, no glass bubbles |
| Form fields | Headspace | Soft grey filled box, 18px corners, no border, 12px semibold label above. Focus = 1.5px Tomato ring, error = red ring + red helper text. Edit screens use compact 14px text (like Prepear) |
| Vertical rhythm | (shared) | Three levels, measured text to text, so the outline reads at a glance: **44px above a section heading** (Ingredients, Directions, Notes; `section-gap`), **24px above a group label** (`group-gap`), **8px from a group label to its first line** (`group-label-gap`). Heading sizes step down the same way: 22px section, 17px group, 15px rows. A section break must always be clearly bigger than a group break |
| Group labels | (shared) | Ingredient and direction groups ("Marinade", "Prep"): **17px bold, dark text, sentence case as typed (never all caps)**, so a group stands out from its 15px rows. **Plain text that scrolls with the content**, not Framework7's list group title (that is a list row with hairlines and no space above it, and inside a list group it pins while scrolling). Spacing, measured text to text so Ingredients and Directions look the same: **24px above a label** (`group-gap`, from the last line of the group before it), **8px from a label to its first line** (`group-label-gap`). The first ingredient label sits about 22px below the servings pill, matching Directions under its heading. Labels line up with the page's 16px gutter. No hairline above a label |
| Tab bar | DoorDash | Docked across the full bottom edge (not floating), 60px plus the home-indicator strip (about 94pt in all on an iPhone, running to the bottom edge with the icons centred in the 60px above the strip; the Start cooking bar works the same way), **icons only, no labels** (each tab has a spoken label), flat white with a hairline on top, no bubble behind the active tab, and **no press highlight** (Framework7 v9's tab highlight grows and bounces on tap, and its iOS 26 touch highlight swells the whole bar under the finger; both are switched off, the touch highlight app-wide via `touch.touchHighlight: false`). Four tabs: Recipes, Cookbooks, Plan, Groceries (icons: chef hat, book, calendar, cart). Tomato ink active, muted inactive, 500-weight labels |

### Screens (picked in Side by side, Nov 2026)

- **Recipes list (square tiles):** large soft search pill, one sideways-scrolling row of chips (All, then a chip for every tag in use: the course types in meal order, then the rest A–Z), a muted "5 recipes · Newest first" line ("· all tags" or "· any tag" added when two or more chips are picked; the sort sheet then also offers All the tags / Any of the tags), then the two-column grid of recipe tiles. The sort and the picked chips are remembered. While the list first loads, a spinner sits where the cards go; if it can't load, a muted message and a soft "Try again" pill. No featured or "Recently added" card.
- **Sign in (Framework7 login screen):** the grey page with the app icon (88px, 20px corners), "Cookbook" (28px bold), a muted one-line description and one main button, **Continue with Google**, centred. While checking the sign-in, a spinner replaces the button. A problem (the account isn't invited, or has no admin role) shows below it in red. Settings is four white inset cards, each under its own group title and none with a footer: **Account**, one row with the signed-in address and a red **Sign Out** at its end (with a confirm dialog); **Import**, one row, **From Prepear**, opening Import from Prepear; **Version**, one row with the deploy's commit and build time and a Tomato-ink refresh icon at its end: tapping the row checks for a new version, the icon **spins** while it checks (at least 0.7s), a new version installs and the app reloads into it, otherwise the icon just stops (no dialog, no toast); and **Style Guide**, one row named after the design system, **Cookbook**, opening the Style Guide page. **Import from Prepear (issue #14):** a short intro, then **Step 1 · Export from Prepear**: one white card row, **Copy the export bookmarklet**, with a Tomato-ink copy icon at its end (a toast says it's copied), and a white card of numbered steps for iPhone Safari, ending in a muted note with a Tomato-ink **Cookbook export** link to drag to a Mac's Favorites bar (tapping it in the app does nothing). **Step 2 · Import**: one row, **Choose the export file**, with a Tomato-ink file icon (a muted line says where the file is). Once a file is chosen, a white card of counts (Recipes to import, With a photo, Already imported, Can't import with a muted footer saying why; value rows only when not zero), then the main button **Import N recipes** and a muted line to keep the app open. While importing: a white card with a Framework7 progress bar and "Importing 12 of 262… Keep the app open." Then the same card says **Imported N recipes.**, plus how many photos couldn't be copied and how many recipes couldn't be saved, with a **Try again** main button for those; a problem shows in red in the card. **Step 3 · Cookbooks (issue #25):** one row, **Look at your Prepear cookbooks**, with a Tomato-ink book icon (a muted line says it reads the file kept in step 2), then the same white card of counts (Cookbooks to import, With sections, Already imported, Recipes not found with a muted footer), the main button **Import N cookbooks** ("Nothing new to import" when they're all in), a progress card, and **Imported N cookbooks.** At the bottom, **For Claude**: a row to copy the peek bookmarklet, with a muted line on when it's needed. The bookmarklets' own panels are drawn on Prepear's page, so they're styled inline there (white card, Tomato-ink Save file, grey secondary buttons).
- **Cookbooks (issue #25):** the tab's title row has **+** (New Cookbook, a Framework7 prompt dialog). A muted "16 cookbooks" line, then every cookbook A–Z. Cookbooks, sections and recipes each have their own shape (the user found them all alike as square tiles): each cookbook is a **card in a soft colour** (one of six pale, muted colours: blush, sage, butter, sky, oat, lilac; picked at random from the cookbook's id, the same every time, until one is chosen with **Change Colour**), 20px corners, with three of its recipes as **plates** (from the user's Spotify reference): round photos with 3px white rims and a soft shadow, the first big (92px) in the middle and in front, the next two smaller (66px) either side, overlapping it and running off the card's edges (empty grey plates where there's no photo; a muted book on the middle one when there are none). Under them, **on the left** (centred was tried; left reads better), the name in the title font (Fredoka 17px, 600, two lines at most) and "70 recipes · 3 sections" in `--ck-fg2`. **Change Cover** (the cookbook's ⋯) opens **Cover Photos**: the cookbook's recipes with photos as check boxes, up to three, each ticked row labelled with where it goes (The big plate, Left plate, Right plate); a fourth is refused with a toast. A round button after **+** switches between **tiles** (books two to a row) and a **list** (a white inset card, each row a 60px rounded square in the cookbook's colour with its first plate, the name and the counts, a chevron); it shows the other view's icon (list or grid) and the choice is remembered like the recipe sort. No cookbooks yet: a muted line, a main **New cookbook** pill and a soft **Import from Prepear** pill. **A cookbook** (pushed, back, title, **+** Add Recipes and **⋯**): the soft search pill, always there even before there's anything to search, so the page keeps its shape ("Search this cookbook", covering its sections too, no overlay, "2 of 70 recipes" while searching), a muted "70 recipes · 3 sections" line, then each section as a **shelf**: its name (Fredoka 20px) with a muted count, **See all** in Tomato ink at the right (both open the section), and its first 12 recipes as 132px recipe tiles in a row that scrolls sideways (native scrolling, like the chip row); and **Uncategorized** as the last shelf (when it has recipes), whose See all opens its own page like a section's (its ⋯ has only Add Recipes and Organize); without sections just the recipe tiles. **A section**: its name as the title with the cookbook's name as a small subtitle under it, then its recipe tiles. Empty: a muted line and a main **Add recipes** pill. **⋯** is a Framework7 action sheet titled with the name: Add Recipes, Organize, New Section (cookbooks only), Rename, Change Cover, Change Colour (a sheet titled Colour with Done: six round swatches in a row, the chosen one ringed in Tomato with a check; tapping one recolours the card at once), and a red Delete (a section's recipes move to Uncategorized; a cookbook's stay in Recipes; both confirm). **Add Recipes** and **Cover Photos** are full-screen popups that stack like iOS cards (as the recipe list for linking an ingredient): a search pill, then one white inset card of rows, each with a 44px rounded thumbnail (10px corners; chef hat on soft grey when there's no photo), a 600-weight title and a muted line saying where else in the cookbook it is ("In Meat", "Uncategorized"). Add Recipes has Cancel and a Tomato **Done** pill, with check boxes (the place's recipes start ticked; unticking takes one out); Cover Photos has check boxes too, up to three, with a muted hint above the list and each ticked row labelled with where its photo goes. **Organize** is the editor's sortable list in a popup: a muted hint, then soft cards per place under bold Fredoka headings (Uncategorized first, which has no handle; then each section), recipe rows with thumbnails centred on them and drag handles on the right; drag a recipe between headings to move it, drag a heading to move the section, swipe left for **Remove**; Cancel / Done. **Add to Cookbook** (from a recipe's ⋯): a popup with Cancel and Done, a white row **+ New Cookbook** (it starts with the recipe in it), then a card of every cookbook A–Z with a check box and thumbnail; a cookbook with sections is a plain row (thumbnail and name, in line with the others) with its places under it (Uncategorized, then each section), their boxes in the thumbnail column. Nothing changes until **Done**, which saves the cookbooks that changed (a new cookbook is made then too); Cancel, or swiping it away, leaves everything as it was. **Tabs:** leaving a tab takes it back to its first page (the browser has one history for every tab, and two tabs deep at once made back move both).
- **Recipe page (Airbnb), reads like a plain recipe:** back and ••• **float over the photo** as white round buttons, with no bar behind them (issue #7; no title, like Prepear); the photo starts at the very top of the screen, under the status bar. The buttons **slide away while scrolling down and come back on scroll up** (Framework7 `hideNavbarOnScroll`, as in Prepear); the photos are full width and 4:3: one shows as is, several swipe sideways with white page dots above the panel (Framework7 Swiper); tapping one opens it full screen on black (Framework7 Photo Browser: swipe through, pinch or double-tap to zoom, "2 of 4", swipe down or Close); a panel with 28px top corners overlaps the photo; the centered 26px title alone (no line under it: the source and labels moved to the end, #41); stats row (rating · made it · total time) with hairline dividers, a dash for a rating or time that isn't set (#14: "0m" read as instant); bulleted ingredient rows with hairlines, split into groups under plain uppercase group labels (see Group labels); numbered directions (plain bold numbers) in groups; notes card; then **where it belongs** (issue #41), each a section heading like Notes with chips under it: **Labels** (the recipe's tags as the Recipes filter's chips; tapping one opens Recipes filtered by just that label), **Cookbooks** (a chip for each place it's in, in the cookbook's soft colour with a muted Lucide book: "Grilling" for the cookbook, "Dinners · Meat" for a section; tapping one opens it), **Meal plans** with #26 (a row per plan, its name and "Week 1 · Day 3 · Dinner", with Lucide's clipboard-list icon, not a calendar: a plan has numbered days, not dates); each section only when there's something in it; last, **Source** (muted text, or a Tomato-ink link with an external-link icon when it has a web address). **App controls stay out of the content:** ••• holds Edit, Add to Cookbook / Plan / Grocery List, Share, Duplicate, Delete; a plain "N servings ▾" pill (text and chevron, no icon) next to the Ingredients heading is the only place servings show (it opens **Adjust amounts**, and reads "×1.5 · 6 servings" when scaled); the footer holds a full-width "Start cooking". The tab bar hides on this page.
- **Recipes as ingredients (issue #11):** an ingredient made from another recipe (a sauce, a pie crust) shows its name in **Tomato ink, 500 weight, with a small chevron** (14px). On the recipe page it opens that recipe, pushed like any page (swipe back returns). In cook mode it opens that recipe **in a tab**, starting at its own amounts: cook mode stays one full-screen view (no cards stacked over each other), and its **top bar becomes a tab strip**, like a browser's tabs but rounder. The bar turns soft grey (`--ck-soft`) right up under the status bar (in Safari the page's theme colour turns the same grey while the tabs show) and holds X (a light round button, the page colour) and a tab per recipe **in place of the title**, each with the recipe's cover photo as a 24px thumbnail (7px corners; the chef hat on soft grey when there's no photo) before its name, so the name isn't shown twice. The recipe shown is a tab in the page colour with 14px top corners and small inward curves at its feet, running into the page below; the others are 14px semibold grey text (`--ck-fg2`) on the strip. Tapping a tab switches at once (Framework7 Tabs). Tabs share the width (up to 240px each; the shown one gets a bigger share, so it keeps more of its name when a timer's pill is in the bar), and long titles end in …. Each keeps at least 96px (the shown one 132px): with more recipes than fit (usually four or more), the row **scrolls sideways with a swipe** (native scrolling, no scrollbar; a tab cut off at the edge shows there's more), and the shown tab scrolls into view when it opens or is picked. A running timer's pill sits on the strip as a light button like X. Everything is kept until cook mode closes: what's ticked and where each open recipe is scrolled, its amounts and units, and the timers, which run and ring whichever recipe is shown (a linked recipe's timer is named with its recipe). **X closes the shown recipe's tab** (like closing a browser tab), showing the tab before it; closing the last tab leaves cook mode. A closed recipe keeps its ticks and amounts until cook mode closes, so opening it again from its ingredient picks up where it was. Closing a recipe with all its steps ticked offers "Mark as made" first (after which it starts fresh). When only one tab is left, the bar goes back to X and that recipe's title. With a single recipe the bar is the usual one: X and the title. Tapping the name never ticks the row. The row keeps its own words, so if the linked recipe is deleted it reads as a plain ingredient; deleting a recipe that's used elsewhere says where ("It's an ingredient in “Apple Pie”. That line stays, without the link.").
- **Adjust amounts (sheet):** a **Servings | What I have** toggle at the top, then one result line ("Showing the original amounts", "Showing ×2 · 8 servings", "Matched to 3 lb chicken thighs · ×1.5 · about 6 servings") with a **Reset** link. *Servings:* −/+ and ×½ ×1 ×2 ×3 chips. *What I have* (issue #3): "Tap the ingredient you have a different amount of", the ingredient list, and tapping one asks in a dialog: "The recipe uses 2 lb. How much do you have?" Everything scales to match; the row shows "You have 3 lb" and a toast confirms. Scaling resets when the recipe is reopened; ranges scale from their low end.
- **Cook mode (full-screen popup from Start cooking, laid out like Prepear):** keeps the screen on (Screen Wake Lock). The Ingredients heading has the same "N servings ▾" pill as the recipe page; it opens Adjust amounts over cook mode (with its own backdrop inside the cook popup, so it dims), and the amounts everywhere update. Top bar: close (X), the recipe title, and a Tomato-ink countdown pill while a timer runs (tap for all timers). The screen is split: **Ingredients** on top, **Directions** below, each half scrolling on its own, with a **drag handle** between them (a 2px Tomato line with a bright Tomato grip pill and white dots, laid over the split; text from either half runs up to the line and fades softly into the page colour over the last ~18px, instead of being cut off by a band; each half has room at that end so the last ingredient and the Directions heading can sit clear of the fade; 44px tall to grab; while a finger is on it the line thickens to 4px and the grip grows to 72×32, like Prepear, so you can tell you've got it; holding it never selects text or opens the iOS magnifier; the split is remembered on the phone; arrow keys move it too). Ingredients are a checklist; steps have checkboxes too; ticked rows are crossed out and faded to `--ck-done-ink`, with no grey flash on tap. Ingredients scrolling up under the top bar fade into the page colour over the last 16px, as at the divider. Big text: 17px ingredients, 18px steps, step checkboxes centred on the first line of text. Under each unticked step (ticking slides this away with Framework7's accordion collapse, about 300ms, and unticking slides it back): the ingredients it mentions at today's amounts (14px, one line) and a "10 min timer" pill for each time it mentions (a range offers its low end). Timers keep running, then beep and show a dialog. Closing after ticking every step offers "Mark as made", which adds one to "made it" (stacked buttons, Mark as made on top: the label doesn't fit a half-width dialog button).
- **Edit (Headspace, stacked page, not a sheet):** Cancel · Edit Recipe · Save (filled bright Tomato pill, white text, like every orange button); **photos**: the selected one large with round Remove, Make cover (star, not on the cover) and Crop buttons, then a strip of 64px 4:3 thumbnails (the first marked "Cover", the selected one ringed in Tomato) ending in a dashed + tile; picking one photo opens **Crop Photo** (full-screen popup on black, a fixed 4:3 frame, pinch to zoom and drag to move, Cancel / Done; Cropper.js), picking several adds them centre-cropped (crop any later); the full photo is kept so a crop can be redone; soft fields; ingredients and directions in soft 24px cards, **one card per group** (the group name sits on the page colour between cards; it's still one sortable list, so rows can be dragged between groups), drag handles on the **right** (so a thumb doesn't cover the row being dragged) lined up with each row's first line (the step number, the ingredient; on group rows, the "Group" + name label); each group row also has round ↑ ↓ buttons that move the whole group with its rows past the neighbouring group, keeping it under the finger (an extra to dragging, which moves one row); a row being held or dragged (long press, or the handle) turns pale Tomato (`--ck-accent-tint`) with 16px corners, so it's clear which row moves; a row swiped open hides its handle, swipe to delete, group rows whose names (17px bold, as big as the recipe page's group labels) are typed right in the row (no sheet; a new group opens with the cursor in it, 1.5px Tomato underline while typing); a paste box under each list (blank lines skipped, "For the sauce:" lines become groups); dashed "Separate into groups"; notes; **Tags** as one set of chips (the course types plus every tag already used; tap to toggle; a dashed "+ Add tag" chip is a field you type a new tag into (Return adds it, selected; no dialog); courses and tags are one concept); servings; serving size; prep and cook time; source. No help text at the bottom. All text 14px. Field clear (×) buttons sit 12px inside the field's rounded end. The Edit Ingredient sheet shows the whole line ("1 cup plain Greek yogurt, divided") at the top, under its title. Under its four fields, a **Recipe** row ("None", or the linked recipe's name) links the ingredient to another recipe (issue #11): it opens **Link a Recipe**, a full-screen popup (Cancel) with a search bar, **None**, then the other recipes A–Z, as radio rows like the unit sheet's; picking one closes it. The list **stacks over the page and the sheet** like an iOS card (Framework7 popup push; the sheet lives in the page's view, so both shrink back behind it) and slides away after picking, Cancel, or a swipe down on its title bar, leaving the sheet where it was. A linked row says "Recipe: Tahini Sauce" in its muted line (its name stays dark: Tomato ink is under 4.5:1 on the soft editor cards). A pasted line named exactly like a recipe ("1/2 cup tahini sauce") links itself.

## Do's and Don'ts

- Never hard-code a color in a component. Use `var(--ck-*)`.
- One accent per screen area: Tomato is for the main action and selection states, not decoration.
- Framework7 still owns layout, motion, gestures, sheets and z-index (see `CLAUDE.md`).
