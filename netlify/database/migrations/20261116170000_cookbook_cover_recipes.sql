-- Issue #25 redesign: a cookbook's cover is a collage of up to three recipes' photos, picked in order (the first goes
-- across the top). The single cover_recipe_id stays as the first of them, for copies of the app that still read it.
ALTER TABLE cookbooks ADD COLUMN cover_recipe_ids text[] NOT NULL DEFAULT '{}';
UPDATE cookbooks SET cover_recipe_ids = ARRAY[cover_recipe_id] WHERE cover_recipe_id IS NOT NULL;
