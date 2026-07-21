// Auto-generated-style TypeScript types for the Driver Training Management System schema.
// Hand-maintained to match the Supabase migrations.

export type UserRole =
  | 'system_admin'
  | 'ehss_manager'
  | 'ehss_officer'
  | 'hr'
  | 'training_coordinator'
  | 'branch_manager'
  | 'driver';

export type DriverStatus = 'active' | 'suspended' | 'resigned';
export type AccidentSeverity = 'none' | 'minor' | 'moderate' | 'major';
export type ViolationCategory = 'none' | 'under_250' | 'under_1000' | 'over_1000';
export type WarningCategory = 'none' | 'one' | 'two' | 'more_than_two';
export type BehaviourRating = 'excellent' | 'good' | 'average' | 'poor';
export type DriverRatingBand = 'D1' | 'D2' | 'D3' | 'D4';
export type TrainingStatus =
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'overdue'
  | 'failed';
export type TrainingFrequency =
  | 'annual'
  | 'quarterly'
  | 'monthly'
  | 'bimonthly'
  | 'manual'
  | 'system_selected';
export type MaterialType = 'pdf' | 'powerpoint' | 'video' | 'audio' | 'image';
export type QuestionType = 'multiple_choice' | 'true_false' | 'multiple_select';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'assign'
  | 'complete'
  | 'fail_exam'
  | 'training_change'
  | 'status_change'
  | 'login';

export interface Branch {
  id: string;
  name: string;
  code: string;
  manager_name: string | null;
  location: string | null;
  created_at: string;
}

export interface Plant {
  id: string;
  name: string;
  code: string;
  description: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  branch_id: string | null;
  driver_id: string | null;
  created_at: string;
}

