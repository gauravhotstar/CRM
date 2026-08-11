-- Add cloudconnect_uuid column to call_logs table
ALTER TABLE public.call_logs
ADD COLUMN IF NOT EXISTS cloudconnect_uuid text UNIQUE;

-- Create an index for faster lookups when webhooks arrive
CREATE INDEX IF NOT EXISTS idx_call_logs_cloudconnect_uuid ON public.call_logs(cloudconnect_uuid);
