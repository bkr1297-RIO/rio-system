import { fieldSignal, time, windowDuration, compareWindows, requireCondition } from './signals.mjs';

const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
// Source-side stub: PR timing and commit timestamps only. No bodies, diffs, code or secrets.
function sample(source, median) {
  const duration = windowDuration(source.window, 'GIT_EDGE_WINDOW'), end = time(source.window.end), start = time(source.window.start);
  requireCondition(Array.isArray(source.pull_requests) && Array.isArray(source.commits), 'GIT_EDGE_SAMPLE');
  const ages = [], waits = [];
  for (const pr of source.pull_requests) {
    const created = time(pr.created_at, 'GIT_EDGE_PR');
    requireCondition(created <= end, 'GIT_EDGE_PR');
    const review = pr.first_review_at === null ? end : time(pr.first_review_at, 'GIT_EDGE_PR');
    requireCondition(review >= created && review <= end, 'GIT_EDGE_PR');
    ages.push((end - created) / 3600000); waits.push((review - created) / 3600000);
  }
  const count = source.commits.reduce((n, commit) => {
    const stamp = time(commit.timestamp, 'GIT_EDGE_COMMIT');
    return n + Number(stamp >= start && stamp < end);
  }, 0);
  return { open_pr_age: mean(ages) === null ? null : mean(ages) / 168,
    review_latency: mean(waits) === null ? null : mean(waits) / 96,
    commit_velocity: median > 0 ? (count / (duration / 86400000)) / median / 4 : null };
}
export function extractGitSignals({ current, previous, rolling_daily_commit_median: median }) {
  compareWindows(current.window, previous.window, 'GIT_EDGE_WINDOW');
  requireCondition(Number.isFinite(median) && median >= 0, 'GIT_EDGE_BASELINE');
  const now = sample(current, median), before = sample(previous, median);
  return ['open_pr_age', 'review_latency', 'commit_velocity'].filter(metric => now[metric] !== null && before[metric] !== null)
    .map(metric => fieldSignal({ metric, magnitude: now[metric], observation_window: current.window,
      comparison_window: previous.window }, before[metric]));
}
