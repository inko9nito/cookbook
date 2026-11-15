-- Recipes. Ingredients, directions and photos are ordered lists kept as JSON on the recipe (see src/lib/recipe.ts);
-- every ingredient keeps the line exactly as typed (raw) beside its parsed amount / unit / name / note.
-- Tags (course types and my own) are a text array: one person's few dozen tags don't need their own table.
CREATE TABLE recipes (
  id            text PRIMARY KEY,
  title         text NOT NULL DEFAULT '',
  source        text NOT NULL DEFAULT '',
  source_url    text,
  servings      numeric NOT NULL DEFAULT 4,
  serving_size  text NOT NULL DEFAULT '',
  prep_minutes  integer NOT NULL DEFAULT 0,
  cook_minutes  integer NOT NULL DEFAULT 0,
  total_minutes integer NOT NULL DEFAULT 0,
  photos        jsonb NOT NULL DEFAULT '[]',
  tags          text[] NOT NULL DEFAULT '{}',
  ingredients   jsonb NOT NULL DEFAULT '[]',
  steps         jsonb NOT NULL DEFAULT '[]',
  notes         text NOT NULL DEFAULT '',
  rating        smallint NOT NULL DEFAULT 0,
  times_made    integer NOT NULL DEFAULT 0,
  last_made_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipes_created_at ON recipes (created_at DESC);
CREATE INDEX recipes_tags ON recipes USING gin (tags);

-- App settings as key → JSON value: the recipe sort (R1) and the last tag filter (R2).
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
