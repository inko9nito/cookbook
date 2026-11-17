-- Planner improvements (issue #67): a planned item can sit in a meal slot (breakfast, lunch, dinner; none: the whole
-- day), keep the servings picked on the recipe page, or be a note instead of a recipe ("Eating out"). Exactly one of
-- recipe and note.
ALTER TABLE planned_recipes ALTER COLUMN recipe_id DROP NOT NULL;
ALTER TABLE planned_recipes ADD COLUMN note text;
ALTER TABLE planned_recipes ADD COLUMN meal text CHECK (meal IN ('breakfast', 'lunch', 'dinner'));
ALTER TABLE planned_recipes ADD COLUMN servings numeric CHECK (servings > 0);
ALTER TABLE planned_recipes ADD CONSTRAINT planned_recipe_or_note CHECK ((recipe_id IS NULL) <> (note IS NULL));
