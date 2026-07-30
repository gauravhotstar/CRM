-- Add tenant_id indexes for multi-tenant performance optimization
-- These indexes prevent full table scans when RLS policies evaluate `tenant_id = get_current_tenant_id()`
-- or when admin cron jobs query across specific tenants.

CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON public.leads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_tenant_id ON public.follow_ups (tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_id ON public.call_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_id ON public.attendance (tenant_id);

-- Composite indexes for frequent queries that combine tenant_id with other filters
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON public.leads (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_assigned_to ON public.leads (tenant_id, assigned_to);
