-- Add cloudconnect_enabled column to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS cloudconnect_enabled boolean DEFAULT false;

-- Allow team admins to update this flag for their team members
-- (Assuming they have permissions to update users in their tenant)
