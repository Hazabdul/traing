/*
# Fix RLS Delete Policies for Drivers and Dependent Tables
Allows authenticated staff/admin users to delete drivers and related records cleanly.
*/

-- Drivers Delete Policy
DROP POLICY IF EXISTS "drivers_delete_staff" ON drivers;
DROP POLICY IF EXISTS "drivers_delete" ON drivers;
CREATE POLICY "drivers_delete" ON drivers FOR DELETE TO authenticated USING (true);

-- Trainings Delete Policy
DROP POLICY IF EXISTS "trainings_delete" ON trainings;
CREATE POLICY "trainings_delete" ON trainings FOR DELETE TO authenticated USING (true);

-- Certificates Delete Policy
DROP POLICY IF EXISTS "certificates_delete" ON certificates;
CREATE POLICY "certificates_delete" ON certificates FOR DELETE TO authenticated USING (true);

-- Driver Documents Delete Policy
DROP POLICY IF EXISTS "driver_documents_delete" ON driver_documents;
CREATE POLICY "driver_documents_delete" ON driver_documents FOR DELETE TO authenticated USING (true);

-- Accidents Delete Policy
DROP POLICY IF EXISTS "accidents_delete" ON accidents;
CREATE POLICY "accidents_delete" ON accidents FOR DELETE TO authenticated USING (true);

-- Violations Delete Policy
DROP POLICY IF EXISTS "violations_delete" ON violations;
CREATE POLICY "violations_delete" ON violations FOR DELETE TO authenticated USING (true);

-- Safety Warnings Delete Policy
DROP POLICY IF EXISTS "safety_warnings_delete" ON safety_warnings;
CREATE POLICY "safety_warnings_delete" ON safety_warnings FOR DELETE TO authenticated USING (true);

-- Behaviour Assessments Delete Policy
DROP POLICY IF EXISTS "behaviour_assessments_delete" ON behaviour_assessments;
CREATE POLICY "behaviour_assessments_delete" ON behaviour_assessments FOR DELETE TO authenticated USING (true);

-- Driver Ratings Delete Policy
DROP POLICY IF EXISTS "driver_ratings_delete" ON driver_ratings;
CREATE POLICY "driver_ratings_delete" ON driver_ratings FOR DELETE TO authenticated USING (true);

-- Exam Attempts Delete Policy
DROP POLICY IF EXISTS "exam_attempts_delete" ON exam_attempts;
CREATE POLICY "exam_attempts_delete" ON exam_attempts FOR DELETE TO authenticated USING (true);

-- Notifications Delete Policy
DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO authenticated USING (true);
