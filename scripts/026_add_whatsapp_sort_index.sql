-- Add composite index for WhatsApp/Chat page sorting
-- This optimizes the query:
-- .order('last_message_at', { ascending: false, nullsFirst: false })
-- .order('created_at', { ascending: false })
-- and prevents RLS timeouts caused by in-memory sorting of all rows.

CREATE INDEX IF NOT EXISTS idx_leads_tenant_last_message_created
ON public.leads (tenant_id, last_message_at DESC NULLS LAST, created_at DESC);
