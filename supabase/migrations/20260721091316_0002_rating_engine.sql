/*
# Driver Rating Engine - recompute function

Adds a SQL function `recompute_driver_rating(driver_uuid)` that:
1. Reads the most-recent accident severity, violation category, warning category, and behaviour rating for a driver.
2. Applies the weighted scoring matrix (Accident 35/30/25/20, Violation 25/20/10/5, Warning 20/15/10/5, Behaviour 20/15/10/5).
3. Computes total score, rating band (D1/D2/D3/D4), and risk level.
4. Upserts into driver_ratings and updates drivers.last_rating_* columns.

Note: warning category is derived from the COUNT of warnings (none / one / two / >2).
This makes the rating engine available to the app and to background schedulers via RPC.
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
  -- Most recent accident severity
  SELECT severity INTO v_accident
  FROM accidents WHERE driver_id = p_driver_id
  ORDER BY accident_date DESC, created_at DESC LIMIT 1;
  IF v_accident IS NULL THEN v_accident := 'none'; END IF;

  -- Most recent violation category
  SELECT category INTO v_violation
  FROM violations WHERE driver_id = p_driver_id
  ORDER BY violation_date DESC, created_at DESC LIMIT 1;
  IF v_violation IS NULL THEN v_violation := 'none'; END IF;

  -- Count warnings to derive category
  SELECT COUNT(*) INTO v_warning_count FROM safety_warnings WHERE driver_id = p_driver_id;
  IF v_warning_count = 0 THEN v_warning_cat := 'none';
  ELSIF v_warning_count = 1 THEN v_warning_cat := 'one';
  ELSIF v_warning_count = 2 THEN v_warning_cat := 'two';
  ELSE v_warning_cat := 'more_than_two'; END IF;

  -- Most recent behaviour rating
  SELECT rating INTO v_behaviour
  FROM behaviour_assessments WHERE driver_id = p_driver_id
  ORDER BY assessment_date DESC, created_at DESC LIMIT 1;
  IF v_behaviour IS NULL THEN v_behaviour := 'average'; END IF;

  -- Accident scoring
  v_accident_score := CASE v_accident
    WHEN 'none' THEN 35 WHEN 'minor' THEN 30 WHEN 'moderate' THEN 25 WHEN 'major' THEN 20 ELSE 20 END;
  -- Violation scoring
  v_violation_score := CASE v_violation
    WHEN 'none' THEN 25 WHEN 'under_250' THEN 20 WHEN 'under_1000' THEN 10 WHEN 'over_1000' THEN 5 ELSE 25 END;
  -- Warning scoring
  v_warning_score := CASE v_warning_cat
    WHEN 'none' THEN 20 WHEN 'one' THEN 15 WHEN 'two' THEN 10 WHEN 'more_than_two' THEN 5 ELSE 20 END;
  -- Behaviour scoring
  v_behaviour_score := CASE v_behaviour
    WHEN 'excellent' THEN 20 WHEN 'good' THEN 15 WHEN 'average' THEN 10 WHEN 'poor' THEN 5 ELSE 10 END;

  v_total := v_accident_score + v_violation_score + v_warning_score + v_behaviour_score;

  IF v_total >= 90 THEN v_band := 'D1'; v_risk := 'Low';
  ELSIF v_total >= 76 THEN v_band := 'D2'; v_risk := 'Low-Medium';
  ELSIF v_total >= 51 THEN v_band := 'D3'; v_risk := 'Medium-High';
  ELSE v_band := 'D4'; v_risk := 'High'; END IF;

  -- Upsert rating snapshot
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

  -- Update driver snapshot columns
  UPDATE drivers SET last_rating_score = v_total, last_rating_band = v_band, last_risk_level = v_risk
  WHERE id = p_driver_id;

  RETURN QUERY SELECT v_total, v_band, v_risk;
END;
$$;
