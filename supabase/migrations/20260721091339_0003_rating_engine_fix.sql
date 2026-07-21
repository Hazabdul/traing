/*
# Fix rating engine - disambiguate column references

Fixes ambiguous column reference in recompute_driver_rating by qualifying
all column reads with their table name. No schema/data changes.
*/

CREATE OR REPLACE FUNCTION public.recompute_driver_rating(p_driver_id uuid)
RETURNS TABLE (score numeric, rating driver_rating_band, risk_level text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accident accident_severity;
  v_violation violation_category;
  v_warning_cat warning_category;
  v_behaviour behaviour_rating;
  v_accident_score int;
  v_violation_score int;
  v_warning_score int;
  v_behaviour_score int;
  v_total numeric;
  v_band driver_rating_band;
  v_risk text;
  v_warning_count int;
BEGIN
  SELECT accidents.severity INTO v_accident
  FROM accidents WHERE accidents.driver_id = p_driver_id
  ORDER BY accidents.accident_date DESC, accidents.created_at DESC LIMIT 1;
  IF v_accident IS NULL THEN v_accident := 'none'; END IF;

  SELECT violations.category INTO v_violation
  FROM violations WHERE violations.driver_id = p_driver_id
  ORDER BY violations.violation_date DESC, violations.created_at DESC LIMIT 1;
  IF v_violation IS NULL THEN v_violation := 'none'; END IF;

  SELECT COUNT(*) INTO v_warning_count FROM safety_warnings WHERE safety_warnings.driver_id = p_driver_id;
  IF v_warning_count = 0 THEN v_warning_cat := 'none';
  ELSIF v_warning_count = 1 THEN v_warning_cat := 'one';
  ELSIF v_warning_count = 2 THEN v_warning_cat := 'two';
  ELSE v_warning_cat := 'more_than_two'; END IF;

  SELECT behaviour_assessments.rating INTO v_behaviour
  FROM behaviour_assessments WHERE behaviour_assessments.driver_id = p_driver_id
  ORDER BY behaviour_assessments.assessment_date DESC, behaviour_assessments.created_at DESC LIMIT 1;
  IF v_behaviour IS NULL THEN v_behaviour := 'average'; END IF;

  v_accident_score := CASE v_accident
    WHEN 'none' THEN 35 WHEN 'minor' THEN 30 WHEN 'moderate' THEN 25 WHEN 'major' THEN 20 ELSE 20 END;
  v_violation_score := CASE v_violation
    WHEN 'none' THEN 25 WHEN 'under_250' THEN 20 WHEN 'under_1000' THEN 10 WHEN 'over_1000' THEN 5 ELSE 25 END;
  v_warning_score := CASE v_warning_cat
    WHEN 'none' THEN 20 WHEN 'one' THEN 15 WHEN 'two' THEN 10 WHEN 'more_than_two' THEN 5 ELSE 20 END;
  v_behaviour_score := CASE v_behaviour
    WHEN 'excellent' THEN 20 WHEN 'good' THEN 15 WHEN 'average' THEN 10 WHEN 'poor' THEN 5 ELSE 10 END;

  v_total := v_accident_score + v_violation_score + v_warning_score + v_behaviour_score;

  IF v_total >= 90 THEN v_band := 'D1'; v_risk := 'Low';
  ELSIF v_total >= 76 THEN v_band := 'D2'; v_risk := 'Low-Medium';
  ELSIF v_total >= 51 THEN v_band := 'D3'; v_risk := 'Medium-High';
  ELSE v_band := 'D4'; v_risk := 'High'; END IF;

  INSERT INTO driver_ratings (driver_id, score, rating, risk_level, accident_score, violation_score, warning_score, behaviour_score, computed_at)
  VALUES (p_driver_id, v_total, v_band, v_risk, v_accident_score, v_violation_score, v_warning_score, v_behaviour_score, now())
  ON CONFLICT (driver_id) DO UPDATE SET
    score = EXCLUDED.score,
    rating = EXCLUDED.rating,
    risk_level = EXCLUDED.risk_level,
    accident_score = EXCLUDED.accident_score,
    violation_score = EXCLUDED.violation_score,
    warning_score = EXCLUDED.warning_score,
    behaviour_score = EXCLUDED.behaviour_score,
    computed_at = now();

  UPDATE drivers SET last_rating_score = v_total, last_rating_band = v_band, last_risk_level = v_risk
  WHERE drivers.id = p_driver_id;

  RETURN QUERY SELECT v_total, v_band, v_risk;
END;
$$;
