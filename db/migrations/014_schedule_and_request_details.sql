ALTER TABLE lessons ADD COLUMN change_reason text NOT NULL DEFAULT ''
  CHECK (char_length(change_reason) <= 300);

ALTER TABLE requests ADD COLUMN due_on date,
  ADD COLUMN awaiting_student boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT requests_awaiting_student_in_progress
    CHECK (NOT awaiting_student OR status = 'in_progress');
