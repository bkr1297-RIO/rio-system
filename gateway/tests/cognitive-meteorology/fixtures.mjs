export const currentWindow = { start: '2026-10-05T00:00:00.000Z', end: '2026-10-06T00:00:00.000Z' };
export const previousWindow = { start: '2026-10-04T00:00:00.000Z', end: '2026-10-05T00:00:00.000Z' };
export const at = (hour, day = 5) => new Date(Date.UTC(2026, 9, day, hour)).toISOString();
export function bottleneckSources() {
  const calendar = {
    current: { window: currentWindow, work_start: at(9), work_end: at(17), minimum_buffer_minutes: 15,
      events: [
        { start: at(9), end: '2026-10-05T11:20:48.000Z' },
        { start: '2026-10-05T11:20:48.000Z', end: '2026-10-05T13:41:36.000Z' },
        { start: '2026-10-05T13:41:36.000Z', end: '2026-10-05T16:02:24.000Z' },
      ] },
    previous: { window: previousWindow, work_start: at(9, 4), work_end: at(17, 4), minimum_buffer_minutes: 15,
      events: [{ start: at(9, 4), end: at(10, 4) }, { start: at(11, 4), end: at(12, 4) }, { start: at(14, 4), end: at(16, 4) }] },
  };
  const git = { current: { window: currentWindow, pull_requests: [{ created_at: '2026-10-02T12:00:00.000Z', first_review_at: null }],
    commits: Array.from({ length: 40 }, (_, i) => ({ timestamp: new Date(Date.UTC(2026, 9, 5, 1, i)).toISOString() })) },
    previous: { window: previousWindow, pull_requests: [{ created_at: at(0, 4), first_review_at: at(6, 4) }],
      commits: Array.from({ length: 10 }, (_, i) => ({ timestamp: new Date(Date.UTC(2026, 9, 4, 1, i)).toISOString() })) },
    rolling_daily_commit_median: 10 };
  return { calendar, git };
}

export async function fixtureSignals() {
  const { extractCalendarSignals } = await import('../../local-field/meteorology/calendar-edge.mjs');
  const { extractGitSignals } = await import('../../local-field/meteorology/git-edge.mjs');
  const source = bottleneckSources();
  return [...extractCalendarSignals(source.calendar), ...extractGitSignals(source.git)];
}
