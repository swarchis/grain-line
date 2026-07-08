---
name: restaurantos-design
description: >
  Premium UI design system for RestaurantOS — a multi-location restaurant management platform.
  Apply this skill whenever building, redesigning, or improving any page, component, or visual
  element in the RestaurantOS platform. Inspired by Emil Ruder's Swiss typographic precision,
  Dieter Rams' functional minimalism, and the visual language of high-end hospitality brands
  (Noma, Eleven Madison Park, Aesop). The result should feel like a tool a Michelin-starred
  restaurant group would be proud to use — rigorous, warm, and quietly exceptional.
---

# RestaurantOS Design System

## Philosophy

> "Typography has one plain duty before it and that is to convey information in writing." — Emil Ruder

The RestaurantOS interface serves working restaurant operators. Every pixel must earn its place.
Design decisions are governed by three principles from Swiss design and premium hospitality:

1. **Typographic hierarchy IS the hierarchy** — size, weight, and rhythm carry meaning. Decoration does not.
2. **Restraint in colour, generosity in space** — one warm accent, deep neutrals, extensive breathing room.
3. **Information before beauty** — but beauty emerges from precision, not embellishment.

---

## Typography

### Typefaces
```
Display / headings:   "Playfair Display" (Google Fonts) — serif, italic for section titles
                      Evokes menus, wine lists, fine print materials
Data / mono:          "JetBrains Mono" — tabular nums, tight, precise
Body / UI:            "Inter" var (variable font) — neutral, readable, modern
                      BUT: use sparingly for body copy only
                      Prefer Playfair Display for anything editorial
```

### Scale (based on Major Third — 1.25 ratio)
```
--text-xs:    11px   monospace labels, timestamps, tags
--text-sm:    13px   table data, secondary info
--text-base:  15px   body copy, form labels
--text-lg:    18px   card titles, section headers
--text-xl:    22px   page subtitles
--text-2xl:   28px   page titles
--text-3xl:   36px   hero numbers (KPIs, totals)
--text-4xl:   48px   display only — dashboard hero
```

### Rules
- Page titles: Playfair Display, italic, --text-2xl, color: var(--ink)
- Section labels: Inter, 10px, 700, UPPERCASE, letter-spacing: 0.12em, color: var(--ink4)
- KPI numbers: JetBrains Mono, --text-3xl, tabular-nums
- Table headers: Inter, 10px, 600, UPPERCASE, letter-spacing: 0.08em
- Body: Inter, --text-base, line-height: 1.65

---

## Colour System

### Core palette — warm neutral foundation
```css
:root {
  /* Backgrounds — layered depth */
  --bg:           #F7F4EF;   /* warm parchment — page background */
  --bg-raised:    #FDFCF9;   /* near-white — card surfaces */
  --bg-sunken:    #EDE9E1;   /* sunken areas, inputs, alternating rows */
  --bg-overlay:   rgba(28, 21, 16, 0.55); /* modal backdrops */

  /* Ink — typographic hierarchy */
  --ink:          #1C1510;   /* near-black — primary text */
  --ink-2:        #3D342C;   /* secondary text */
  --ink-3:        #7A6E65;   /* muted text, placeholders */
  --ink-4:        #B0A89F;   /* very muted — labels, disabled */

  /* Gold — the single warm accent */
  --gold:         #9B6B1A;   /* primary accent — CTAs, active states */
  --gold-light:   #C8922A;   /* hover states */
  --gold-bg:      #FDF5E6;   /* gold tinted backgrounds */
  --gold-border:  rgba(155, 107, 26, 0.25); /* subtle gold borders */

  /* Semantic — minimal, purposeful */
  --green:        #2D6A4F;   /* success, on-target */
  --green-bg:     #EAF5EF;
  --amber:        #92620A;   /* warning, watch */
  --amber-bg:     #FEF7E8;
  --red:          #9B2226;   /* danger, over-target */
  --red-bg:       #FDECEC;
  --blue:         #1E4D8C;   /* info, scheduled */
  --blue-bg:      #EAF0FA;

  /* Borders */
  --border:       rgba(28, 21, 16, 0.09);
  --border-2:     rgba(28, 21, 16, 0.14);
  --border-3:     rgba(28, 21, 16, 0.22);

  /* Shadows */
  --shadow-sm:    0 1px 3px rgba(28,21,16,0.07), 0 1px 2px rgba(28,21,16,0.04);
  --shadow-md:    0 4px 12px rgba(28,21,16,0.08), 0 2px 4px rgba(28,21,16,0.05);
  --shadow-lg:    0 12px 40px rgba(28,21,16,0.12), 0 4px 12px rgba(28,21,16,0.06);
}

/* Dark mode */
[data-theme="dark"] {
  --bg:           #16120E;
  --bg-raised:    #1F1A15;
  --bg-sunken:    #120F0B;
  --ink:          #F0EBE3;
  --ink-2:        #C8BFB5;
  --ink-3:        #7A7068;
  --ink-4:        #4A4440;
  --gold:         #C8922A;
  --gold-light:   #E0AA40;
  --gold-bg:      rgba(200, 146, 42, 0.1);
  --gold-border:  rgba(200, 146, 42, 0.2);
  --border:       rgba(240, 235, 227, 0.07);
  --border-2:     rgba(240, 235, 227, 0.12);
  --border-3:     rgba(240, 235, 227, 0.2);
}
```

