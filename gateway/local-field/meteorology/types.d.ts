export type SourceDomain = 'CALENDAR' | 'GIT';
export type Direction = 'RISING' | 'FALLING' | 'STABLE';
export type Metric = 'available_time_margin' | 'meeting_density' | 'buffer_compression' |
  'open_pr_age' | 'review_latency' | 'commit_velocity';
export interface ObservationWindow { readonly start: string; readonly end: string; }
export interface FieldSignal {
  readonly signal_id: string;
  readonly metric: Metric;
  readonly magnitude: number;
  readonly direction: Direction;
  /** Signed normalized units per hour, measured BEFORE clipping magnitude to [0,1]. */
  readonly rate_of_change: number;
  readonly observation_window: ObservationWindow;
  readonly comparison_window: ObservationWindow;
  readonly source_domain: SourceDomain;
  readonly extractor_id: 'calendar.edge.f0.1' | 'git.edge.f0.1';
  readonly extractor_version: '0.1.0';
  readonly timestamp: string;
}
export type AtmosphericRegime = 'HIGH_PRESSURE' | 'LOW_PRESSURE' | 'COLD_FRONT' | 'WARM_FRONT' |
  'WIND_SHEAR' | 'INVERSION' | 'CLEAR_HORIZON' | 'PRESSURE_DIFFERENTIAL';
export interface Condition { readonly condition_code: string; readonly signal_refs: readonly string[]; }
export interface FormingFront extends Condition { readonly horizon_hours: readonly [24,48]; readonly status: 'CANDIDATE'; }
export interface FieldoscopyReading {
  readonly reading_id: string;
  readonly timestamp: string;
  readonly atmospheric_regime: AtmosphericRegime | null;
  readonly candidate_regimes: readonly AtmosphericRegime[];
  readonly signal_manifest: readonly (Omit<FieldSignal, 'metric'> & { readonly signal_type: Metric })[];
  readonly visibility: 'ILLUMINATED' | 'SHADOWED' | 'UNKNOWN';
  readonly confidence: { readonly basis: 'UNCALIBRATED_RULE_SUPPORT'; readonly level: 'SUPPORTED' | 'PARTIAL' | 'INSUFFICIENT' };
  readonly current_conditions: readonly Condition[];
  readonly primary_drivers: readonly Condition[];
  readonly forming_fronts: readonly FormingFront[];
  readonly unresolved_remainder: readonly string[];
  readonly evaluation: { readonly evaluator_id: 'cognitive-meteorology.f0.1'; readonly evaluator_version: '0.1.0';
    readonly matched_rules: readonly string[]; readonly pressure_differential: number | null;
    readonly pressure_differential_role: 'EXPERIMENTAL_RELATIONAL_FEATURE' };
}
export interface MetascopeProjection {
  readonly projection_id: string; readonly reading_ref: string; readonly timestamp: string;
  readonly sections: readonly { readonly title: string; readonly lines: readonly string[] }[];
}
export function extractCalendarSignals(input: { current: CalendarSample; previous: CalendarSample }): FieldSignal[];
export interface CalendarSample { window: ObservationWindow; work_start: string; work_end: string;
  minimum_buffer_minutes: number; events: { start: string; end: string }[]; }
export interface GitSample { window: ObservationWindow; pull_requests: { created_at: string; first_review_at: string | null }[];
  commits: { timestamp: string }[]; }
export function extractGitSignals(input: { current: GitSample; previous: GitSample; rolling_daily_commit_median: number }): FieldSignal[];
export function validateSignals(signals: unknown): FieldSignal[];
export function evaluate(signals: readonly FieldSignal[], options?: { timestamp?: string }): FieldoscopyReading;
export function projectMetascope(reading: FieldoscopyReading): MetascopeProjection;
export function renderMetascope(projection: MetascopeProjection): string;
