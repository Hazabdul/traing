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
}

export interface RatingResult {
  accidentScore: number;
  violationScore: number;
  warningScore: number;
  behaviourScore: number;
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

export function bandForScore(total: number): { band: DriverRatingBand; riskLevel: string } {
  if (total >= 90) return { band: 'D1', riskLevel: 'Low' };
  if (total >= 76) return { band: 'D2', riskLevel: 'Low-Medium' };
  if (total >= 51) return { band: 'D3', riskLevel: 'Medium-High' };
  return { band: 'D4', riskLevel: 'High' };
}

export function computeRating(input: RatingInput): RatingResult {
  const accidentScore = ACCIDENT_SCORES[input.accident] ?? 20;
  const violationScore = VIOLATION_SCORES[input.violation] ?? 25;
  const warningScore = warningScoreFor(input.warningCount);
  const behaviourScore = BEHAVIOUR_SCORES[input.behaviour] ?? 10;
  const total = accidentScore + violationScore + warningScore + behaviourScore;
  const { band, riskLevel } = bandForScore(total);
  return { accidentScore, violationScore, warningScore, behaviourScore, total, band, riskLevel };
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