---

## Spatial System

### Base unit: 4px
```
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
```

### Layout
```
--sidebar-width:    220px
--topbar-height:    56px
--content-max:      1280px
--content-padding:  32px
--card-padding:     24px
--card-radius:      8px
--input-radius:     6px
--badge-radius:     4px
```

### Grid discipline (Emil Ruder 9-square)
- Content areas use a **12-column grid** with 24px gutters
- Cards align to 4-column (3-up), 6-column (2-up), or 12-column (full)
- Never break the grid for visual "interest" — tension comes from typography
- Use **asymmetry purposefully**: a left-heavy layout with a wide data panel and narrow insight panel (8/4) is more interesting than two equal halves

---

## Component Patterns

### Sidebar
```
Width: 220px
Background: var(--bg-raised)
Border-right: 1px solid var(--border)
Logo: Playfair Display italic, 20px, var(--ink)
Section labels: 9px, 700, UPPERCASE, letter-spacing .12em, var(--ink-4)
Nav items: 13px Inter, var(--ink-3), padding 7px 12px, margin 1px 8px, radius 5px
Active nav: background var(--gold-bg), color var(--gold), border-left 2px solid var(--gold)
Hover: background var(--bg-sunken)
```

### Topbar
```
Height: 56px
Background: var(--bg-raised)
Border-bottom: 1px solid var(--border)
Page title: Playfair Display italic, 22px
Page subtitle: 12px, var(--ink-3)
Separator between title and actions: flex spacer
```

### Cards
```
Background: var(--bg-raised)
Border: 1px solid var(--border)
Border-radius: var(--card-radius)
Box-shadow: var(--shadow-sm)
Padding: var(--card-padding)
Card header: border-bottom 1px solid var(--border), padding-bottom 14px, margin-bottom 18px
Card title: Inter 13px, 600, var(--ink)
Hover state on interactive cards: box-shadow var(--shadow-md), border-color var(--border-2)
```

### Stat cards (KPI blocks)
```
Background: var(--bg-raised)
Border-left: 3px solid var(--gold)  ← the single visual accent
Padding: 18px 20px
Label: 10px, UPPERCASE, letter-spacing .1em, var(--ink-4)
Value: JetBrains Mono, 32px, var(--ink)
Delta: 12px, color semantic (green/amber/red)
```

### Tables
```
Header row: background var(--bg-sunken)
Header text: 10px, 600, UPPERCASE, letter-spacing .08em, var(--ink-3)
Row: border-bottom 1px solid var(--border)
Row hover: background var(--bg-sunken)
Numeric cells: JetBrains Mono, right-aligned
Status badges: 10px, 600, UPPERCASE, letter-spacing .06em, padding 2px 8px, radius 4px
```

### Buttons
```
Primary: background var(--gold), color #FFF8EE, border none, 13px Inter 500
         padding 9px 18px, radius 6px
         hover: background var(--gold-light)
         active: scale(0.98)
Secondary: background transparent, border 1px solid var(--border-2), color var(--ink-2)
           hover: background var(--bg-sunken)
Danger: background var(--red-bg), border 1px solid rgba(155,34,38,.2), color var(--red)
Small: padding 5px 12px, font-size 12px
```

### Form inputs
```
Background: var(--bg-sunken)
Border: 1px solid var(--border-2)
Border-radius: var(--input-radius)
Padding: 9px 12px
Font: Inter 13px var(--ink)
Focus: border-color var(--gold), outline none, box-shadow 0 0 0 3px rgba(155,107,26,.1)
Placeholder: var(--ink-4)
```

### Tab bar
```
Border-bottom: 2px solid var(--border)
Tab item: 13px Inter, var(--ink-3), padding 10px 16px, no background
Tab active: color var(--gold), border-bottom 2px solid var(--gold), margin-bottom -2px
Tab hover: color var(--ink-2)
```

