-- Cookbooks (issue #25). They hold recipes by id, never copies (CLAUDE.md data rules), so a recipe edited anywhere
-- shows the same everywhere. Deleting a recipe takes it out of every cookbook (cascade); deleting a cover recipe leaves
-- no cover (the app then shows the first recipe with a photo).
CREATE TABLE cookbooks (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  cover_recipe_id text REFERENCES recipes (id) ON DELETE SET NULL,
  -- Prepear's id for a cookbook brought in from its export (#14), so it isn't brought in twice
  prepear_id      text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- "Meat", "Seafood": a cookbook's sections, in order
CREATE TABLE cookbook_sections (
  id              text PRIMARY KEY,
  cookbook_id     text NOT NULL REFERENCES cookbooks (id) ON DELETE CASCADE,
  name            text NOT NULL,
  cover_recipe_id text REFERENCES recipes (id) ON DELETE SET NULL,
  position        integer NOT NULL
);
CREATE INDEX cookbook_sections_cookbook ON cookbook_sections (cookbook_id, position);

-- Which recipes are in a cookbook, where (a section, or none: Uncategorized), in order. A recipe can be in several
-- cookbooks, and in several sections of one, as in Prepear; once per place.
CREATE TABLE cookbook_recipes (
  cookbook_id text NOT NULL REFERENCES cookbooks (id) ON DELETE CASCADE,
  section_id  text REFERENCES cookbook_sections (id) ON DELETE CASCADE,
  recipe_id   text NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position    integer NOT NULL
);
CREATE UNIQUE INDEX cookbook_recipes_place ON cookbook_recipes (cookbook_id, COALESCE(section_id, ''), recipe_id);
CREATE INDEX cookbook_recipes_recipe ON cookbook_recipes (recipe_id);
