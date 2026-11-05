export interface EmailIssueState { createdAt: Date; windowStartedAt: Date; issuanceCount: number; lockedUntil: Date | null; }
export interface EmailAttemptState { attempts: number; expiresAt: Date; lockedUntil: Date | null; }
export function canIssueEmailCode(state: EmailIssueState | undefined, now: Date): boolean {
  return !state || ((!state.lockedUntil || +state.lockedUntil <= +now) && +now - +state.createdAt >= 60_000 &&
    (+now - +state.windowStartedAt >= 900_000 || state.issuanceCount < 5));
}
export function canAttemptEmailCode(state: EmailAttemptState, now: Date): boolean {
  return state.attempts < 5 && +state.expiresAt > +now && (!state.lockedUntil || +state.lockedUntil <= +now);
}
