# Cookbook design system

Chosen in the Mix & match sticker sheet (Nov 2026). Each component keeps the **shape** (corners, sizes, spacing, type weight) of the design system it came from, and **all colors and the font come from one shared theme** below.

Implementation: `src/theme/cookbook.css` (tokens and Framework7 variable mapping) plus a few small components in `src/components/ui/`. Check everything visually on the in-app **Settings → Style Guide** page.

## Theme

| Token | Value | Use |
|---|---|---|
| `--ck-bg` | `#f5f5f5` | Page background (Cool grey, from RED) |
| `--ck-surface` | `#ffffff` | Cards, fields, search bar, lists that sit on the background |
| `--ck-soft` | `#ececee` | Filled buttons, stepper buttons, segmented track |
| `--ck-fg` | `#262628` | Main text, active chip and segment |
| `--ck-fg2` | `#55555a` | Secondary text |
| `--ck-muted` | `#86868c` | Meta text, placeholders, inactive tabs |
| `--ck-line` | `#e6e6e9` | Hairlines between rows |
| `--ck-strong` | `#c9c9ce` | Field and chip borders |
| `--ck-accent` | `#e4572e` | **Tomato.** Main button, links, checked ingredients, active tab, badges |
| `--ck-accent-press` | `#c9461f` | Pressed main button |
| `--ck-error` | `#d93025` | Field errors |

- **Font:** iPhone system font (SF Pro) everywhere. Weights 400 / 500 / 600 / 700.
- **Light mode only for now.** A dark version can be added later by redefining the tokens.
- **Contrast note:** white text on Tomato is about 3.6:1. It is fine for the bold 16px main button label, but not for small text. Small text on Tomato should stay dark, or the button color can be deepened slightly.

## Components (and where each one's shape comes from)

| Component | Source | Shape |
|---|---|---|
| Background, titles | RED (Xiaohongshu) | Grey page, white content, soft near-black text, no shadows |
| Search bar | RED | White pill on the grey page, 38–40px tall, leading magnifier |
| Filter chips | Starbucks | Full pill, white with a 1px border, 600 weight. Active = filled `--ck-fg` with white text |
| Featured recipe card | Headspace | Photo card, 24px corners, ~200px tall, dark gradient from the bottom, small frosted tag pill, 22px bold white title, soft shadow |
| Recipe list | Pinterest | No dividers, 64px photo thumbnails with 16px corners, 600-weight title, muted meta line |
| Servings stepper and ×½–×3 | Pinterest | Soft-filled round buttons; segmented control with a dark active segment |
| Ingredients | Instacart | Light hairline rows, round check that fills Tomato, bold amount + regular name, muted note |
| Main button | DoorDash | Full-width pill, 52px tall, 28px corners, 16px bold, Tomato |
| Other buttons | Pinterest | Soft grey fill, 16px corners, 46px tall, 600 weight, dark text |
| Form fields | Instacart | White box, 1px `--ck-strong` border, 10px corners, small label set into the top border (Framework7 "outline" inputs). Focus = `--ck-fg` border, error = red border + red helper text |
| Tab bar | DoorDash | Tomato active tab, muted inactive, 600-weight labels. The bar keeps Framework7's native iOS 26 floating shape |

## Rules

- Never hard-code a color in a component. Use `var(--ck-*)`.
- One accent per screen area: Tomato is for the main action and selection states, not decoration.
- Framework7 still owns layout, motion, gestures, sheets and z-index (see `CLAUDE.md`).
