ALTER TABLE users ADD COLUMN contest_access boolean NOT NULL DEFAULT false;
ALTER TABLE lessons ADD COLUMN rescheduled_at timestamptz;

CREATE INDEX lessons_group_start ON lessons(group_id, starts_at);
CREATE INDEX lessons_teacher_start ON lessons(teacher_id, starts_at);
