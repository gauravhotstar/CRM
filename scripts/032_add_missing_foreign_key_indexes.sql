-- Missing indexes on foreign keys that reference 'leads(id)'
-- Without these, deleting leads causes full table scans on these tables, leading to timeouts.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_lead_id ON public.notifications(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_lead_id ON public.chat_messages(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_lead_id ON public.audit_logs(lead_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_automation_logs_lead_id ON public.automation_logs(lead_id);

-- Also add an index for sender_id just in case, though usually this is user_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_tenant_id ON public.chat_messages(tenant_id);
