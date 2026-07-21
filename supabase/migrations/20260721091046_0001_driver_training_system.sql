/*
# Driver Training Management System - Core Schema

## Overview
Enterprise-grade system for a hazardous-goods logistics company.
Implements: driver management, performance tracking (accidents/violations/warnings/behaviour),
weighted driver rating engine (D1-D4), annual training scheduling, training library,
online examinations, question bank, audit logs, and notifications.

## Tables created
1. branches - logistics branch offices
2. plants - industrial plant requirements (SABIC, TASNEE, etc.)
3. plant_courses - many-to-many plant-to-course requirements
4. profiles - links auth.users to app roles (admin, ehss_manager, etc.)
5. drivers - core driver records
6. driver_documents - uploaded documents (URL references)
7. accidents - accident history per driver
8. violations - traffic violations per driver
9. safety_warnings - safety warnings per driver
10. behaviour_assessments - periodic behaviour evaluations
11. driver_ratings - snapshot of computed rating (score, rating, risk_level)
12. courses - training library entries
13. training_materials - uploaded material files per course (multi-language, versioned)
14. trainings - training instance assigned to a driver (with status, due/completed dates)
15. questions - question bank items (mcq/true_false/multi_select)
16. exams - exam definitions attached to courses
17. exam_questions - many-to-many exam<->question with order
18. exam_attempts - a driver's attempt at an exam (score, pass/fail, answers JSON)
19. certificates - generated certificates for passed exams
20. notifications - in-app notification log (email/sms/push stubs)
21. audit_logs - every created/updated/deleted/assigned/completed/failed action
22. system_settings - configurable settings (training frequencies, pass thresholds)

## Security
- RLS enabled on all tables.
- All policies scoped to `authenticated` users (the app requires sign-in).
- profiles.user_id defaults to auth.uid() and is owner-scoped.
- Staff (non-driver roles) can read/write operational tables.
- Drivers see only their own rows.
- audit_logs: staff can read; any authenticated can insert.
*/

