---
name: openmaxxing
description: The landing page as a 1984 two-color desktop, where a team's Claude bill is a window and the savings question is a system dialog.
colors:
  screen-ink: "#2e1065"
  screen-paper: "#ffffff"
typography:
  display:
    fontFamily: "Jersey 15, Chicago, ui-monospace, monospace"
    fontSize: "clamp(46px, min(4.6vw, 8svh), 75px)"
    fontWeight: 400
    lineHeight: 0.92
  title:
    fontFamily: "Jersey 15, Chicago, ui-monospace, monospace"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1
  body:
    fontFamily: "Geist Pixel, Geneva, ui-monospace, monospace"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  screen: "14px"
  button: "12px"
spacing:
  pixel: "2px"
  window-inset: "24px"
  desk-gap: "22px"
components:
  button:
    backgroundColor: "{colors.screen-paper}"
    textColor: "{colors.screen-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.button}"
    height: "48px"
    padding: "0 24px"
  button-pressed:
    backgroundColor: "{colors.screen-ink}"
    textColor: "{colors.screen-paper}"
  window:
    backgroundColor: "{colors.screen-paper}"
    textColor: "{colors.screen-ink}"
    padding: "24px 28px"
  menu-item-active:
    backgroundColor: "{colors.screen-ink}"
    textColor: "{colors.screen-paper}"
---

# Design System: openmaxxing

## Overview

**Creative North Star: "The Subsidy Desktop"**

The page is a working 1984 desktop drawn in two colors: dark purple ink on white. Everything between them, from the desktop field to share-bar tracks to the zebra on overspend, is an ordered dither drawn from tiny pixel tiles. Content lives in windows with close boxes, striped title bars, status bars, and size boxes. Actions are buttons and menus that behave the way the era's software did. A Team Owner should recognize the bill as a document and the savings question as a system dialog, so the world carries the argument instead of decorating it.

The first screen opens only what matters most: the savings question with its install button, and the example Team Bill that answers it. Everything else waits behind desktop icons or further down the page. The scroll continues across a calmer desktop of reference windows and ends on a purple shutdown screen with one dialog. Motion is stepped, never eased: zoom outlines, a paint-in reveal, and a one-frame menu-bar flash.

**Key Characteristics:**
- Two colors only, dark purple and white, with every middle tone made by dithering
- Bitmap type, with Jersey 15 for chrome and display and Geist Pixel for reading
- Windows, alerts, icons, and menus as the only containers
- Stepped motion that settles on whole pixels
- Public-domain photography converted to two colors with Atkinson dithering
- Three type sizes for the whole page

The landing page and the extension's report share one world. `world/` holds the fonts, the pixel icons, and `world.css` (tokens, windows, dialogs, buttons, menus, meters); each surface adds only its own stylesheet.

## Colors

Two values, no exceptions. Tone comes from pattern, not from a third color.

