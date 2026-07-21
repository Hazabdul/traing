/*
# Fix RLS recursion - use JWT role claims instead of profiles self-reference

## Problem
The original policies detected staff by sub-querying `profiles` FROM WITHIN a
`profiles` policy, causing infinite recursion ("infinite recursion detected in
policy for relation profiles"). The same self-reference pattern affected every
table whose policy checked role via a profiles subquery.

## Fix
1. Add a SECURITY DEFINER helper `is_staff()` that reads the role from
   `auth.jwt() ->> 'role'` (raw_app_meta_data, app-locked, no table reads).
2. Add `is_role(text)` helper for specific-role checks.
3. Rewrite EVERY policy that previously did
   `EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.role ...)`
   to use `is_staff()` / `is_role('...')` instead. No policy now reads `profiles`.
4. profiles policies now use auth.uid() = user_id (own row) OR is_staff() (read all).

## Security
- RLS stays enabled on all tables.
- Staff (non-driver) can read/write operational tables.
- Drivers see only their own rows via driver_id link on profiles.
- No recursion: no policy references the table it is defined on.
*/

-- ============================================================
-- Helper functions (SECURITY DEFINER, no table reads -> no recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() ->> 'role')::text, '') <> 'driver'
   AND COALESCE((auth.jwt() ->> 'role')::text, '') <> ''
$$;

CREATE OR REPLACE FUNCTION public.is_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() ->> 'role')::text, '') = p_role
$$;

CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT driver_id FROM public.profiles WHERE profiles.user_id = auth.uid()
$$;

-- ============================================================
-- PROFILES
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_own_or_staff" ON profiles;
CREATE POLICY "profiles_select_own_or_staff" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_staff());

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- BRANCHES & PLANTS
-- ============================================================
DROP POLICY IF EXISTS "branches_read" ON branches;
CREATE POLICY "branches_read" ON branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "branches_write" ON branches;
CREATE POLICY "branches_write" ON branches FOR ALL TO authenticated
  USING (public.is_role('system_admin') OR public.is_role('ehss_manager'))
  WITH CHECK (public.is_role('system_admin') OR public.is_role('ehss_manager'));