-- ============================================================
-- ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('system_admin','ehss_manager','ehss_officer','hr','training_coordinator','branch_manager','driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE driver_status AS ENUM ('active','suspended','resigned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE accident_severity AS ENUM ('none','minor','moderate','major');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE violation_category AS ENUM ('none','under_250','under_1000','over_1000');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE warning_category AS ENUM ('none','one','two','more_than_two');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE behaviour_rating AS ENUM ('excellent','good','average','poor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE driver_rating_band AS ENUM ('D1','D2','D3','D4');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE training_status AS ENUM ('assigned','in_progress','completed','expired','overdue','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE training_frequency AS ENUM ('annual','quarterly','monthly','bimonthly','manual','system_selected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE material_type AS ENUM ('pdf','powerpoint','video','audio','image');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('multiple_choice','true_false','multiple_select');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE difficulty_level AS ENUM ('easy','medium','hard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('email','sms','push','in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM ('create','update','delete','assign','complete','fail_exam','training_change','status_change','login');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- BRANCHES & PLANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  manager_name text,
  location text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  description text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- PROFILES (auth.users -> app role)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  user_id uuid UNIQUE NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role user_role NOT NULL DEFAULT 'driver',
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  driver_id uuid,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL UNIQUE,
  full_name text NOT NULL,
  nationality text,
  gender text,
  date_of_birth date,
  email text,
  mobile text,
  experience_years int DEFAULT 0,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  truck_number text,
  equipment_number text,
  supervisor text,
  plant_id uuid REFERENCES plants(id) ON DELETE SET NULL,
  status driver_status NOT NULL DEFAULT 'active',
  photo_url text,
  annual_training_frequency_months int NOT NULL DEFAULT 12,
  next_annual_training_date date,
  last_rating_score numeric DEFAULT 0,
  last_rating_band driver_rating_band DEFAULT 'D3',
  last_risk_level text DEFAULT 'Medium',
  hire_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_drivers_branch ON drivers(branch_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_rating_band ON drivers(last_rating_band);
CREATE INDEX IF NOT EXISTS idx_drivers_employee_id ON drivers(employee_id);

CREATE TABLE IF NOT EXISTS driver_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  uploaded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_driver_documents_driver ON driver_documents(driver_id);

-- ============================================================
-- PERFORMANCE DATA
-- ============================================================
CREATE TABLE IF NOT EXISTS accidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  accident_date date NOT NULL DEFAULT CURRENT_DATE,
  severity accident_severity NOT NULL DEFAULT 'none',
  type text,
  description text,
  root_cause text,
  recommended_training text,
  document_url text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_accidents_driver ON accidents(driver_id);
CREATE INDEX IF NOT EXISTS idx_accidents_date ON accidents(accident_date);

CREATE TABLE IF NOT EXISTS violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  violation_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric DEFAULT 0,
  category violation_category NOT NULL DEFAULT 'none',
  description text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_violations_driver ON violations(driver_id);
CREATE INDEX IF NOT EXISTS idx_violations_date ON violations(violation_date);

CREATE TABLE IF NOT EXISTS safety_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  warning_date date NOT NULL DEFAULT CURRENT_DATE,
  category warning_category NOT NULL DEFAULT 'none',
  description text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warnings_driver ON safety_warnings(driver_id);

CREATE TABLE IF NOT EXISTS behaviour_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  assessment_date date NOT NULL DEFAULT CURRENT_DATE,
  rating behaviour_rating NOT NULL DEFAULT 'average',
  evaluator text,
  comments text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_behaviour_driver ON behaviour_assessments(driver_id);

CREATE TABLE IF NOT EXISTS driver_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  score numeric NOT NULL DEFAULT 0,
  rating driver_rating_band NOT NULL DEFAULT 'D3',
  risk_level text NOT NULL DEFAULT 'Medium',
  accident_score int DEFAULT 0,
  violation_score int DEFAULT 0,
  warning_score int DEFAULT 0,
  behaviour_score int DEFAULT 0,
  computed_at timestamptz DEFAULT now(),
  UNIQUE (driver_id)
);

-- ============================================================
-- TRAINING LIBRARY
-- ============================================================
CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  duration_hours int DEFAULT 1,
  language text DEFAULT 'English',
  category text,
  frequency training_frequency NOT NULL DEFAULT 'annual',
  trainer text,
  pass_percentage int NOT NULL DEFAULT 70,
  is_mandatory boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);

CREATE TABLE IF NOT EXISTS plant_courses (
  plant_id uuid NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (plant_id, course_id)
);

CREATE TABLE IF NOT EXISTS training_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  material_type material_type NOT NULL DEFAULT 'pdf',
  language text DEFAULT 'English',
  file_url text NOT NULL,
  version int NOT NULL DEFAULT 1,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_materials_course ON training_materials(course_id);

CREATE TABLE IF NOT EXISTS trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status training_status NOT NULL DEFAULT 'assigned',
  assigned_date timestamptz DEFAULT now(),
  due_date date,
  completed_date date,
  score int,
  source text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trainings_driver ON trainings(driver_id);
CREATE INDEX IF NOT EXISTS idx_trainings_status ON trainings(status);
CREATE INDEX IF NOT EXISTS idx_trainings_course ON trainings(course_id);
CREATE INDEX IF NOT EXISTS idx_trainings_due ON trainings(due_date);

-- ============================================================
-- EXAMS & QUESTION BANK
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  question_text text NOT NULL,
  question_type question_type NOT NULL DEFAULT 'multiple_choice',
  category text,
  difficulty difficulty_level NOT NULL DEFAULT 'medium',
  options jsonb NOT NULL DEFAULT '[]',
  correct_answers jsonb NOT NULL DEFAULT '[]',
  explanation text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questions_course ON questions(course_id);

CREATE TABLE IF NOT EXISTS exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  time_limit_minutes int DEFAULT 30,
  pass_percentage int NOT NULL DEFAULT 70,
  randomize_questions boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);

CREATE TABLE IF NOT EXISTS exam_questions (
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position int DEFAULT 0,
  PRIMARY KEY (exam_id, question_id)
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  training_id uuid REFERENCES trainings(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  score int NOT NULL DEFAULT 0,
  total_questions int NOT NULL DEFAULT 0,
  correct_answers int NOT NULL DEFAULT 0,
  percentage numeric NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  answers jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attempts_driver ON exam_attempts(driver_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON exam_attempts(exam_id);

CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  exam_attempt_id uuid REFERENCES exam_attempts(id) ON DELETE SET NULL,
  certificate_number text NOT NULL UNIQUE,
  issued_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_certificates_driver ON certificates(driver_id);

-- ============================================================
-- NOTIFICATIONS & AUDIT
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES drivers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'in_app',
  title text NOT NULL,
  body text,
  sent_at timestamptz DEFAULT now(),
  is_read boolean DEFAULT false,
  meta jsonb DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_driver ON notifications(driver_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action audit_action NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  description text,
  meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS system_settings (
  id int PRIMARY KEY DEFAULT 1,
  annual_training_months int NOT NULL DEFAULT 12,
  d2_training_months int NOT NULL DEFAULT 1,
  d3_training_months int NOT NULL DEFAULT 1,
  d4_training_months int NOT NULL DEFAULT 1,
  exam_pass_percentage int NOT NULL DEFAULT 70,
  exam_interval_months int NOT NULL DEFAULT 2,
  d3_improvement_months int NOT NULL DEFAULT 2,
  safety_award_enabled boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO system_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS ENABLE
-- ============================================================
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE plant_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE accidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_own_or_staff" ON profiles;
CREATE POLICY "profiles_select_own_or_staff" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "branches_read" ON branches;
CREATE POLICY "branches_read" ON branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "branches_write" ON branches;
CREATE POLICY "branches_write" ON branches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager')));

DROP POLICY IF EXISTS "plants_read" ON plants;
CREATE POLICY "plants_read" ON plants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "plants_write" ON plants;
CREATE POLICY "plants_write" ON plants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')));

DROP POLICY IF EXISTS "plant_courses_read" ON plant_courses;
CREATE POLICY "plant_courses_read" ON plant_courses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "plant_courses_write" ON plant_courses;
CREATE POLICY "plant_courses_write" ON plant_courses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')));

DROP POLICY IF EXISTS "drivers_select" ON drivers;
CREATE POLICY "drivers_select" ON drivers FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = drivers.id)
  );
DROP POLICY IF EXISTS "drivers_insert_staff" ON drivers;
CREATE POLICY "drivers_insert_staff" ON drivers FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','hr','training_coordinator'))
  );
DROP POLICY IF EXISTS "drivers_update" ON drivers;
CREATE POLICY "drivers_update" ON drivers FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = drivers.id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = drivers.id)
  );
DROP POLICY IF EXISTS "drivers_delete_staff" ON drivers;
CREATE POLICY "drivers_delete_staff" ON drivers FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager'))
  );

DROP POLICY IF EXISTS "driver_documents_select" ON driver_documents;
CREATE POLICY "driver_documents_select" ON driver_documents FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = driver_documents.driver_id)
  );