export interface Driver {
  id: string;
  employee_id: string;
  full_name: string;
  nationality: string | null;
  gender: string | null;
  date_of_birth: string | null;
  email: string | null;
  mobile: string | null;
  experience_years: number | null;
  branch_id: string | null;
  truck_number: string | null;
  equipment_number: string | null;
  supervisor: string | null;
  plant_id: string | null;
  status: DriverStatus;
  photo_url: string | null;
  annual_training_frequency_months: number;
  next_annual_training_date: string | null;
  last_rating_score: number;
  last_rating_band: DriverRatingBand;
  last_risk_level: string;
  hire_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverDocument {
  id: string;
  driver_id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  uploaded_at: string;
}

export interface Accident {
  id: string;
  driver_id: string;
  accident_date: string;
  severity: AccidentSeverity;
  type: string | null;
  description: string | null;
  root_cause: string | null;
  recommended_training: string | null;
  document_url: string | null;
  created_at: string;
}

export interface Violation {
  id: string;
  driver_id: string;
  violation_date: string;
  amount: number | null;
  category: ViolationCategory;
  description: string | null;
  created_at: string;
}

export interface SafetyWarning {
  id: string;
  driver_id: string;
  warning_date: string;
  category: WarningCategory;
  description: string | null;
  created_at: string;
}

export interface BehaviourAssessment {
  id: string;
  driver_id: string;
  assessment_date: string;
  rating: BehaviourRating;
  evaluator: string | null;
  comments: string | null;
  created_at: string;
}

export interface DriverRating {
  id: string;
  driver_id: string;
  score: number;
  rating: DriverRatingBand;
  risk_level: string;
  accident_score: number;
  violation_score: number;
  warning_score: number;
  behaviour_score: number;
  computed_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  duration_hours: number | null;
  language: string | null;
  category: string | null;
  frequency: TrainingFrequency;
  trainer: string | null;
  pass_percentage: number;
  is_mandatory: boolean | null;
  created_at: string;
}

export interface TrainingMaterial {
  id: string;
  course_id: string;
  title: string;
  material_type: MaterialType;
  language: string | null;
  file_url: string;
  version: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface Training {
  id: string;
  driver_id: string;
  course_id: string;
  status: TrainingStatus;
  assigned_date: string;
  due_date: string | null;
  completed_date: string | null;
  score: number | null;
  source: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  course_id: string | null;
  question_text: string;
  question_type: QuestionType;
  category: string | null;
  difficulty: DifficultyLevel;
  options: string[];
  correct_answers: number[];
  explanation: string | null;
  image_url: string | null;
  option_images: (string | null)[] | null;
  created_at: string;
}

export interface Exam {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  time_limit_minutes: number | null;
  pass_percentage: number;
  randomize_questions: boolean | null;
  is_active: boolean | null;
  created_at: string;
}

export interface ExamQuestion {
  exam_id: string;
  question_id: string;
  position: number;
}

export interface ExamAttempt {
  id: string;
  exam_id: string;
  driver_id: string;
  training_id: string | null;
  started_at: string;
  completed_at: string | null;
  score: number;
  total_questions: number;
  correct_answers: number;
  percentage: number;
  passed: boolean;
  answers: Record<string, number[]>;
  created_at: string;
}

export interface Certificate {
  id: string;
  driver_id: string;
  course_id: string;
  exam_attempt_id: string | null;
  certificate_number: string;
  issued_at: string;
  created_at: string;
}

export interface Notification {
  id: string;
  driver_id: string | null;
  user_id: string | null;
  channel: NotificationChannel;
  title: string;
  body: string | null;
  sent_at: string;
  is_read: boolean | null;
  meta: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: AuditAction;
  entity: string;
  entity_id: string | null;
  description: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface SystemSettings {
  id: number;
  annual_training_months: number;
  d2_training_months: number;
  d3_training_months: number;
  d4_training_months: number;
  exam_pass_percentage: number;
  exam_interval_months: number;
  d3_improvement_months: number;
  safety_award_enabled: boolean | null;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      branches: { Row: Branch; Insert: Partial<Omit<Branch, 'id' | 'created_at'>>; Update: Partial<Omit<Branch, 'id' | 'created_at'>> };
      plants: { Row: Plant; Insert: Partial<Omit<Plant, 'id' | 'created_at'>>; Update: Partial<Omit<Plant, 'id' | 'created_at'>> };
      profiles: { Row: Profile; Insert: Partial<Omit<Profile, 'id' | 'created_at'>>; Update: Partial<Omit<Profile, 'id' | 'created_at'>> };
      drivers: { Row: Driver; Insert: Partial<Omit<Driver, 'id' | 'created_at' | 'updated_at'>>; Update: Partial<Omit<Driver, 'id' | 'created_at' | 'updated_at'>> };
      driver_documents: { Row: DriverDocument; Insert: Partial<Omit<DriverDocument, 'id' | 'uploaded_at'>>; Update: Partial<Omit<DriverDocument, 'id' | 'uploaded_at'>> };
      accidents: { Row: Accident; Insert: Partial<Omit<Accident, 'id' | 'created_at'>>; Update: Partial<Omit<Accident, 'id' | 'created_at'>> };
      violations: { Row: Violation; Insert: Partial<Omit<Violation, 'id' | 'created_at'>>; Update: Partial<Omit<Violation, 'id' | 'created_at'>> };
      safety_warnings: { Row: SafetyWarning; Insert: Partial<Omit<SafetyWarning, 'id' | 'created_at'>>; Update: Partial<Omit<SafetyWarning, 'id' | 'created_at'>> };
      behaviour_assessments: { Row: BehaviourAssessment; Insert: Partial<Omit<BehaviourAssessment, 'id' | 'created_at'>>; Update: Partial<Omit<BehaviourAssessment, 'id' | 'created_at'>> };
      driver_ratings: { Row: DriverRating; Insert: Partial<Omit<DriverRating, 'id' | 'computed_at'>>; Update: Partial<Omit<DriverRating, 'id' | 'computed_at'>> };
      courses: { Row: Course; Insert: Partial<Omit<Course, 'id' | 'created_at'>>; Update: Partial<Omit<Course, 'id' | 'created_at'>> };
      training_materials: { Row: TrainingMaterial; Insert: Partial<Omit<TrainingMaterial, 'id' | 'uploaded_at'>>; Update: Partial<Omit<TrainingMaterial, 'id' | 'uploaded_at'>> };
      trainings: { Row: Training; Insert: Partial<Omit<Training, 'id' | 'created_at'>>; Update: Partial<Omit<Training, 'id' | 'created_at'>> };
      questions: { Row: Question; Insert: Partial<Omit<Question, 'id' | 'created_at'>>; Update: Partial<Omit<Question, 'id' | 'created_at'>> };
      exams: { Row: Exam; Insert: Partial<Omit<Exam, 'id' | 'created_at'>>; Update: Partial<Omit<Exam, 'id' | 'created_at'>> };
      exam_questions: { Row: ExamQuestion; Insert: Partial<ExamQuestion>; Update: Partial<ExamQuestion> };
      exam_attempts: { Row: ExamAttempt; Insert: Partial<Omit<ExamAttempt, 'id' | 'created_at'>>; Update: Partial<Omit<ExamAttempt, 'id' | 'created_at'>> };
      certificates: { Row: Certificate; Insert: Partial<Omit<Certificate, 'id' | 'created_at'>>; Update: Partial<Omit<Certificate, 'id' | 'created_at'>> };
      notifications: { Row: Notification; Insert: Partial<Omit<Notification, 'id' | 'sent_at'>>; Update: Partial<Omit<Notification, 'id' | 'sent_at'>> };
      audit_logs: { Row: AuditLog; Insert: Partial<Omit<AuditLog, 'id' | 'created_at'>>; Update: Partial<Omit<AuditLog, 'id' | 'created_at'>> };
      system_settings: { Row: SystemSettings; Insert: Partial<SystemSettings>; Update: Partial<Omit<SystemSettings, 'id' | 'updated_at'>> };
      plant_courses: { Row: { plant_id: string; course_id: string }; Insert: { plant_id: string; course_id: string }; Update: { plant_id?: string; course_id?: string } };
    };
    Functions: {
      recompute_driver_rating: (args: { p_driver_id: string }) => { data: { score: number; rating: DriverRatingBand; risk_level: string }[] };
    };
  };
}
