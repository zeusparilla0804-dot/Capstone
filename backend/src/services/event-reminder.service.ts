import type { ClaimedEmail } from '../repositories/email-outbox.repository.js';
import { eventReminderRepository } from '../repositories/event-reminder.repository.js';
import { renderEmail, validateEmailPayload } from '../templates/email-templates.js';
import { logger } from '../utils/logger.js';

const MANILA_TIME_ZONE = 'Asia/Manila';
const REMINDER_DAYS = 3;
const REMINDER_INTERVAL_MS = 60 * 60 * 1000;

function manilaDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

export function manilaReminderWindow(now: Date): { fromDate: string; throughDate: string } {
  const fromDate = manilaDate(now);
  return { fromDate, throughDate: addDays(fromDate, REMINDER_DAYS) };
}

interface EventReminderWorkerDependencies {
  queueDue(fromDate: string, throughDate: string): Promise<number>;
  now(): Date;
  intervalMs: number;
  schedule(callback: () => void, delay: number): unknown;
  cancel(handle: unknown): void;
  onError?: () => void;
}

export function createEventReminderWorker(deps: EventReminderWorkerDependencies) {
  let timer: unknown;
  let running: Promise<void> | undefined;
  let started = false;
  let stopping = false;

  async function tick(): Promise<void> {
    if (stopping || running) return;
    running = (async () => {
      try {
        const window = manilaReminderWindow(deps.now());
        await deps.queueDue(window.fromDate, window.throughDate);
      } catch {
        deps.onError?.();
      }
    })();
    try {
      await running;
    } finally {
      running = undefined;
      if (!stopping) timer = deps.schedule(() => { void tick(); }, deps.intervalMs);
    }
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      stopping = false;
      void tick();
    },
    async stop(): Promise<void> {
      if (!started) return;
      stopping = true;
      if (timer !== undefined) deps.cancel(timer);
      await running;
      timer = undefined;
      started = false;
    }
  };
}

export async function renderUpcomingEventReminder(item: ClaimedEmail, now: Date) {
  if (item.templateKey !== 'UPCOMING_EVENT_REMINDER' || item.relatedEntityType !== 'BOOKING' || !item.relatedEntityId) {
    return undefined;
  }
  const payload = validateEmailPayload(item.templateKey, item.payload);
  const reservationId = Number(item.relatedEntityId);
  const today = manilaReminderWindow(now).fromDate;
  if (!await eventReminderRepository.isDeliverable(reservationId, payload.eventDate!, today)) return undefined;
  return renderEmail(item.templateKey, payload);
}

export const eventReminderWorker = createEventReminderWorker({
  queueDue: eventReminderRepository.queueDue,
  now: () => new Date(),
  intervalMs: REMINDER_INTERVAL_MS,
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  onError: () => logger.error('event_reminder.failed', 'Upcoming event reminder queueing failed safely.')
});
