import type {
  AccidentSeverity,
  BehaviourRating,
  DriverRatingBand,
  ViolationCategory,
} from '@/lib/database-types';

export interface RatingInput {
  accident: AccidentSeverity;
  violation: ViolationCategory;
  warningCount: number;
  behaviour: BehaviourRating;

  /**
   * Optional ISO-8601 date strings for the driver's history events.
   * Used by the clean-record bonus rule (see `computeCleanRecordBonus`).
   * Each array holds the dates of that event type — newest first or any order.
   */
  accidentDates?: string[];    // e.g. dates of accident records
  violationDates?: string[];   // e.g. dates of violation records
  warningDates?: string[];     // e.g. dates of warning records
  assessmentDates?: string[];  // e.g. dates of assessment records
}

export interface RatingResult {
  accidentScore: number;
  violationScore: number;
  warningScore: number;
  behaviourScore: number;
  /**
   * +5 clean-record bonus when no Accident / Violation / Warning / Assessment
   * occurred in the last 2 full calendar months. 0 otherwise.
   */
  cleanRecordBonus: number;
  total: number;
  band: DriverRatingBand;
  riskLevel: string;
}

export const ACCIDENT_SCORES: Record<AccidentSeverity, number> = {
  none: 35,
  minor: 30,
  moderate: 25,
  major: 20,
};

export const VIOLATION_SCORES: Record<ViolationCategory, number> = {
  none: 25,
  under_250: 20,
  under_1000: 10,
  over_1000: 5,
};

export const BEHAVIOUR_SCORES: Record<BehaviourRating, number> = {
  excellent: 20,
  good: 15,
  average: 10,
  poor: 5,
};

export function warningScoreFor(count: number): number {
  if (count === 0) return 20;
  if (count === 1) return 15;
  if (count === 2) return 10;
  return 5;
}

// ---------------------------------------------------------------------------
// Clean-Record Bonus Rule
// ---------------------------------------------------------------------------

/**
 * Returns the latest (most recent) JS Date found across all provided ISO-8601
 * date-string arrays, or `null` if every array is empty / undefined.
 */
export function latestEventDate(
  ...dateLists: (string[] | undefined)[]
): Date | null {
  let latest: Date | null = null;
  for (const list of dateLists) {
    if (!list) continue;
    for (const raw of list) {
      const d = new Date(raw);
      if (!isNaN(d.getTime()) && (latest === null || d > latest)) {
        latest = d;
      }
    }
  }
  return latest;
}

/**
 * Determines whether a driver qualifies for the +5 clean-record bonus.
 *
 * Rules:
 * - Examine all dates across Accident, Violation, Warning and Assessment.
 * - Find the single most-recent date among them.
 * - If that date is MORE than 2 full calendar months before `evaluationDate`
 *   (or if the driver has NO records at all), the driver earns +5 points.
 * - If any event falls within the last 2 months, no bonus is awarded.
 *
 * "2 full calendar months" means the year/month of the latest event must be
 * at least 2 months prior to the year/month of `evaluationDate`.
 *
 * @param accidentDates   ISO-8601 date strings for accident records
 * @param violationDates  ISO-8601 date strings for violation records
 * @param warningDates    ISO-8601 date strings for warning records
 * @param assessmentDates ISO-8601 date strings for assessment records
 * @param evaluationDate  The reference "today" (defaults to actual today)
 * @returns               5 if eligible, 0 if not
 */
export function computeCleanRecordBonus(
  accidentDates: string[] | undefined,
  violationDates: string[] | undefined,
  warningDates: string[] | undefined,
  assessmentDates: string[] | undefined,
  evaluationDate: Date = new Date()
): number {
  const BONUS = 5;

  const latest = latestEventDate(
    accidentDates,
    violationDates,
    warningDates,
    assessmentDates
  );

  // No records at all → driver is clean → award bonus
  if (latest === null) return BONUS;

  // Calculate the threshold: 2 full calendar months before evaluationDate.
  // e.g. evaluationDate = 2026-07-21 → threshold month = 2026-05-21
  const thresholdYear =
    evaluationDate.getMonth() < 2
      ? evaluationDate.getFullYear() - 1
      : evaluationDate.getFullYear();
  const thresholdMonth =
    ((evaluationDate.getMonth() - 2 + 12) % 12);

  // Compare year-month only (ignore day) to capture full calendar months
  const latestYear = latest.getFullYear();
  const latestMonth = latest.getMonth();

  const isOlderThan2Months =
    latestYear < thresholdYear ||
    (latestYear === thresholdYear && latestMonth < thresholdMonth) ||
    (latestYear === thresholdYear && latestMonth === thresholdMonth &&
      latest.getDate() < evaluationDate.getDate());

  return isOlderThan2Months ? BONUS : 0;
}

export function bandForScore(total: number): { band: DriverRatingBand; riskLevel: string } {
  if (total >= 90) return { band: 'D1', riskLevel: 'Low' };
  if (total >= 76) return { band: 'D2', riskLevel: 'Low-Medium' };
  if (total >= 51) return { band: 'D3', riskLevel: 'Medium-High' };
  return { band: 'D4', riskLevel: 'High' };
}

export function computeRating(input: RatingInput): RatingResult {
  const accidentScore  = ACCIDENT_SCORES[input.accident]  ?? 20;
  const violationScore = VIOLATION_SCORES[input.violation] ?? 25;
  const warningScore   = warningScoreFor(input.warningCount);
  const behaviourScore = BEHAVIOUR_SCORES[input.behaviour] ?? 10;

  // ── Clean-Record Bonus (+5) ──────────────────────────────────────────────
  // Awarded once per evaluation when no Accident / Violation / Warning /
  // Assessment has occurred within the last 2 full calendar months.
  const cleanRecordBonus = computeCleanRecordBonus(
    input.accidentDates,
    input.violationDates,
    input.warningDates,
    input.assessmentDates,
  );

  const total = accidentScore + violationScore + warningScore + behaviourScore + cleanRecordBonus;
  const { band, riskLevel } = bandForScore(total);

  return {
    accidentScore,
    violationScore,
    warningScore,
    behaviourScore,
    cleanRecordBonus,
    total,
    band,
    riskLevel,
  };
}

export interface TrainingRule {
  band: DriverRatingBand;
  title: string;
  trainingCadence: string;
  examCadence: string;
  awardEligible: boolean;
  enforcement: string;
}

export const TRAINING_RULES: Record<DriverRatingBand, TrainingRule> = {
  D1: {
    band: 'D1',
    title: 'Top Performers',
    trainingCadence: 'Quarterly safety training',
    examCadence: 'Annual exam',
    awardEligible: true,
    enforcement: 'Eligible for Safety Award.',
  },
  D2: {
    band: 'D2',
    title: 'Good Performers',
    trainingCadence: 'Monthly training',
    examCadence: 'Bi-monthly exams',
    awardEligible: false,
    enforcement: 'Not eligible for Safety Award.',
  },
  D3: {
    band: 'D3',
    title: 'Improvement Required',
    trainingCadence: 'Monthly system-selected trainings',
    examCadence: 'Bi-monthly exams',
    awardEligible: false,
    enforcement: 'Must improve within 2 months or face warning/suspension.',
  },
  D4: {
    band: 'D4',
    title: 'High Risk',
    trainingCadence: 'Monthly mandatory training',
    examCadence: 'Bi-monthly exams',
    awardEligible: false,
    enforcement:
      'Cannot transport hazardous goods if no improvement. Management may terminate or transfer.',
  },
};