### Primary
- **Screen Ink** (#2e1065): a dark purple for all text, chrome lines, icons, shadows, the pressed button, the selected menu item, and the shutdown field.

### Neutral
- **Screen Paper** (#ffffff): window interiors, menu bar, button faces, icon labels.

### Named Rules
**The Two-Color Rule.** No third color and no flat tint, anywhere. A middle tone is a dither tile: 50% checker for the desktop, 25% stipple for tracks and hover, horizontal stripes for the active title bar, and 45° zebra for usage above the seat price.

**The Invert Rule.** Selection, pressing, and the open menu title all invert to Screen Ink with Screen Paper text. Nothing else signals state.

## Typography

**Display Font:** Jersey 15 (with Chicago and the system monospace as fallbacks)
**Body Font:** Geist Pixel (with Geneva and the system monospace as fallbacks)

**Character:** A bold, compact bitmap face for everything the system speaks (titles, menus, buttons, headlines) over a thin bitmap face for everything people read. The pairing mirrors the era's Chicago and Geneva split.

### Hierarchy
- **Display** (400, clamp(46px, min(4.6vw, 8svh), 75px), 0.92; clamp(38px, 10vw, 60px) under 1100px): the savings question, the shutdown question, and the yearly savings figure.
- **Title** (400, 30px, 1): title bars, menu bar, buttons, smaller figures, list names, provider names.
- **Body** (400, 18px, 1.45): everything people read, plus status bars, captions, tables, and icon labels. Table heads use the display face at this size.

### Named Rules
**The Three Sizes Rule.** The page uses exactly three font sizes: 18px, 30px, and the display clamp. A new element picks one of them.

**The Self-Hosted Bitmap Rule.** Both faces ship from `site/static/fonts/` with their OFL licenses. The page never asks a font service for them.

## Layout

At 1100px and wider, each desktop is a positioned field with windows at fixed offsets as a share of the width. The first desktop opens two things only: the savings dialog, vertically centered on the left (4% from the edge, up to 760px wide), and the Team Bill on the right (from 59%, up to 440px wide). They do not overlap. The Wall Street window starts closed and opens from its icon. The icon column runs down the right edge. The second desktop is 1780px tall and holds The Subsidy and Benchmarks first, then How It Works, Providers, and Info. Below 1100px the windows stack in one column with 12px side margins and the icons drop away.

The pixel unit is 2px: line weights, dither cells, and drag snapping are all multiples of it. Nothing moves on scroll.

## Elevation & Depth

Depth comes from overlap and one hard shadow, never from blur. A window casts a 2px solid ink shadow to the lower right. The alert and the shutdown dialog stack inset rings for a double frame. Stacking order changes only when someone clicks a window, which brings it to the front and stripes its title bar.

### Shadow Vocabulary
- **Window shadow** (`box-shadow: 2px 2px 0 #2e1065`): every window, menu, and the boot dialog.
- **Default button ring** (`box-shadow: 0 0 0 4px #fff, 0 0 0 8px #2e1065`): the one default action in a dialog.
- **Dialog frame** (`box-shadow: inset 0 0 0 4px #fff, inset 0 0 0 6px #2e1065, 2px 2px 0 #2e1065` with a 4px ink border): the savings dialog. The shutdown box adds a third inset ring.

### Named Rules
**The Era Shadow Rule.** A hard offset shadow is native to this desktop and belongs only to windows, menus, and dialogs. It is never a decoration on text or icons.

## Shapes

Square everywhere except buttons, which carry gently rounded corners (12px), and the screen's top corners (14px), which round like a CRT bezel. Borders are 2px ink. Icons are authored pixel bitmaps on a 24-pixel grid, defined once as SVG symbols and rendered at 48px with crisp edges.

## Components

### Buttons
- **Shape:** gently rounded (12px), 2px ink border, 48px tall, title size.
- **Default:** the dialog's primary action wears the outer ring from the shadow vocabulary. There is one per dialog.
- **Hover / Pressed:** hover fills with the 25% stipple. Pressed inverts to ink with paper text.

### Windows
- **Title bar:** 42px, centered title on a paper plate, close box at left. The active window alone gets horizontal stripes and a visible close box.
- **Body:** 24px by 28px inset.
- **Status bar:** label type, items spread apart, a size box in the corner.
- **Behavior:** opens with zoom outlines from its icon, drags with a dashed outline that snaps to 2px, and closes back to its icon.

### Navigation
- **Menu bar:** 44px, paper, sticky. The left side holds the logo menu (About) and File only. The right side holds a GitHub link to the repository, plus an install link on phones. Titles and links invert while open or hovered. Menus are paper boxes with the window shadow, and items invert on hover and focus.

### Savings dialog (signature component)
The system dialog carries the page's one question and its one action: the openmaxxing computer icon, the display-size question "How much can your team save by moving from Anthropic to open-weight models?", body copy, and the install button, right-aligned with the default ring. It has no secondary button.

### App icon
A compact computer whose screen charts the API price as a zebra-striped bar against two shorter solid bars for the open-weight prices. `world/app-icon.ts` draws it on three grids: 16 for the toolbar and favicon, 24 for the extension page and the site's dialog, and 64 (at 2×, 96px of artwork inside 128) for the store. `site/scripts/app-icon.ts` writes every PNG.

### Get Info
Any figure in the Team Bill or the report opens an Info window beside it that states the exact amount, its source, and its math. Escape or the close box sends it back into the figure.

### Report memo (extension)
The report tab is one document window on the checker desktop, titled with the org name and period, with a word-processor ruler under the title bar. It reads as a memo: the yearly savings as a display-size sentence, the seat subsidy as a sentence, three figures in a ruled row, then People, Products and models, Providers, and Forecast and method. Each section opens with a one-sentence finding and sits below a 4px dithered page-break rule. It closes on "What will you do when the subsidies end?" with Download CSV as the default button. The toolbar popup shows the same opening paragraph and figures, with Open Full Report as the default button.

### Sheet
Report tables: display-face headers over a 2px rule, dotted 2px rules between rows, numbers right-aligned in tabular figures. Bars are meters; a person's usage bar is solid up to their seat price and zebra past it. Bars drop below 860px.

### Progress dialog
Every non-report state is a system alert. Loading names each real step of the fetch above a dithered progress bar that advances in four steps, and the cursor becomes a wristwatch. Signed out, not an Owner, and failed requests use the caution icon, name the problem, and offer the recovery as the default button.

## Do's and Don'ts

### Do:
- **Do** compute every number on the page with openmaxxing's own core, and label example data as an example.
- **Do** draw new grays as dither tiles on the 2px pixel unit.
- **Do** keep stepped motion settled for reduced motion, which shows the finished desktop with no boot.
- **Do** convert any new photograph to the two colors with `site/scripts/dither.ts` and embed its origin.
- **Do** open only the most important windows on first view; everything else waits behind an icon.

### Don't:
- **Don't** introduce a third color, flat tints, gradients, blur, or soft shadows.
- **Don't** move anything on scroll.
- **Don't** use easing curves; motion steps in whole frames.
- **Don't** place more than one default-ring button on a screen.
- **Don't** load fonts or images from third-party hosts.
