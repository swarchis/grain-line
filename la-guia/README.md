# Grainline frontend

Setup, architecture, and API docs now live in the [repo root README](../README.md) — this file was drifting out of sync (it still referenced Claude, which was never actually wired up; the app has always used Gemini) so it's been trimmed to avoid two sources of truth.

## Design philosophy

Grainline is meant to feel like a founder's cutting table, not a generic SaaS dashboard.

- **Typography over decoration** — `Newsreader` (serif) for editorial hierarchy, `Karla` for UI text, `Space Mono` for data/numbers, `Caveat` for hand-written-style annotations and section labels
- **Tactile elements** — "washi tape" corner accents, stitched flow connectors between production stages, cut-sticker button style
- **Section color spectrum** — each part of the app (Design, Tech Packs, Vendors, Materials, Sales, etc.) has its own accent color, used for icons/tags/corner-folds rather than one flat brand color everywhere
- **High contrast, warm neutrals** — deep ink tones against a warm parchment background (`#F1EAD9` light mode), not stark white/black
