-- Lightweight System Activity Log for Super Admins
CREATE TABLE IF NOT EXISTS system_activity_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL, -- the super admin who performed the action
    action_type text NOT NULL, -- e.g., 'PROVISION_TENANT', 'SUSPEND_TENANT', 'UPDATE_SETTINGS'
    description text NOT NULL, -- e.g., 'Provisioned new tenant: Acme Corp'
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE system_activity_logs ENABLE ROW LEVEL SECURITY;

-- Only super admins can read the logs. Insertion will be done via service_role bypassing RLS.
CREATE POLICY "Super admins can read system logs" ON system_activity_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'
        )
    );