DROP POLICY IF EXISTS "driver_documents_write" ON driver_documents;
CREATE POLICY "driver_documents_write" ON driver_documents FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );

DROP POLICY IF EXISTS "accidents_select" ON accidents;
CREATE POLICY "accidents_select" ON accidents FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = accidents.driver_id)
  );
DROP POLICY IF EXISTS "accidents_write" ON accidents;
CREATE POLICY "accidents_write" ON accidents FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );

DROP POLICY IF EXISTS "violations_select" ON violations;
CREATE POLICY "violations_select" ON violations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = violations.driver_id)
  );
DROP POLICY IF EXISTS "violations_write" ON violations;
CREATE POLICY "violations_write" ON violations FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );

DROP POLICY IF EXISTS "warnings_select" ON safety_warnings;
CREATE POLICY "warnings_select" ON safety_warnings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = safety_warnings.driver_id)
  );
DROP POLICY IF EXISTS "warnings_write" ON safety_warnings;
CREATE POLICY "warnings_write" ON safety_warnings FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );

DROP POLICY IF EXISTS "behaviour_select" ON behaviour_assessments;
CREATE POLICY "behaviour_select" ON behaviour_assessments FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = behaviour_assessments.driver_id)
  );
DROP POLICY IF EXISTS "behaviour_write" ON behaviour_assessments;
CREATE POLICY "behaviour_write" ON behaviour_assessments FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );

