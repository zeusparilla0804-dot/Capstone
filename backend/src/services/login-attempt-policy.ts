export interface LoginAttemptState { attempts: number; windowStartedAt: Date; blockedUntil: Date | null; }
const WINDOW_MS = 15 * 60 * 1000;
export function nextLoginAttempt(previous: LoginAttemptState | undefined, now: Date): { allowed: boolean; state: LoginAttemptState } {
  if (previous?.blockedUntil && +previous.blockedUntil > +now) return { allowed: false, state: previous };
  const reset = !previous || +now - +previous.windowStartedAt >= WINDOW_MS || previous.blockedUntil !== null;
  const attempts = reset ? 1 : previous.attempts + 1;
  return { allowed: true, state: { attempts, windowStartedAt: reset ? now : previous.windowStartedAt,
    blockedUntil: attempts >= 5 ? new Date(+now + WINDOW_MS) : null } };
}
