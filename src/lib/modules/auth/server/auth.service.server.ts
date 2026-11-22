import { portalHref } from '#shared/portal-paths.ts';
import { error, redirect, type Cookies } from '@sveltejs/kit';
import { query, transaction } from '#server/database/postgres.ts';
import { hashToken, newToken, verifyPassword } from '#server/security/credentials.mjs';
import type { Role, User } from '#modules/auth/auth.types.ts';
import { previewAccounts } from '../preview-accounts.ts';

const userSelect = `SELECT u.id,u.email,u.full_name,u.role,u.faculty_id,f.name faculty_name,u.group_id,g.name group_name,g.course,g.program
 FROM users u LEFT JOIN faculties f ON f.id=u.faculty_id LEFT JOIN study_groups g ON g.id=u.group_id`;
const cookieName = 'deka_session';
const duration = 60 * 60 * 12;
type BrowserSession = App.Platform['browserSession'];

export function isLocalDemo(url: URL, browserSession?: BrowserSession) {
  return (
    Boolean(import.meta.env?.VITE_DEKA_PAGES_BASE && browserSession) ||
    (process.env.CONTEST_MODE !== 'true' &&
      process.env.DEMO_MODE === 'true' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname))
  );
}

export function isContestDemo(url: URL) {
  return (
    process.env.CONTEST_MODE === 'true' &&
    url.protocol === 'https:' &&
    url.origin === process.env.ORIGIN
  );
}

function accountScope(url: URL, browserSession?: BrowserSession) {
  if (process.env.CONTEST_MODE === 'true') return isContestDemo(url) ? 'contest' : 'blocked';
  return isLocalDemo(url, browserSession) ? 'local' : 'standard';
}

const allowedAccount = `CASE $2::text
  WHEN 'contest' THEN u.contest_access AND u.email LIKE '%@deka.test'
  WHEN 'local' THEN true
  WHEN 'standard' THEN u.email NOT LIKE '%@deka.test'
  ELSE false END`;

export async function sessionUser(
  cookies: Cookies,
  url: URL,
  browserSession?: BrowserSession
): Promise<User | null> {
  const token = browserSession ? browserSession.token : cookies.get(cookieName);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await query<User>(
    `${userSelect} JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND (${allowedAccount})`,
    [hashToken(token), accountScope(url, browserSession)]
  );
  if (!result.rowCount) clearSession(cookies, browserSession);
  return result.rows[0] ?? null;
}

export async function allowContestLogin(address: string) {
  const limit = await query(
    `INSERT INTO login_limits AS limits (key_hash,failures,window_start) VALUES($1,1,now())
     ON CONFLICT(key_hash) DO UPDATE SET
       failures=CASE WHEN limits.window_start < now()-interval '15 minutes' THEN 1
         ELSE limits.failures+1 END,
       window_start=CASE WHEN limits.window_start < now()-interval '15 minutes' THEN now()
         ELSE limits.window_start END
     WHERE limits.failures < 40 OR limits.window_start < now()-interval '15 minutes'
     RETURNING key_hash`,
    [hashToken('contest-address:' + address)]
  );
  return limit.rowCount === 1;
}

export async function signIn(
  email: string,
  password: string,
  cookies: Cookies,
  url: URL,
  browserSession?: BrowserSession
): Promise<boolean> {
  const access = accountScope(url, browserSession);
  if (access === 'blocked') return false;
  if (
    access === 'contest' &&
    !['student@deka.test', 'student2@deka.test', 'dean@deka.test'].includes(email)
  )
    return false;
  const key = hashToken(email);
  const account = await transaction(async (db) => {
    await db.query(
      `INSERT INTO login_limits(key_hash,failures,window_start) VALUES($1,0,now()) ON CONFLICT DO NOTHING`,
      [key]
    );
    const limit = await db.query(
      "SELECT *, window_start<now()-interval '15 minutes' expired FROM login_limits WHERE key_hash=$1 FOR UPDATE",
      [key]
    );
    if (limit.rows[0].expired)
      await db.query('UPDATE login_limits SET failures=0,window_start=now() WHERE key_hash=$1', [
        key
      ]);
    else if (limit.rows[0].failures >= 8) return null;
    const found = await db.query(
      `SELECT u.id,u.password_hash FROM users u WHERE u.email=$1 AND u.active AND (${allowedAccount})`,
      [email, access]
    );
    // Fixed dummy scrypt work also applies to unknown accounts.
    const encoded =
      found.rows[0]?.password_hash ?? 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64);
    if (!(await verifyPassword(password, encoded)) || !found.rowCount) {
      await db.query('UPDATE login_limits SET failures=failures+1 WHERE key_hash=$1', [key]);
      return null;
    }
    await db.query('DELETE FROM login_limits WHERE key_hash=$1', [key]);
    return found.rows[0];
  });
  if (!account) return false;
  await createSession(account.id, cookies, url.protocol === 'https:', browserSession);
  return true;
}

async function createSession(
  userId: string,
  cookies: Cookies,
  secure: boolean,
  browserSession?: BrowserSession
) {
  const token = newToken();
  await query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [hashToken(token), userId]
  );
  if (browserSession) {
    browserSession.token = token;
    return;
  }
  cookies.set(cookieName, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: duration
  });
}

export async function quickSignIn(
  code: string,
  cookies: Cookies,
  url: URL,
  browserSession?: BrowserSession
) {
  if (!isLocalDemo(url, browserSession)) return false;
  const account = previewAccounts.find((item) => item.code === code);
  if (!account) return false;
  const result = await query('SELECT id FROM users WHERE email=$1 AND role=$2 AND active', [
    `${account.code}@deka.test`,
    account.role
  ]);
  if (!result.rowCount) return false;
  await createSession(result.rows[0].id, cookies, url.protocol === 'https:', browserSession);
  return true;
}

function clearSession(cookies: Cookies, browserSession?: BrowserSession) {
  if (browserSession) browserSession.token = null;
  else cookies.delete(cookieName, { path: '/' });
}

export async function signOut(cookies: Cookies, browserSession?: BrowserSession) {
  const token = browserSession ? browserSession.token : cookies.get(cookieName);
  if (token) await query('DELETE FROM sessions WHERE token_hash=$1', [hashToken(token)]);
  clearSession(cookies, browserSession);
}
export function requireUser(user: User | null): User {
  if (!user) redirect(303, portalHref('/login'));
  return user as User;
}
export function requireRole(user: User | null, ...roles: Role[]): User {
  const current = requireUser(user);
  if (!roles.includes(current.role)) error(403, 'Для этого действия недостаточно прав.');
  return current;
}
