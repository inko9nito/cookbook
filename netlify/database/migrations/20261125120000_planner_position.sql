-- Issue #164: a planned item's place in its slot, once the slot has been put in order by dragging (0 first). Items
-- without one come after, in the order they were added.
ALTER TABLE planned_recipes ADD COLUMN position integer CHECK (position >= 0);
