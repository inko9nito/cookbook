-- What each ingredient is on the grocery list (issue #64), named once per ingredient name: by Claude when it's first
-- needed, or corrected on the phone (named_by = 'you', which Claude never overwrites). key is the name as recipes write it,
-- lowercase; things is one thing to buy, or the choices a recipe offers ("soy sauce or tamari"), each
-- { item, plural, aisle, onHand }.
CREATE TABLE grocery_names (
  key        text PRIMARY KEY,
  things     jsonb NOT NULL,
  named_by   text NOT NULL CHECK (named_by IN ('claude', 'you')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The choice picked on an item whose ingredient offers some ("tamari" of "soy sauce or tamari"); null while it's open.
ALTER TABLE grocery_items ADD COLUMN choice text;
