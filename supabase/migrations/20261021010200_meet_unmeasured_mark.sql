-- Explicit unmeasured appearances retain entered status and are excluded from numeric ranks.
CREATE OR REPLACE FUNCTION public.competition_meet_trial_valid(p_trial jsonb,p_discipline text,p_wind boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE mark text; result text; parts text[]; segment text; value numeric:=0; part_index integer;
BEGIN
 IF jsonb_typeof(p_trial) IS DISTINCT FROM 'object' OR jsonb_typeof(p_trial->'mark') IS DISTINCT FROM 'string' OR jsonb_typeof(p_trial->'wind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_trial->'status') IS DISTINCT FROM 'string' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_trial) k WHERE k NOT IN ('mark','wind','status')) THEN RETURN false; END IF;
 mark:=p_trial->>'mark';result:=p_trial->>'status';
 IF result NOT IN ('pending','valid','foul','pass') OR length(mark)>30 THEN RETURN false; END IF;
 IF result='pending' THEN RETURN mark='' AND p_trial->>'wind'=''; END IF;
 IF mark='-' AND result='valid' THEN RETURN p_trial->>'wind'=''; END IF;
 IF p_discipline='track' AND result<>'valid' THEN RETURN false; END IF;
 IF result<>'valid' AND p_discipline<>'height' THEN RETURN mark='' AND p_trial->>'wind'=''; END IF;
 IF p_discipline='track' THEN
  IF mark !~ '^[0-9]{1,3}(:[0-9]{1,2}){0,2}(\.[0-9]{1,2})?$' THEN RETURN false; END IF;
  parts:=string_to_array(mark,':');
  FOR part_index IN 1..array_length(parts,1) LOOP
   segment:=parts[part_index];
   IF part_index>1 AND segment::numeric>=60 THEN RETURN false; END IF;
   value:=value*60+segment::numeric;
  END LOOP;
 ELSE
  IF mark !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' THEN RETURN false; END IF;
  value:=mark::numeric;
 END IF;
 IF value<=0 THEN RETURN false; END IF;
 RETURN p_trial->>'wind'='' OR (p_wind AND result='valid' AND p_trial->>'wind' ~ '^[+-]?[0-9]{1,2}(\.[0-9])?$');
END $$;
