-- The grocery list (issue #64). An item is a recipe's ingredient (the recipe's and the ingredient's ids, and the
-- servings it was added at; never the ingredient's words, CLAUDE.md data rules) or something typed on the list.
-- Deleting a recipe takes its items off the list. planned_id is the Planner entry Shop this week added it from (no
-- foreign key: the entry can be taken off the Planner while the item stays on the list).
CREATE TABLE grocery_items (
  id            text PRIMARY KEY,
  recipe_id     text REFERENCES recipes (id) ON DELETE CASCADE,
  ingredient_id text,
  servings      numeric CHECK (servings > 0),
  planned_id    text,
  text          text,
  store         text,
  checked       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grocery_ingredient_or_text CHECK (
    (recipe_id IS NOT NULL AND ingredient_id IS NOT NULL AND text IS NULL)
    OR (recipe_id IS NULL AND ingredient_id IS NULL AND text IS NOT NULL)
  )
);
CREATE INDEX grocery_items_created ON grocery_items (created_at);
CREATE INDEX grocery_items_recipe ON grocery_items (recipe_id);
