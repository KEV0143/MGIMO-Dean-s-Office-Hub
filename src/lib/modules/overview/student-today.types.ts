import type { studentToday } from './server/student-today.service.server.ts';

export type StudentToday = Awaited<ReturnType<typeof studentToday>>;
