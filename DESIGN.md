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
  error-red: "#d93025"
  photo-scrim: "rgba(0, 0, 0, 0.58)"
  tag-glass: "rgba(0, 0, 0, 0.45)"
  card-shadow: "rgba(0, 0, 0, 0.08)"
typography:
  large-title:
    fontFamily: "-apple-system, system-ui, SF Pro Display, sans-serif"
    fontSize: "34px"
    fontWeight: 700
  section-title:
    fontFamily: "-apple-system, system-ui, SF Pro Display, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  feature-title:
    fontFamily: "-apple-system, system-ui, SF Pro Display, sans-serif"
    fontSize: "22px"
    fontWeight: 700
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
  field: "10px"
  list-inset: "16px"
  thumb: "16px"
  button: "16px"
  feature-card: "24px"
  main-button: "28px"
  pill: "9999px"
spacing:
  gutter: "16px"
  chip-gap: "8px"
  stack: "10px"
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
| `--ck-error` | `#d93025` | Field errors |

## Typography

- **Font:** iPhone system font (SF Pro) everywhere. Weights 400 / 500 / 600 / 700.
- **Icons:** Lucide (`lucide-react`), 22px in navigation bars, 24px in the tab bar, 2px stroke. Framework7's built-in glyphs (back chevron, list chevrons, checkmarks, search magnifier) stay as they are.
- **Light mode only for now.** A dark version can be added later by redefining the tokens.
- **Contrast (checked with Impeccable):** white on Tomato is 3.7:1, so the main button label is 19px bold (WCAG "large text"). Any Tomato *text* uses Tomato ink (4.6:1 on the grey page). Muted grey is 4.6:1 on the grey page.

## Components

Where each component's shape comes from:

| Component | Source | Shape |
|---|---|---|
| Background, titles | RED (Xiaohongshu) | Grey page, white content, soft near-black text, no shadows |
| Search bar | RED | White pill on the grey page, 38–40px tall, leading magnifier |
| Filter chips | Starbucks | Full pill, white with a 1px border, 600 weight. Active = filled `--ck-fg` with white text |
| Featured recipe card | Headspace | Photo card, 24px corners, ~200px tall, dark gradient from the bottom, small dark see-through tag pill, 22px bold white title, soft shadow |
| Recipe list | Pinterest | No dividers, 64px photo thumbnails with 16px corners, 600-weight title, muted meta line |
| Servings stepper and ×½–×3 | Pinterest | Soft-filled round buttons; segmented control with a dark active segment |
| Ingredients | Instacart | Light hairline rows, round check that fills Tomato, bold amount + regular name, muted note |
| Main button | DoorDash | Full-width pill, 52px tall, 28px corners, 19px bold white label, Tomato fill |
| Other buttons | Pinterest | Soft grey fill, 16px corners, 46px tall, 600 weight, dark text |
| Form fields | Instacart | White box, 1px `--ck-strong` border, 10px corners, small label set into the top border (Framework7 "outline" inputs). Focus = `--ck-fg` border, error = red border + red helper text |
| Tab bar | DoorDash | Tomato active tab, muted inactive, 600-weight labels. The bar keeps Framework7's native iOS 26 floating shape |

## Do's and Don'ts

- Never hard-code a color in a component. Use `var(--ck-*)`.
- One accent per screen area: Tomato is for the main action and selection states, not decoration.
- Framework7 still owns layout, motion, gestures, sheets and z-index (see `CLAUDE.md`).
