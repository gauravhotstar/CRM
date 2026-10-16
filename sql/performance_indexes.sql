-- Performance Indexes for High-Volume CRM Queries
-- Optimizes tenant-scoped queries, lead filtering, call logs, IVR requests, and chat messaging.

CREATE INDEX IF NOT EXISTS idx_leads_tenant_status_created ON leads (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_created_user ON call_logs (tenant_id, created_at DESC, user_id);
CREATE INDEX IF NOT EXISTS idx_ivr_upload_requests_tenant_status ON ivr_upload_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_lead_type_created ON chat_messages (lead_id, message_type, created_at DESC);