DROP POLICY IF EXISTS "driver_ratings_select" ON driver_ratings;
CREATE POLICY "driver_ratings_select" ON driver_ratings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = driver_ratings.driver_id)
  );
DROP POLICY IF EXISTS "driver_ratings_write" ON driver_ratings;
CREATE POLICY "driver_ratings_write" ON driver_ratings FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );

DROP POLICY IF EXISTS "courses_read" ON courses;
CREATE POLICY "courses_read" ON courses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "courses_write" ON courses;
CREATE POLICY "courses_write" ON courses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer','training_coordinator')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer','training_coordinator')));

DROP POLICY IF EXISTS "materials_read" ON training_materials;
CREATE POLICY "materials_read" ON training_materials FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "materials_write" ON training_materials;
CREATE POLICY "materials_write" ON training_materials FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')));

DROP POLICY IF EXISTS "trainings_select" ON trainings;
CREATE POLICY "trainings_select" ON trainings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = trainings.driver_id)
  );
DROP POLICY IF EXISTS "trainings_write" ON trainings;
CREATE POLICY "trainings_write" ON trainings FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );

DROP POLICY IF EXISTS "questions_read" ON questions;
CREATE POLICY "questions_read" ON questions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "questions_write" ON questions;
CREATE POLICY "questions_write" ON questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')));

DROP POLICY IF EXISTS "exams_read" ON exams;
CREATE POLICY "exams_read" ON exams FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "exams_write" ON exams;
CREATE POLICY "exams_write" ON exams FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')));

DROP POLICY IF EXISTS "exam_questions_read" ON exam_questions;
CREATE POLICY "exam_questions_read" ON exam_questions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "exam_questions_write" ON exam_questions;
CREATE POLICY "exam_questions_write" ON exam_questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role IN ('system_admin','ehss_manager','ehss_officer')));

DROP POLICY IF EXISTS "attempts_select" ON exam_attempts;
CREATE POLICY "attempts_select" ON exam_attempts FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = exam_attempts.driver_id)
  );
DROP POLICY IF EXISTS "attempts_insert" ON exam_attempts;
CREATE POLICY "attempts_insert" ON exam_attempts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid())
  );
DROP POLICY IF EXISTS "attempts_update" ON exam_attempts;
CREATE POLICY "attempts_update" ON exam_attempts FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid())
  ) WITH CHECK (true);

DROP POLICY IF EXISTS "certificates_select" ON certificates;
CREATE POLICY "certificates_select" ON certificates FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.driver_id = certificates.driver_id)
  );
DROP POLICY IF EXISTS "certificates_write" ON certificates;
CREATE POLICY "certificates_write" ON certificates FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "audit_select" ON audit_logs;
CREATE POLICY "audit_select" ON audit_logs FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role <> 'driver')
  );
DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "settings_read" ON system_settings;
CREATE POLICY "settings_read" ON system_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "settings_write" ON system_settings;
CREATE POLICY "settings_write" ON system_settings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'system_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role = 'system_admin')
  );

-- ============================================================
-- TRIGGER: auto-create profile on auth user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'driver')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drivers_updated_at ON drivers;
CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
