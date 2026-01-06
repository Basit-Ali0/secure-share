-- Automatic File Cleanup Setup
-- This sets up automatic deletion of expired files using Supabase pg_cron

-- Step 1: Enable pg_cron extension (run this first)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Schedule cleanup to run every hour
-- This will automatically delete expired files
SELECT cron.schedule(
    'cleanup-expired-files',    -- Job name
    '0 * * * *',                -- Every hour at minute 0 (e.g., 1:00, 2:00, 3:00)
    $$SELECT cleanup_expired_files()$$
);

-- Step 3: Verify cron job was created
SELECT * FROM cron.job;

-- Step 4 (Optional): Change schedule to run more frequently (every 15 minutes)
-- SELECT cron.schedule(
--     'cleanup-expired-files',
--     '*/15 * * * *',          -- Every 15 minutes
--     $$SELECT cleanup_expired_files()$$
-- );

-- IMPORTANT NOTES:
-- 1. pg_cron may not be available on Supabase free tier
-- 2. If pg_cron fails, you'll need to run manual cleanup periodically
-- 3. Alternative: Use Supabase Edge Functions with cron trigger
