export interface Lesson {
  id: string;
  subject: string;
  color: string;
  teacher: string;
  group_name: string;
  starts_at: string;
  ends_at: string;
  room: string;
  kind: 'lecture' | 'practice' | 'lab' | 'exam' | 'credit';
  note: string;
  cancelled_at: string | null;
  rescheduled_at: string | null;
  change_reason: string;
  previous_starts_at: string | null;
  previous_ends_at: string | null;
  previous_room: string | null;
}
export type LessonChange = Pick<
  Lesson,
  | 'id'
  | 'subject'
  | 'starts_at'
  | 'ends_at'
  | 'room'
  | 'cancelled_at'
  | 'change_reason'
  | 'previous_starts_at'
  | 'previous_ends_at'
  | 'previous_room'
> & {
  overlapping_subject: string | null;
  from_room: string | null;
};

export interface Grade {
  student_id: string;
  student: string;
  subject: string;
  color: string;
  teacher: string;
  group_name: string;
  points: number;
  updated_at: string;
}
