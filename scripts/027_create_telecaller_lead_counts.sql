-- Function to get all 5 dashboard counts in a single RPC
CREATE OR REPLACE FUNCTION get_telecaller_lead_counts(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total int;
  v_new int;
  v_contacted int;
  v_login int;
  v_disbursed int;
BEGIN
  -- Total
  SELECT count(*) INTO v_total FROM leads WHERE assigned_to = p_user_id;
  
  -- New
  SELECT count(*) INTO v_new FROM leads 
  WHERE assigned_to = p_user_id AND status IN ('new', 'New Lead', 'New', 'NEW', 'new lead');
  
  -- Contacted
  SELECT count(*) INTO v_contacted FROM leads 
  WHERE assigned_to = p_user_id AND status IN ('contacted', 'Contacted', 'Interested', 'interested');
  
  -- Login
  SELECT count(*) INTO v_login FROM leads 
  WHERE assigned_to = p_user_id AND status IN ('login', 'Login', 'login done', 'Login Done');
  
  -- Disbursed
  SELECT count(*) INTO v_disbursed FROM leads 
  WHERE assigned_to = p_user_id AND status IN ('disbursed', 'Disbursed', 'converted', 'Converted');
  
  RETURN json_build_object(
    'total', v_total,
    'new', v_new,
    'contacted', v_contacted,
    'login', v_login,
    'disbursed', v_disbursed
  );
END;
$$;
