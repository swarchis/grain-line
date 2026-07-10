-- Stores the AI-generated outline for designs started from a custom garment
-- type that isn't in the preset silhouette library (baseType: 'ai-silhouette').
-- An array of SVG path "d" strings plus small accent dots, drawn in the same
-- 0 0 60 72 viewBox and stroke-only style as the hand-built presets in
-- GarmentSilhouette.jsx, so it reads as part of the same system.
alter table designs add column if not exists ai_paths jsonb;
