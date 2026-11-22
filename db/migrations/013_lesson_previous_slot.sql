ALTER TABLE lessons
  ADD COLUMN previous_starts_at timestamptz,
  ADD COLUMN previous_ends_at timestamptz,
  ADD COLUMN previous_room text,
  ADD CONSTRAINT lessons_previous_slot_check CHECK (
    (previous_starts_at IS NULL AND previous_ends_at IS NULL AND previous_room IS NULL) OR
    (previous_starts_at IS NOT NULL AND previous_ends_at IS NOT NULL AND previous_room IS NOT NULL
      AND previous_starts_at < previous_ends_at)
  );

CREATE INDEX lessons_upcoming_changes ON lessons(group_id, starts_at)
  WHERE rescheduled_at IS NOT NULL OR cancelled_at IS NOT NULL;
