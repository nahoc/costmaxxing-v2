---
name: costmaxxing
description: The landing page as a 1984 one-bit desktop, where a team's Claude bill is a window and the subsidy is a system alert.
colors:
  screen-ink: "#000000"
  screen-paper: "#ffffff"
typography:
  display:
    fontFamily: "Jersey 15, Chicago, ui-monospace, monospace"
    fontSize: "clamp(52px, min(5.2vw, 8.8svh), 82px)"
    fontWeight: 400
    lineHeight: 0.92
  headline:
    fontFamily: "Jersey 15, Chicago, ui-monospace, monospace"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 0.95
  title:
    fontFamily: "Jersey 15, Chicago, ui-monospace, monospace"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1
  body:
    fontFamily: "Geist Pixel, Geneva, ui-monospace, monospace"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Geist Pixel, Geneva, ui-monospace, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  screen: "14px"
  button: "12px"
  button-big: "16px"
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
    height: "44px"
    padding: "0 22px"
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

# Design System: costmaxxing

## Overview

**Creative North Star: "The Subsidy Desktop"**

The page is a working 1984 one-bit desktop. Every surface is pure black or pure white pixels. Everything else, from the desktop field to share-bar tracks to the zebra on overspend, is an ordered dither drawn from tiny pixel tiles. Content lives in windows with close boxes, striped title bars, status bars, and size boxes. Actions are buttons and menus that behave the way the era's software did. A Team Owner should recognize the bill as a document and the subsidy as an alert, so the world carries the argument instead of decorating it.

Density follows the desktop. The first screen overlaps windows like a real desk in use. The scroll continues across a second, calmer desktop of reference windows, then ends on a black shutdown screen with one dialog. Motion is stepped, never eased: zoom outlines, a paint-in reveal, and a one-frame menu-bar flash.

**Key Characteristics:**
- Pure black and white, with every gray made by dithering
- Bitmap type, with Jersey 15 for chrome and display and Geist Pixel for reading
- Windows, alerts, icons, and menus as the only containers
- Stepped motion that settles on whole pixels
- Public-domain photography converted to one bit with Atkinson dithering

## Colors

Two values, no exceptions. Tone comes from pattern, not from color.

