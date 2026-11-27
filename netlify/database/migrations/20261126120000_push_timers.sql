-- Issue #169: cook mode timers that send a push when they're up. One row per running timer, kept until its push is
-- sent or the timer is stopped on the phone. `target` is the phone's push subscription (where the push goes); a cook
-- session belongs to one phone, so its timers go only to that phone.
CREATE TABLE push_timers (
  id         text PRIMARY KEY,
  owner_id   text NOT NULL,
  ends_at    timestamptz NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  target     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_timers_ends_at ON push_timers (ends_at);
