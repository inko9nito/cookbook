-- The Planner (issue #62): recipes planned for real days. Not meal plans (#26, templates with numbered days).
-- A planned recipe holds the recipe's id, never a copy (CLAUDE.md data rules); deleting a recipe takes it off every day.
-- A recipe can be planned for several days, and twice on one day.
CREATE TABLE planned_recipes (
  id         text PRIMARY KEY,
  day        date NOT NULL,
  recipe_id  text NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX planned_recipes_day ON planned_recipes (day, created_at);
CREATE INDEX planned_recipes_recipe ON planned_recipes (recipe_id);
