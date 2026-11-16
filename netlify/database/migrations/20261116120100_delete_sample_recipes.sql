-- Issue #14: the five sample recipes (seeded by 20261115120100_seed_sample_recipes.sql) go, now that the real recipes
-- come over from Prepear. The user asked for this. Their photos are static files (/photos/…), not stored photos.
DELETE FROM recipes WHERE id IN ('1', '2', '3', '4', '5');
