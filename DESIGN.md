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
  hairline: "#e6e6e9"
  field-border: "#c9c9ce"
  tomato: "#e4572e"
  tomato-pressed: "#c9461f"
  tomato-ink: "#c4421c"
  error-red: "#d1291f"
  photo-scrim: "rgba(0, 0, 0, 0.58)"
  tag-glass: "rgba(0, 0, 0, 0.45)"
  card-shadow: "rgba(0, 0, 0, 0.08)"
typography:
  screen-title:
    fontFamily: "-apple-system, system-ui, SF Pro Display, sans-serif"
    fontSize: "24px"
    fontWeight: 700
  nav-title:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  section-title:
    fontFamily: "-apple-system, system-ui, SF Pro Display, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  feature-title:
    fontFamily: "-apple-system, system-ui, SF Pro Display, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  recipe-title:
    fontFamily: "-apple-system, system-ui, SF Pro Display, sans-serif"
    fontSize: "26px"
    fontWeight: 700
  step:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  edit-text:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  body:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "17px"
    fontWeight: 400
  meta:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  chip:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  button:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  button-main:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "19px"
    fontWeight: 700
  tag:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  badge:
    fontFamily: "-apple-system, system-ui, SF Pro Text, sans-serif"
    fontSize: "11px"
    fontWeight: 700
rounded:
  badge: "6px"
  field: "18px"
  search: "20px"
  list-inset: "16px"
  thumb: "18px"
  button: "16px"
  feature-card: "24px"
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
  feature-card:
    rounded: "{rounded.feature-card}"
    textColor: "{colors.surface-white}"
  recipe-thumb:
    rounded: "{rounded.thumb}"
    size: "64px"
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
| `--ck-line` | `#e6e6e9` | Hairlines between rows |
| `--ck-strong` | `#c9c9ce` | Field and chip borders |
| `--ck-accent` | `#e4572e` | **Tomato.** Main button, links, checked ingredients, active tab, badges |
| `--ck-accent-press` | `#c9461f` | Pressed main button |
| `--ck-accent-ink` | `#c4421c` | **Tomato ink.** Tomato for text: links, Edit / Save / Done, active tab label, badges. Framework7's theme color |
| `--ck-error` | `#d1291f` | Field errors and destructive actions (Delete, Discard). Replaces iOS's `#ff3b30`, which is too faint on white |

## Typography

- **Font:** iPhone system font (SF Pro) everywhere. Weights 400 / 500 / 600 / 700.
- **Icons:** Lucide (`lucide-react`), 22px in navigation bars, 24px in the tab bar, 2px stroke. Framework7's built-in glyphs (back chevron, list chevrons, checkmarks, search magnifier) stay as they are.
- **Light mode only for now.** A dark version can be added later by redefining the tokens.
- **Contrast (checked with Impeccable):** white on Tomato is 3.7:1, so the main button label is 19px bold (WCAG "large text"). Any Tomato *text* uses Tomato ink (4.6:1 on the grey page). Muted grey is 4.6:1 on the grey page.

## Components

Where each component's shape comes from:

