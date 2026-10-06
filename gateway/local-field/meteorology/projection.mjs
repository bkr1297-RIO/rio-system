import { validateReading, freezeData } from './evaluator.mjs';
import { fingerprint } from './signals.mjs';

const TEXT = Object.freeze({
  TIME_TIGHT: 'Available calendar time is tight.', TIME_AVAILABLE: 'Calendar time remains available.',
  MEETINGS_DENSE: 'Meetings occupy much of the working window.', MEETINGS_LIGHT: 'Meetings occupy a smaller part of the working window.',
  BUFFERS_COMPRESSED: 'Meeting buffers are compressed.', BUFFERS_PRESENT: 'Meeting buffers show little compression.',
  PRS_AGING: 'Open pull requests are aging.', PRS_RECENT: 'Open pull requests are relatively recent.',
  REVIEW_WAITS_LONG: 'Review waits are long.', REVIEW_WAITS_SHORT: 'Review waits are shorter.',
  PRODUCTION_RISING: 'Development activity is rising.', PRODUCTION_FALLING: 'Development activity is falling.',
  PRODUCTION_STABLE: 'Development activity is steady.',
  POSSIBLE_REVIEW_BOTTLENECK: 'Development activity is rising while review waits lengthen and calendar space tightens. A possible review bottleneck may be forming over the next 24–48 hours.',
  POSSIBLE_CAPACITY_RECOVERY: 'Calendar space is opening and review waits are shortening. Conditions may ease over the next 24–48 hours.',
  POSSIBLE_CAPACITY_TIGHTENING: 'Calendar space is shrinking while review waits lengthen. Conditions may tighten over the next 24–48 hours.',
  UNCALIBRATED_FORECAST: 'The near-term outlook has not yet been checked against real outcomes.',
  REVIEW_LATENCY_IS_CAPACITY_PROXY: 'Review waits suggest capacity; they do not measure actual reviewer availability.',
  PENDING_REVIEWS_ARE_CENSORED: 'A pull request still waiting for review may ultimately wait longer.',
  NO_TASK_SIZE_OR_COMPLEXITY_SIGNAL: 'Task size and review complexity are outside this radar.',
  CALENDAR_FREE_TIME_IS_NOT_REVIEW_COMMITMENT: 'Free calendar time does not tell us whether someone has committed to review.',
  PRESSURE_DIFFERENTIAL_ONTOLOGY_OPEN: 'How pressure differential relates to the other weather patterns remains open.',
  MISSING_CALENDAR: 'Calendar signals are missing.', MISSING_GIT: 'Git signals are missing.', MISSING_METRICS: 'Some declared measurements are unavailable.',
  STALE_SIGNALS: 'Some observations are older than the current reading window.', UNALIGNED_WINDOWS: 'The observation windows do not line up for a cross-domain comparison.',
  NO_MATCHED_REGIME: 'The available signals do not establish one of the candidate weather patterns.',
});
const TITLES = ['Current Conditions', 'What’s Driving It', 'What’s Forming', 'What We Can’t See Yet'];
export function projectMetascope(reading) {
  validateReading(reading);
  const sections = [reading.current_conditions.map(c => TEXT[c.condition_code]), reading.primary_drivers.map(c => TEXT[c.condition_code]),
    reading.forming_fronts.map(c => TEXT[c.condition_code]), reading.unresolved_remainder.map(code => TEXT[code])]
    .map((lines, i) => ({ title: TITLES[i], lines: lines.length ? lines : [i === 2 ? 'No near-term front is established from the available observations.' : 'There is not enough current information.'] }));
  const value = { reading_ref: reading.reading_id, timestamp: reading.timestamp, sections };
  return freezeData({ projection_id: fingerprint(value), ...value });
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function renderMetascope(projection) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Cognitive Meteorology · Metascope F0.1</title><style>
  :root{color-scheme:dark light;font-family:system-ui,sans-serif;background:#0c1721;color:#e1ebef}*{box-sizing:border-box}
  body{margin:0;padding:clamp(20px,5vw,60px)}main{max-width:1080px;margin:auto}header{border-bottom:1px solid #3c5560;padding-bottom:24px;margin-bottom:24px}
  .eyebrow{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#85cbd3}h1{font-size:clamp(30px,5vw,52px);font-weight:500;margin:12px 0}
  .law{color:#aabcc4;font-size:17px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
  section{background:#142531;border:1px solid #29434e;border-radius:14px;padding:24px}h2{font-size:21px;margin-top:0;color:#9bdae0}
  ul{padding-left:20px;margin-bottom:0}li{margin:10px 0;line-height:1.5}footer{margin:24px 0;font-size:12px;color:#aabcc4;overflow-wrap:anywhere}
  @media(max-width:680px){.grid{grid-template-columns:1fr}section{padding:20px}}</style></head>
  <body><main><header><div class="eyebrow">ONE · Cognitive Meteorology · F0.1 reference specimen</div>
  <h1>Weather around this project</h1><p class="law">The radar maps the front. The radar does not move the ship.</p>
  <time>${escape(projection.timestamp)}</time></header><div class="grid">${projection.sections.map(s => `<section><h2>${escape(s.title)}</h2><ul>${s.lines.map(line => `<li>${escape(line)}</li>`).join('')}</ul></section>`).join('')}</div>
  <footer>Observation only · Calendar and Git · Reading ${escape(projection.reading_ref)}</footer></main></body></html>`;
}
