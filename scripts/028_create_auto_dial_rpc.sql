CREATE OR REPLACE FUNCTION get_next_auto_dial_lead(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead record;
  v_overloaded_agent uuid;
  v_today timestamptz := current_date; 
  v_24h_ago timestamptz := now() - interval '24 hours';
BEGIN
  -- 1. Check own new leads
  SELECT * INTO v_lead FROM leads 
  WHERE assigned_to = p_user_id AND status ILIKE ANY (ARRAY['New Lead', 'new'])
  ORDER BY 
    CASE COALESCE(priority, 'none')
      WHEN 'urgent' THEN 4
      WHEN 'high' THEN 3
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 1
      ELSE 0
    END DESC,
    created_at ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_lead);
  END IF;

  -- 2. Check unassigned new leads
  SELECT * INTO v_lead FROM leads 
  WHERE assigned_to IS NULL AND status ILIKE ANY (ARRAY['New Lead', 'new'])
  ORDER BY 
    CASE COALESCE(priority, 'none')
      WHEN 'urgent' THEN 4
      WHEN 'high' THEN 3
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 1
      ELSE 0
    END DESC,
    created_at ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE leads SET assigned_to = p_user_id WHERE id = v_lead.id;
    v_lead.assigned_to := p_user_id;
    RETURN row_to_json(v_lead);
  END IF;

  -- 3. Steal from overloaded agent (> 5 new leads)
  SELECT assigned_to INTO v_overloaded_agent
  FROM leads
  WHERE status ILIKE ANY (ARRAY['New Lead', 'new']) 
    AND assigned_to IS NOT NULL 
    AND assigned_to != p_user_id
  GROUP BY assigned_to
  HAVING count(*) > 5
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_lead FROM leads
    WHERE assigned_to = v_overloaded_agent AND status ILIKE ANY (ARRAY['New Lead', 'new'])
    ORDER BY 
      CASE COALESCE(priority, 'none')
        WHEN 'urgent' THEN 4
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 0
      END DESC,
      created_at ASC
    LIMIT 1;

    IF FOUND THEN
      UPDATE leads SET assigned_to = p_user_id WHERE id = v_lead.id;
      v_lead.assigned_to := p_user_id;
      RETURN row_to_json(v_lead);
    END IF;
  END IF;

  -- 4. Follow Up / Contacted past due today
  SELECT * INTO v_lead FROM leads 
  WHERE assigned_to = p_user_id 
    AND status ILIKE ANY (ARRAY['Follow Up', 'Contacted', 'follow_up'])
    AND last_contacted < v_today
  ORDER BY 
    CASE COALESCE(priority, 'none')
      WHEN 'urgent' THEN 4
      WHEN 'high' THEN 3
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 1
      ELSE 0
    END DESC,
    last_contacted ASC NULLS FIRST
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_lead);
  END IF;

  -- 5. Not Reachable (with < 4 attempts today)
  SELECT l.* INTO v_lead 
  FROM leads l
  WHERE l.assigned_to = p_user_id AND l.status ILIKE ANY (ARRAY['nr', 'Not Reachable'])
    AND (
      SELECT count(*) FROM call_logs cl WHERE cl.lead_id = l.id AND cl.created_at >= v_today
    ) < 4
  ORDER BY 
    CASE COALESCE(priority, 'none')
      WHEN 'urgent' THEN 4
      WHEN 'high' THEN 3
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 1
      ELSE 0
    END DESC,
    l.last_contacted ASC NULLS FIRST
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_lead);
  END IF;

  -- 6. Interested (not contacted in 24 hours)
  SELECT * INTO v_lead FROM leads 
  WHERE assigned_to = p_user_id 
    AND status ILIKE ANY (ARRAY['Interested', 'interested'])
    AND last_contacted < v_24h_ago
  ORDER BY 
    CASE COALESCE(priority, 'none')
      WHEN 'urgent' THEN 4
      WHEN 'high' THEN 3
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 1
      ELSE 0
    END DESC,
    last_contacted ASC NULLS FIRST
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_lead);
  END IF;

  -- 7. Not Interested / Recycle Pool (past due today)
  SELECT * INTO v_lead FROM leads 
  WHERE assigned_to = p_user_id 
    AND status ILIKE ANY (ARRAY['Not Interested', 'Not_Interested', 'recycle_pool'])
    AND last_contacted < v_today
  ORDER BY 
    CASE COALESCE(priority, 'none')
      WHEN 'urgent' THEN 4
      WHEN 'high' THEN 3
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 1
      ELSE 0
    END DESC,
    last_contacted ASC NULLS FIRST
  LIMIT 1;

  IF FOUND THEN
    RETURN row_to_json(v_lead);
  END IF;

  -- If nothing found, return null
  RETURN NULL;
END;
$$;
