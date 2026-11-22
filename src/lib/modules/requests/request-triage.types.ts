import type { RequestKind } from './request.types.ts';

export interface TriageItem {
  id: string;
  number: string;
  kind: RequestKind;
  status: 'new' | 'in_progress';
  student_name: string;
  group_name: string;
  age_days: number;
  due_on: string | null;
  awaiting_student: boolean;
  overdue: boolean;
}

export interface RequestTriage {
  new_count: number;
  in_progress_count: number;
  ready_count: number;
  overdue_count: number;
  awaiting_student_count: number;
  items: TriageItem[];
}

export const WAITING_DAYS = 7;
