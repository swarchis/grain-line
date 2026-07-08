---
name: taste
description: >
  A skill encoding the editorial sensibility and aesthetic judgment that separates
  design with taste from design that is merely correct. Apply when making decisions
  about what to show vs. hide, how to frame information, what tone to strike, and
  which reference points to draw from. Taste is not style — it is judgment.
  Triggers on: "redesign", "make it feel right", "it feels off", "too generic",
  "start again", "new design", "what would look best".
---

# Taste

> "Taste is the only morality." — John Ruskin
> "Style is knowing who you are, what you want to say, and not giving a damn." — Gore Vidal

Taste is not a set of rules. It is a set of questions.

---

## The questions taste asks

Before any design decision, ask:

**Is this honest?**
Does every visual element correspond to something real? Or is it theatre —
adding the appearance of quality without the substance?
A shadow implies elevation. A border implies separation. A colour implies meaning.
If none of those are true, remove the element.

**Is this specific?**
Generic design tries to please everyone and pleases no one.
Design with taste takes a position.
"We are a restaurant management platform used by ambitious operators who run serious kitchens."
That position should be visible in every font choice, every spacing decision, every word of UI copy.

**Is this quiet enough?**
Loud design shouts for attention. Tasteful design commands it.
The most confident interfaces have almost nothing going on — until you look closely.
Then every detail is deliberate.

**Would this embarrass me in five years?**
Trends are the enemy of taste. Glassmorphism, neumorphism, gradient mesh backgrounds —
these are trend, not taste. Ask: does this reference something timeless, or something current?
Timeless: Swiss grid. Timeless: Helvetica. Timeless: high-contrast type on white.
Trend: frosted glass. Trend: aurora gradients. Trend: brutalist revival (already peaked).

**What would the best version of this look like?**
Not the best version given the constraints — the best version, full stop.
Then work backwards to what is achievable.
The aspiration shapes every compromise.

---

## What taste looks like in practice

### In typography
Taste chooses one typeface and uses it with extraordinary precision
rather than two typefaces used carelessly.

Taste knows that negative space around type is more valuable than any font.
A heading at 48px with 80px of breathing room above it
communicates more authority than a heading at 64px crammed against the nav.

Taste uses contrast — a 12px label next to a 40px number — not to show off,
but because that contrast is doing real communicative work.

### In colour
Taste is suspicious of colour.
Every colour added is a commitment to use it consistently,
a new thing the user must learn, a new way things can go wrong.

The most tasteful palettes are almost monochromatic.
One warm neutral for the field.
One dark neutral for text.
One accent — not to decorate, but to orient.

Taste knows that warm neutrals (parchment, cream, off-white) communicate
differently from cool neutrals (grey, slate, cool white).
Warm says: welcome, considered, human.
Cool says: precise, clinical, efficient.
Neither is wrong. Both are positions. Pick one and hold it.

### In layout
Taste is asymmetric.
Symmetric layouts feel like clip art.
The most beautiful layouts are weighted — heavier on one side,
with the visual tension resolved by generous negative space.

Taste uses a grid not to align things to each other
but to create the underlying rhythm that makes everything feel right
even when the user can't articulate why.

Taste knows when to break the grid.
A rule exists to be broken exactly once, deliberately, for effect.
Breaking it twice is accident. Breaking it once is design.

### In interaction
Taste is felt before it is seen.
A 120ms transition on a button hover is barely perceptible.
But its absence is immediately felt.

Taste never animates for decoration.
Animation is reserved for: state changes that need narrating,
elements that enter from somewhere and should seem to have come from somewhere,
feedback that confirms an action happened.

Everything else is still.

### In copy
UI copy is design.
"Submit" is a placeholder. "Save changes" is design.
"Error" is a placeholder. "We couldn't save that — try again" is design.
"Loading…" is a placeholder. "Scanning invoice…" is design.

Taste writes copy that sounds like a person wrote it.
Confident, specific, not trying too hard.

---

## Reference touchstones for RestaurantOS specifically

These are the brands and objects whose visual language should inform decisions:

**Monocle magazine** — editorial clarity, confident typography, nothing decorative
**Aesop** — warm neutrals, generous space, copy that doesn't shout
**Muji** — function is form, restraint is the aesthetic
**The Kin (hotel brand)** — modern hospitality, not stuffy, not minimal to the point of coldness
**Stripe Dashboard** — the gold standard for data-dense SaaS: readable at high density, never cluttered
**Linear** — speed, confidence, dark mode done right, micro-interactions with purpose
**Notion** — calm surfaces, type doing all the work, nothing decorative

**Anti-references** — what RestaurantOS should NOT look like:
- Toast POS (generic, safety-first, forgettable)
- Most restaurant software (clip art icons, blue gradients, trying too hard to look "food-y")
- Generic SaaS (Segoe UI, purple, 8px rounded corners everywhere)

---

## The taste test

Before shipping any screen, ask:
1. Would a designer at Stripe be embarrassed by this?
2. Does it look like it was made for *this* product, or could it be any SaaS?
3. Is there anything on screen that isn't earning its place?
4. Does the visual language match the ambition of the operators using it?

If Vikram Madan is running some of the most ambitious Indian restaurants in the US,
the software he uses every day should feel worthy of that ambition.
Not flashy. Not trying to impress. Just unmistakably well made.
