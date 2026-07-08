---
name: impeccable-design
description: >
  A skill for producing UI with the kind of design quality that stops people mid-scroll.
  Not beautiful in a generic way — specific, considered, and unmistakably intentional.
  Apply whenever the bar is "exceptional" not just "good". Draws from Dieter Rams,
  Massimo Vignelli, Jonathan Ive, Pentagram, A2-TYPE, and Studio Dumbar.
  Triggers on: "impeccable", "world-class", "redesign", "make it beautiful", "premium",
  "start again", "new design".
---

# Impeccable Design

## What separates impeccable from good

Good design is correct. Impeccable design is **inevitable** —
when you look at it, you cannot imagine it any other way.

The difference lives in five disciplines:

---

## 1. Commit to a position before touching code

Answer these three before any pixel:

**A. What is the single dominant feeling?**
Not "professional" — that is a category, not a feeling.
Choose one: austere / warm / surgical / generous / weighty / airy / precise / lush / confrontational / serene

**B. What is the one typographic rule that governs everything?**
Example: "All hierarchy is expressed through scale and spacing alone — never through weight or colour."
Example: "One typeface, infinite weights. No serifs. Numbers always mono."

**C. What is forbidden?**
Example: "No rounded corners above 6px. No more than two colours active at once. No decorative elements."
Write the constraints down. Every decision flows from them.

---

## 2. Typography as architecture

Type is not decoration. It is load-bearing structure.

- **One serif + one grotesque maximum.** Preferably one typeface total.
- **Scale is drama.** The jump between smallest and largest should feel almost uncomfortable.
- **Rhythm over size.** A consistent baseline grid (4px or 8px) matters more than a beautiful typeface.
- **Negative space is content.** Generous margins communicate quality before the user reads a word.
- **Size + spacing first.** Weight only reinforces — never substitutes.
- **Numbers always tabular.** `font-variant-numeric: tabular-nums` in every data context.

---

## 3. Colour as signal, never decoration

The fewer colours, the more each means.

```
1 dominant neutral     — the field (near-black or near-white)
1 accent               — used for exactly ONE semantic purpose
3 semantic             — success / warning / error, feedback only
```

If you feel the urge to add a fourth colour, **remove one instead.**

Test every colour decision: *"What information does this colour carry?"*
If the answer is "it looks nice" — remove it.

---

## 4. Every interaction state designed

Default → Hover → Active → Focused → Disabled → Loading → Error → Success

- Transitions: **100–150ms**. Faster feels broken. Slower feels sluggish.
- Easing: `ease-out` for entering. `ease-in` for leaving. `ease-in-out` for repositioning.
- The hover state is the **first impression of quality**. It communicates craft before the user clicks.

---

## 5. Constraint as creative engine

```
MAX 2 typefaces in the entire product
MAX 1 accent colour
MAX 4 font sizes active on any one screen
MAX 3 levels of visual hierarchy per component
ZERO decorative borders (every border must separate content groups)
ZERO shadows on flat elements (shadows for elevation only)
ZERO gradients unless encoding information
```

---

## The Impeccable Audit

Before calling any design done, every "no" is a task:

### Typography
- [ ] Is hierarchy legible in 3 seconds without reading?
- [ ] Is every font size serving a distinct semantic purpose?
- [ ] Are numbers tabular where they appear alongside other numbers?
- [ ] Is there a consistent vertical rhythm?

### Colour
- [ ] Does it work in greyscale? (If no, colour is doing structural work it shouldn't)
- [ ] Is the accent used for exactly one purpose?
- [ ] Do all text/background combinations pass WCAG AA (4.5:1)?

### Spacing
- [ ] Is every spacing value a multiple of 4px?
- [ ] Is there more space above headings than below? (Proximity principle)
- [ ] Do margins feel generous, not cramped?

### Interaction
- [ ] Does every interactive element have a visible hover state?
- [ ] Are transitions smooth at 100–150ms?
- [ ] Does the primary action stand out without being aggressive?

### Coherence
- [ ] Could you remove any element and the design would be worse?
  If you can remove it and it's fine — **remove it**.
- [ ] Does the design feel inevitable?

---

## Reference designers

**Dieter Rams** — Less, but better. Good design is honest.
**Massimo Vignelli** — Discipline with a limited typeface palette creates infinite variety.
**Jonathan Ive** — The best design is invisible. Material honesty: every visual cue should correspond to something real.
**Josef Müller-Brockmann** — The grid is not a cage. It is freedom to design.
**Jan Tschichold** — Asymmetric typography is more vital, varied, and tense.
