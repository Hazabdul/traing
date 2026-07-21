import type {
  AccidentSeverity,
  BehaviourRating,
  DriverRatingBand,
  TrainingStatus,
  ViolationCategory,
  WarningCategory,
  MaterialType,
  QuestionType,
  DifficultyLevel,
  AuditAction,
  UserRole,
} from '@/lib/database-types';

export const DRIVER_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  suspended: 'Suspended',
  resigned: 'Resigned',
};

export const ACCIDENT_SEVERITY_LABELS: Record<AccidentSeverity, string> = {
  none: 'No Accident',
  minor: 'Minor',
  moderate: 'Moderate',
  major: 'Major',
};

export const VIOLATION_CATEGORY_LABELS: Record<ViolationCategory, string> = {
  none: 'No Violation',
  under_250: 'Less than SAR 250',
  under_1000: 'Less than SAR 1,000',
  over_1000: 'Greater than SAR 1,000',
};

export const WARNING_CATEGORY_LABELS: Record<WarningCategory, string> = {
  none: 'No Warning',
  one: 'One',
  two: 'Two',
  more_than_two: 'More than Two',
};

export const BEHAVIOUR_LABELS: Record<BehaviourRating, string> = {
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  poor: 'Poor',
};

export const TRAINING_STATUS_LABELS: Record<TrainingStatus, string> = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  expired: 'Expired',
  overdue: 'Overdue',
  failed: 'Failed',
};

export const TRAINING_FREQUENCY_LABELS: Record<string, string> = {
  annual: 'Annual',
  quarterly: 'Quarterly',
  monthly: 'Monthly',
  bimonthly: 'Bi-monthly',
  manual: 'Manual',
  system_selected: 'System Selected',
};

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  pdf: 'PDF',
  powerpoint: 'PowerPoint',
  video: 'Video',
  audio: 'Audio',
  image: 'Image',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  true_false: 'True / False',
  multiple_select: 'Multiple Select',
};

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  assign: 'Assigned',
  complete: 'Completed',
  fail_exam: 'Failed Exam',
  training_change: 'Training Changed',
  status_change: 'Status Changed',
  login: 'Login',
};

export const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  system_admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ehss_manager: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  ehss_officer: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  hr: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  training_coordinator: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  branch_manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  driver: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export const RATING_BAND_COLORS: Record<DriverRatingBand, string> = {
  D1: '#16a34a',
  D2: '#2563eb',
  D3: '#f59e0b',
  D4: '#dc2626',
};

export const RATING_BAND_LABELS: Record<DriverRatingBand, string> = {
  D1: 'D1 - Excellent',
  D2: 'D2 - Good',
  D3: 'D3 - Needs Improvement',
  D4: 'D4 - High Risk',
};

export const TRAINING_STATUS_COLORS: Record<TrainingStatus, string> = {
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  expired: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

export const ACCIDENT_SEVERITY_COLORS: Record<AccidentSeverity, string> = {
  none: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  minor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  moderate: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  major: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const DRIVER_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  resigned: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};
