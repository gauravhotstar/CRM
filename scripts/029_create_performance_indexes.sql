-- Enable pg_trgm extension for fast text search (ILIKE)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Index for Chat Pages (Fixes the 2064ms mean time query)
CREATE INDEX IF NOT EXISTS idx_leads_last_message_at 
ON public.leads (last_message_at DESC NULLS LAST, created_at DESC);

-- 2. Index for Telecaller Dashboard Assigned Queries (Fixes the 40k+ calls query)
CREATE INDEX IF NOT EXISTS idx_leads_assigned_status_created 
ON public.leads (assigned_to, status, created_at DESC);

-- 3. Index for Leads Filtering with Tenant (Fixes the 122ms mean time query)
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status_assigned_created 
ON public.leads (tenant_id, status, assigned_to, created_at);

-- 4. GIN Trigram Indexes for Global Search (Fixes the 7.5s max time ILIKE queries)
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm 
ON public.leads USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_email_trgm 
ON public.leads USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm 
ON public.leads USING gin (phone gin_trgm_ops);
