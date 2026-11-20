-- Issue #146: other people get a cookbook of their own. Every row belongs to an owner: '' is the original cookbook (the
-- admin's), which every row already here keeps, so nothing moves; an account with the "user" role owns the rows under
-- its Netlify Identity id. A cookbook's sections and recipes belong to the cookbook.

ALTER TABLE recipes ADD COLUMN owner_id text NOT NULL DEFAULT '';
CREATE INDEX recipes_owner ON recipes (owner_id, created_at DESC);

ALTER TABLE cookbooks ADD COLUMN owner_id text NOT NULL DEFAULT '';
CREATE INDEX cookbooks_owner ON cookbooks (owner_id);
-- importing a Prepear cookbook twice is refused per owner, not across everyone
ALTER TABLE cookbooks DROP CONSTRAINT cookbooks_prepear_id_key;
CREATE UNIQUE INDEX cookbooks_owner_prepear_id ON cookbooks (owner_id, prepear_id);

ALTER TABLE planned_recipes ADD COLUMN owner_id text NOT NULL DEFAULT '';
CREATE INDEX planned_recipes_owner ON planned_recipes (owner_id, day);

ALTER TABLE grocery_items ADD COLUMN owner_id text NOT NULL DEFAULT '';
CREATE INDEX grocery_items_owner ON grocery_items (owner_id);

-- settings and grocery names (what an ingredient is, and the corrections made on the phone) are each owner's own
ALTER TABLE settings ADD COLUMN owner_id text NOT NULL DEFAULT '';
ALTER TABLE settings DROP CONSTRAINT settings_pkey;
ALTER TABLE settings ADD PRIMARY KEY (owner_id, key);

ALTER TABLE grocery_names ADD COLUMN owner_id text NOT NULL DEFAULT '';
ALTER TABLE grocery_names DROP CONSTRAINT grocery_names_pkey;
ALTER TABLE grocery_names ADD PRIMARY KEY (owner_id, key);
