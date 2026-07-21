/*
# Fix RLS Write Policies for Exams, Questions, and Exam Questions
Allows all authenticated users to write/manage exams and question banks.
This eliminates 42501 RLS policy errors when creating or editing exams in the app.
*/

-- ============================================================
-- EXAMS
-- ============================================================
DROP POLICY IF EXISTS "exams_write" ON exams;

CREATE POLICY "exams_write" ON exams FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- QUESTIONS
-- ============================================================
DROP POLICY IF EXISTS "questions_write" ON questions;

CREATE POLICY "questions_write" ON questions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- EXAM_QUESTIONS
-- ============================================================
DROP POLICY IF EXISTS "exam_questions_write" ON exam_questions;

CREATE POLICY "exam_questions_write" ON exam_questions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
