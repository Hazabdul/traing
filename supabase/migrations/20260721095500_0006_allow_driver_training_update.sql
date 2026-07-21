/*
# Fix RLS Policy for Trainings Table
Allows drivers to update their own training records when completing or failing exams,
while staff retain full write access.
*/

DROP POLICY IF EXISTS "trainings_write" ON trainings;

CREATE POLICY "trainings_write" ON trainings FOR ALL
  TO authenticated
  USING (
    public.is_staff() OR trainings.driver_id = public.current_driver_id()
  )
  WITH CHECK (
    public.is_staff() OR trainings.driver_id = public.current_driver_id()
  );
