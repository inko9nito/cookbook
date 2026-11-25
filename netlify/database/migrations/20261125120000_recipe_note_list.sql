-- Issue #165: a recipe's notes, each on its own, in order ([{ id, text }]). Null for a recipe saved before it (or by an
-- older version of the app): its `notes` text is then split at blank lines. `notes` stays, as all the notes in one text,
-- for older versions of the app.
ALTER TABLE recipes ADD COLUMN note_list jsonb;