| Component | Source | Shape |
|---|---|---|
| Background, titles | RED (Xiaohongshu) | Grey page, white content, soft near-black text, no shadows. **No iOS 26 elements:** no liquid glass, no floating bars. The top bar is solid grey with the title on the left (24px bold on tab screens, 17px semibold on pushed screens) in the same row as separate 40px soft grey round buttons |
| Search bar | Headspace | Soft grey pill (20px corners), no outline, leading magnifier. It sits in the page content and scrolls away |
| Filter chips | Headspace | Full pill, soft grey fill, no border, 600 weight. Active = filled `--ck-fg` with white text |
| Featured recipe card | Headspace | Photo card, 24px corners, ~200px tall, dark gradient from the bottom, small dark see-through tag pill, 22px bold white title, soft shadow |
| Recipe list | Headspace | Thin hairlines between rows, 64px photo thumbnails with 18px corners, 600-weight title, muted meta line. Section titles 19px extra-bold |
| Servings stepper and ×½–×3 | Pinterest | Soft-filled round buttons; segmented control with a dark active segment |
| Ingredients | Instacart | Light hairline rows, round check that fills Tomato, bold amount + regular name, muted note |
| Main button | DoorDash | Pill, 52px tall (48px in the recipe footer), 19px bold white label, Tomato fill |
| Other buttons | Pinterest | Soft grey fill, pill, 46px tall, 600 weight, dark text. **Every button in the app is a pill** (text buttons, dashed "Separate into groups", nav buttons, footer buttons); icon-only buttons are circles |
| Sheet headers | (RED) | Plain bold title on the left, Tomato ink text button ("Done") on the right, no glass bubbles |
| Form fields | Headspace | Soft grey filled box, 18px corners, no border, 12px semibold label above. Focus = 1.5px Tomato ring, error = red ring + red helper text. Edit screens use compact 14px text (like Prepear) |
| Vertical rhythm | (shared) | Three levels, measured text to text, so the outline reads at a glance: **44px above a section heading** (Ingredients, Directions, Notes; `section-gap`), **24px above a group label** (`group-gap`), **8px from a group label to its first line** (`group-label-gap`). A section break must always be clearly bigger than a group break |
| Group labels | (shared) | Ingredient and direction groups ("MARINADE", "PREP"): 12px bold uppercase, 0.06em tracking, muted grey. **Plain text that scrolls with the content**, not Framework7's list group title (that is a list row with hairlines and no space above it, and inside a list group it pins while scrolling). Spacing, measured text to text so Ingredients and Directions look the same: **24px above a label** (`group-gap`, from the last line of the group before it), **8px from a label to its first line** (`group-label-gap`). The first ingredient label sits about 22px below the servings pill, matching Directions under its heading. Labels line up with the page's 16px gutter. No hairline above a label |
| Tab bar | DoorDash | Docked across the full bottom edge (not floating), 56px plus the safe area, flat white with a hairline on top, no bubble behind the active tab. Four tabs: Recipes, Cookbooks, Plan, Groceries. Tomato ink active, muted inactive, 600-weight labels |

### Screens (picked in Side by side, Nov 2026)

- **Recipes list (Headspace):** large soft search pill, soft chips, photo card with title over a dark gradient, hairline list with rounded thumbnails.
- **Recipe page (Airbnb), reads like a plain recipe:** full-bleed square photo under a see-through top bar with only back and •••; a panel with 28px top corners overlaps the photo; centered 26px title and meta; stats row (rating · made it · total time) with hairline dividers; plain ingredient rows with hairlines, split into groups under plain uppercase group labels (see Group labels); numbered directions (Tomato-tint number circles) in groups; notes card. **App controls stay out of the content:** ••• holds Edit, Add to Cookbook / Plan / Grocery List, Share, Duplicate, Delete; a plain "N servings ▾" pill (text and chevron, no icon) next to the Ingredients heading is the only place servings show (it opens **Adjust amounts**, and reads "×1.5 · 6 servings" when scaled); the footer holds a full-width "Start cooking". The tab bar hides on this page.
- **Adjust amounts (sheet):** servings −/+, quick ×½ ×1 ×2 ×3 chips, and "Or match what you have": pick an ingredient, type the amount you have, and everything scales to match (issue #3). "Back to original amounts" resets. Scaling resets when the recipe is reopened; ranges scale from their low end.
- **Edit (Headspace, stacked page, not a sheet):** Cancel · Edit Recipe · Save (filled Tomato ink pill, white text); photo with remove/replace buttons; soft fields; ingredients and directions in soft 24px cards with drag handles on the left, swipe to delete, group rows; a paste box under each list (blank lines skipped, "For the sauce:" lines become groups); dashed "Separate into groups"; notes; course chips; tags; servings; serving size; prep and cook time; source. All text 14px.

## Do's and Don'ts

- Never hard-code a color in a component. Use `var(--ck-*)`.
- One accent per screen area: Tomato is for the main action and selection states, not decoration.
- Framework7 still owns layout, motion, gestures, sheets and z-index (see `CLAUDE.md`).