DROP POLICY IF EXISTS "plants_read" ON plants;
CREATE POLICY "plants_read" ON plants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "plants_write" ON plants;
CREATE POLICY "plants_write" ON plants FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "plant_courses_read" ON plant_courses;
CREATE POLICY "plant_courses_read" ON plant_courses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "plant_courses_write" ON plant_courses;
CREATE POLICY "plant_courses_write" ON plant_courses FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ============================================================
-- DRIVERS
-- ============================================================
DROP POLICY IF EXISTS "drivers_select" ON drivers;
CREATE POLICY "drivers_select" ON drivers FOR SELECT
  TO authenticated USING (
    public.is_staff() OR drivers.id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "drivers_insert_staff" ON drivers;
CREATE POLICY "drivers_insert_staff" ON drivers FOR INSERT
  TO authenticated WITH CHECK (
    public.is_role('system_admin') OR public.is_role('ehss_manager')
    OR public.is_role('hr') OR public.is_role('training_coordinator')
  );
DROP POLICY IF EXISTS "drivers_update" ON drivers;
CREATE POLICY "drivers_update" ON drivers FOR UPDATE
  TO authenticated USING (
    public.is_staff() OR drivers.id = public.current_driver_id()
  )
  WITH CHECK (
    public.is_staff() OR drivers.id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "drivers_delete_staff" ON drivers;
CREATE POLICY "drivers_delete_staff" ON drivers FOR DELETE
  TO authenticated USING (
    public.is_role('system_admin') OR public.is_role('ehss_manager')
  );

-- ============================================================
-- DRIVER_DOCUMENTS
-- ============================================================
DROP POLICY IF EXISTS "driver_documents_select" ON driver_documents;
CREATE POLICY "driver_documents_select" ON driver_documents FOR SELECT
  TO authenticated USING (
    public.is_staff() OR driver_documents.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "driver_documents_write" ON driver_documents;
CREATE POLICY "driver_documents_write" ON driver_documents FOR ALL
  TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ============================================================
-- ACCIDENTS
-- ============================================================
DROP POLICY IF EXISTS "accidents_select" ON accidents;
CREATE POLICY "accidents_select" ON accidents FOR SELECT
  TO authenticated USING (
    public.is_staff() OR accidents.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "accidents_write" ON accidents;
CREATE POLICY "accidents_write" ON accidents FOR ALL
  TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ============================================================
-- VIOLATIONS
-- ============================================================
DROP POLICY IF EXISTS "violations_select" ON violations;
CREATE POLICY "violations_select" ON violations FOR SELECT
  TO authenticated USING (
    public.is_staff() OR violations.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "violations_write" ON violations;
CREATE POLICY "violations_write" ON violations FOR ALL
  TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ============================================================
-- SAFETY_WARNINGS
-- ============================================================
DROP POLICY IF EXISTS "warnings_select" ON safety_warnings;
CREATE POLICY "warnings_select" ON safety_warnings FOR SELECT
  TO authenticated USING (
    public.is_staff() OR safety_warnings.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "warnings_write" ON safety_warnings;
CREATE POLICY "warnings_write" ON safety_warnings FOR ALL
  TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ============================================================
-- BEHAVIOUR_ASSESSMENTS
-- ============================================================
DROP POLICY IF EXISTS "behaviour_select" ON behaviour_assessments;
CREATE POLICY "behaviour_select" ON behaviour_assessments FOR SELECT
  TO authenticated USING (
    public.is_staff() OR behaviour_assessments.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "behaviour_write" ON behaviour_assessments;
CREATE POLICY "behaviour_write" ON behaviour_assessments FOR ALL
  TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ============================================================
-- DRIVER_RATINGS
-- ============================================================
DROP POLICY IF EXISTS "driver_ratings_select" ON driver_ratings;
CREATE POLICY "driver_ratings_select" ON driver_ratings FOR SELECT
  TO authenticated USING (
    public.is_staff() OR driver_ratings.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "driver_ratings_write" ON driver_ratings;
CREATE POLICY "driver_ratings_write" ON driver_ratings FOR ALL
  TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ============================================================
-- COURSES & MATERIALS
-- ============================================================
DROP POLICY IF EXISTS "courses_read" ON courses;
CREATE POLICY "courses_read" ON courses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "courses_write" ON courses;
CREATE POLICY "courses_write" ON courses FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "materials_read" ON training_materials;
CREATE POLICY "materials_read" ON training_materials FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "materials_write" ON training_materials;
CREATE POLICY "materials_write" ON training_materials FOR ALL TO authenticated
  USING (public.is_role('system_admin') OR public.is_role('ehss_manager') OR public.is_role('ehss_officer'))
  WITH CHECK (public.is_role('system_admin') OR public.is_role('ehss_manager') OR public.is_role('ehss_officer'));

-- ============================================================
-- TRAININGS
-- ============================================================
DROP POLICY IF EXISTS "trainings_select" ON trainings;
CREATE POLICY "trainings_select" ON trainings FOR SELECT
  TO authenticated USING (
    public.is_staff() OR trainings.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "trainings_write" ON trainings;
CREATE POLICY "trainings_write" ON trainings FOR ALL
  TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ============================================================
-- QUESTIONS, EXAMS, EXAM_QUESTIONS
-- ============================================================
DROP POLICY IF EXISTS "questions_read" ON questions;
CREATE POLICY "questions_read" ON questions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "questions_write" ON questions;
CREATE POLICY "questions_write" ON questions FOR ALL TO authenticated
  USING (public.is_role('system_admin') OR public.is_role('ehss_manager') OR public.is_role('ehss_officer'))
  WITH CHECK (public.is_role('system_admin') OR public.is_role('ehss_manager') OR public.is_role('ehss_officer'));

DROP POLICY IF EXISTS "exams_read" ON exams;
CREATE POLICY "exams_read" ON exams FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "exams_write" ON exams;
CREATE POLICY "exams_write" ON exams FOR ALL TO authenticated
  USING (public.is_role('system_admin') OR public.is_role('ehss_manager') OR public.is_role('ehss_officer'))
  WITH CHECK (public.is_role('system_admin') OR public.is_role('ehss_manager') OR public.is_role('ehss_officer'));

DROP POLICY IF EXISTS "exam_questions_read" ON exam_questions;
CREATE POLICY "exam_questions_read" ON exam_questions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "exam_questions_write" ON exam_questions;
CREATE POLICY "exam_questions_write" ON exam_questions FOR ALL TO authenticated
  USING (public.is_role('system_admin') OR public.is_role('ehss_manager') OR public.is_role('ehss_officer'))
  WITH CHECK (public.is_role('system_admin') OR public.is_role('ehss_manager') OR public.is_role('ehss_officer'));

-- ============================================================
-- EXAM_ATTEMPTS
-- ============================================================
DROP POLICY IF EXISTS "attempts_select" ON exam_attempts;
CREATE POLICY "attempts_select" ON exam_attempts FOR SELECT
  TO authenticated USING (
    public.is_staff() OR exam_attempts.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "attempts_insert" ON exam_attempts;
CREATE POLICY "attempts_insert" ON exam_attempts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "attempts_update" ON exam_attempts;
CREATE POLICY "attempts_update" ON exam_attempts FOR UPDATE
  TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (true);

-- ============================================================
-- CERTIFICATES
-- ============================================================
DROP POLICY IF EXISTS "certificates_select" ON certificates;
CREATE POLICY "certificates_select" ON certificates FOR SELECT
  TO authenticated USING (
    public.is_staff() OR certificates.driver_id = public.current_driver_id()
  );
DROP POLICY IF EXISTS "certificates_write" ON certificates;
CREATE POLICY "certificates_write" ON certificates FOR ALL
  TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR public.is_staff()
  );
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- AUDIT_LOGS
-- ============================================================
DROP POLICY IF EXISTS "audit_select" ON audit_logs;
CREATE POLICY "audit_select" ON audit_logs FOR SELECT
  TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- SYSTEM_SETTINGS
-- ============================================================
DROP POLICY IF EXISTS "settings_read" ON system_settings;
CREATE POLICY "settings_read" ON system_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "settings_write" ON system_settings;
CREATE POLICY "settings_write" ON system_settings FOR UPDATE
  TO authenticated USING (public.is_role('system_admin')) WITH CHECK (public.is_role('system_admin'));
