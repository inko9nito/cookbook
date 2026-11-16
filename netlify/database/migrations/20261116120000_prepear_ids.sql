-- Issue #14: a recipe imported from Prepear remembers Prepear's ids for it (my edited copy's and the original's), so
-- importing again skips it, and Prepear's cookbooks and meal plan (kept from the export) can find it later.
ALTER TABLE recipes ADD COLUMN prepear_ids text[] NOT NULL DEFAULT '{}';
CREATE INDEX recipes_prepear_ids ON recipes USING gin (prepear_ids);
