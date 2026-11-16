-- Issue #25 redesign: a cookbook's card has a soft colour. Null until it's chosen in the cookbook's menu; until then the
-- app picks one at random from the cookbook's id (the same every time).
ALTER TABLE cookbooks ADD COLUMN color text;