### Neutral
- **Screen Ink** (#000000): all text, chrome lines, icons, shadows, the pressed button, the selected menu item, the shutdown field.
- **Screen Paper** (#ffffff): window interiors, menu bar, button faces, icon labels.

### Named Rules
**The One-Bit Rule.** No color and no flat gray, anywhere. A gray tone is a dither tile: 50% checker for the desktop, 25% stipple for tracks and hover, horizontal stripes for the active title bar, and 45° zebra for usage above the seat price.

**The Invert Rule.** Selection, pressing, and the open menu title all invert to Screen Ink with Screen Paper text. Nothing else signals state.

## Typography

**Display Font:** Jersey 15 (with Chicago and the system monospace as fallbacks)
**Body Font:** Geist Pixel (with Geneva and the system monospace as fallbacks)

**Character:** A bold, compact bitmap face for everything the system speaks (titles, menus, buttons, headlines) over a thin bitmap face for everything people read. The pairing mirrors the era's Chicago and Geneva split.

### Hierarchy
- **Display** (400, clamp(52px, min(5.2vw, 8.8svh), 82px), 0.92): the one headline in the Read Me window.
- **Headline** (400, 40px, 0.95): alert and shutdown dialog questions. Figures in the Team Bill run at 64px in the same face.
- **Title** (400, 26px, 1): title bars, menu bar, buttons, table heads at 22px.
- **Body** (400, 18px to 21px, 1.4 to 1.45): window copy, about 34em at most.
- **Label** (400, 15px to 16px): status bars, captions, icon labels, the people table.

### Named Rules
**The Self-Hosted Bitmap Rule.** Both faces ship from `site/static/fonts/` with their OFL licenses. The page never asks a font service for them.

## Layout

At 1100px and wider, each desktop is a positioned field. Windows sit at fixed offsets as a share of the width, overlap on purpose, and keep a strict stacking order: Strand plate, then Team Bill, then Read Me, then the alert on top. The icon column runs down the right edge. The alert's height follows the viewport (`clamp(480px, calc(100svh - 340px), 600px)`) so it never covers the headline and never drops below the fold. The second desktop is 1040px tall, and its windows drift on separate planes while scrolling, snapped to 2px. Below 1100px the windows stack in one column with 12px side margins, alternate a 6px offset, drop the icons, and put the alert directly after the Read Me.

The pixel unit is 2px: line weights, dither cells, drag snapping, and parallax offsets are all multiples of it.

## Elevation & Depth

Depth comes from overlap and one hard shadow, never from blur. A window casts a 2px solid ink shadow to the lower right. The alert and the shutdown dialog stack inset rings for a double frame. Stacking order changes only when someone clicks a window, which brings it to the front and stripes its title bar.

### Shadow Vocabulary
- **Window shadow** (`box-shadow: 2px 2px 0 #000`): every window, menu, and the boot dialog.
- **Default button ring** (`box-shadow: 0 0 0 4px #fff, 0 0 0 8px #000`): the one default action in a dialog.
- **Dialog frame** (`box-shadow: inset 0 0 0 4px #fff, inset 0 0 0 6px #000, 2px 2px 0 #000` with a 4px ink border): the alert. The shutdown box adds a third inset ring.

### Named Rules
**The Era Shadow Rule.** A hard offset shadow is native to this desktop and belongs only to windows, menus, and dialogs. It is never a decoration on text or icons.

## Shapes

Square everywhere except buttons, which carry gently rounded corners (12px, 16px for the large dialog button), and the screen's top corners (14px), which round like a CRT bezel. Borders are 2px ink. Icons are authored pixel bitmaps on a 24-pixel grid rendered at 48px with crisp edges.

## Components

### Buttons
- **Shape:** gently rounded (12px), 2px ink border, 44px tall.
- **Default:** the dialog's primary action wears the outer ring from the shadow vocabulary. There is one per dialog.
- **Hover / Pressed:** hover fills with the 25% stipple. Pressed inverts to ink with paper text.
- **Big:** the shutdown dialog's button grows to 64px tall with 40px type.

### Windows
- **Title bar:** 38px, centered title on a paper plate, close box at left. The active window alone gets horizontal stripes and a visible close box.
- **Body:** 24px by 28px inset.
- **Status bar:** label type, items spread apart, a size box in the corner.
- **Behavior:** opens with zoom outlines from its icon, drags with a dashed outline that snaps to 2px, and closes back to its icon.

### Navigation
- **Menu bar:** 40px, paper, sticky. Titles invert while open. Menus are paper boxes with the window shadow, and items invert on hover and focus. On phones, the bar keeps its menus and adds an install link at the right.

### Alert (signature component)
The system alert carries the page's one question and its one action: a pixel bomb icon, a headline-size question, a line of body copy, and right-aligned buttons with the install button as the default. It can be dismissed with Not Now and reopened from Special, Empty Subsidy….

### Get Info
Any figure in the Team Bill opens an Info window beside it that states the exact amount, its source, and its math. Escape or the close box sends it back into the figure.

## Do's and Don'ts

### Do:
- **Do** compute every number on the page with costmaxxing's own core, and label example data as an example.
- **Do** draw new grays as dither tiles on the 2px pixel unit.
- **Do** keep stepped motion settled for reduced motion, which shows the finished desktop with no boot.
- **Do** convert any new photograph to one bit with `site/scripts/dither.ts` and embed its origin.

### Don't:
- **Don't** introduce color, flat gray, gradients, blur, or soft shadows.
- **Don't** use easing curves; motion steps in whole frames.
- **Don't** place more than one default-ring button on a screen.
- **Don't** load fonts or images from third-party hosts.
