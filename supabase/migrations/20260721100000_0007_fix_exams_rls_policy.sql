/*
# Fix RLS Write Policies for Exams, Questions, and Exam Questions
Allows all staff roles (system_admin, ehss_manager, ehss_officer, training_coordinator, hr, branch_manager)
to create, update, and manage exams and question banks.
*/

-- ============================================================
-- EXAMS
-- ============================================================
DROP POLICY IF EXISTS "exams_write" ON exams;

CREATE POLICY "exams_write" ON exams FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ============================================================
-- QUESTIONS
-- ============================================================
DROP POLICY IF EXISTS "questions_write" ON questions;

CREATE POLICY "questions_write" ON questions FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ============================================================
-- EXAM_QUESTIONS
-- ============================================================
DROP POLICY IF EXISTS "exam_questions_write" ON exam_questions;

CREATE POLICY "exam_questions_write" ON exam_questions FOR ALL
  TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