### Modals
```
Backdrop: var(--bg-overlay) with backdrop-filter blur(4px)
Panel: var(--bg-raised), shadow-lg, radius 12px, border 1px solid var(--border)
Header: padding 20px 24px, border-bottom, Playfair Display italic 20px
Body: padding 20px 24px
Max-width: 560px (sm), 720px (md), 900px (lg)
Close button: top-right, 24px, var(--ink-3)
```

### Alerts / banners
```
Base: padding 12px 16px, radius 6px, display flex, gap 10px, font-size 13px
Info:    background var(--blue-bg),  border-left 3px solid var(--blue),  color var(--blue)
Success: background var(--green-bg), border-left 3px solid var(--green), color var(--green)
Warning: background var(--amber-bg), border-left 3px solid var(--amber), color var(--amber)
Danger:  background var(--red-bg),   border-left 3px solid var(--red),   color var(--red)
Gold:    background var(--gold-bg),  border-left 3px solid var(--gold),  color var(--gold)
```

### Empty states
```
Container: text-align center, padding 60px 20px
Icon: 40px, var(--ink-4), margin-bottom 16px
Title: Playfair Display italic, 20px, var(--ink)
Subtitle: 14px, var(--ink-3), margin-bottom 24px
```

---

## Motion

Keep animations minimal and purposeful. No decorative animation.

```css
/* Standard transition — apply to all interactive elements */
transition: background-color 0.12s ease, border-color 0.12s ease,
            color 0.12s ease, box-shadow 0.15s ease, transform 0.1s ease;

/* Page content fade-in */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.content { animation: fadeUp 0.2s ease; }

/* Loading spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--border-2);
  border-top-color: var(--gold);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* Toast */
@keyframes toastIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## Icons

Use **Phosphor Icons** (phosphoricons.com) — available via CDN.
- Weight: `regular` for UI, `bold` for emphasis, `duotone` for feature icons
- Size: 16px inline UI, 20px actions, 24px feature icons, 32px empty states
- Import: `<script src="https://unpkg.com/@phosphor-icons/web"></script>`
- Usage: `<i class="ph ph-invoice"></i>` or `<i class="ph-bold ph-plus"></i>`

Never use emoji as UI icons. Use Phosphor only.

---

## Page Layout Template

```
┌─────────────────────────────────────────────────────────┐
│  SIDEBAR (220px fixed)  │  MAIN CONTENT (flex: 1)        │
│  ┌──────────────────┐   │  ┌───────────────────────────┐ │
│  │ RestaurantOS     │   │  │ TOPBAR (56px)             │ │
│  │ ─────────────    │   │  │ [Title]    [Location] [CTA]│ │
│  │ OVERVIEW         │   │  └───────────────────────────┘ │
│  │  ◈ Dashboard     │   │  ┌───────────────────────────┐ │
│  │ AGENTS           │   │  │ TAB BAR                   │ │
│  │  📊 Financial    │   │  └───────────────────────────┘ │
│  │  📄 Inventory    │   │  ┌───────────────────────────┐ │
│  │  ⭐ Reviews      │   │  │ CONTENT (padding 32px)    │ │
│  │  ...             │   │  │                           │ │
│  │ ADMIN            │   │  │  [Stat cards 4-up]        │ │
│  │  👥 Team         │   │  │  [Main content area]      │ │
│  │  ⚙ Settings      │   │  │                           │ │
│  │ ─────────────    │   │  └───────────────────────────┘ │
│  │ [User + logout]  │   │                                 │
│  └──────────────────┘   │                                 │
└─────────────────────────────────────────────────────────┘
```

---

## Design Anti-Patterns to AVOID

- ❌ Purple gradients, neon accents, glassmorphism
- ❌ Rounded corners >12px on cards (pill shapes on data cards look toyish)
- ❌ Shadows on every element (reserve for modals and elevated cards only)
- ❌ Striped table rows (use hover state instead)
- ❌ Icon + text in every button (icons alone or text alone; mixing clutters)
- ❌ Multiple font families (Playfair for display, Inter for UI, JetBrains Mono for data — that's it)
- ❌ Color overload — one accent (gold), three semantic (green/amber/red), one info (blue)
- ❌ Centred body text in cards — always left-align data
- ❌ Borders on BOTH sides of a separator — one border or a background change, not both
- ❌ Dense padding on mobile-style compact cards — this is a desktop management tool, use generous spacing

---

## Reference: Premium Hospitality UI Touchstones

When in doubt, ask: "Would this feel at home in the digital presence of Noma, Eleven Madison Park, or Aesop?"

These brands share:
- Restrained colour (never more than 2 colours active at once)
- Typography as the primary design element
- Generous white space that signals confidence
- Details that reward close inspection (micro-typography, precise alignment)
- Nothing that shouts — everything that whispers quality

The RestaurantOS interface should feel like the back-office tool those restaurants would build for themselves.
