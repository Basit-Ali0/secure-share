-- Automatic Cleanup with Supabase Cron
-- This calls your server's cleanup API endpoint every hour

-- Step 1: Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Create cron job to call cleanup endpoint
-- Replace YOUR_SERVER_URL with your actual server URL
-- For local development: http://localhost:3000
-- For production: https://your-domain.com
SELECT cron.schedule(
    'cleanup-expired-files',
    '0 * * * *',  -- Every hour at minute 0
    $$
    SELECT 
        net.http_get(
            url := 'YOUR_SERVER_URL/api/cleanup-expired',
            headers := '{"Content-Type": "application/json"}'::jsonb
        )
    $$
);

-- IMPORTANT: Replace YOUR_SERVER_URL with:
-- Local dev: http://localhost:3000
-- Production: https://your-production-url.com

-- Step 3: Verify cron job was created
SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-files';

-- Step 4 (Optional): Test the endpoint manually first
-- Go to: YOUR_SERVER_URL/api/cleanup-expired
-- Should see: {"deleted": N, "message": "..."}

-- Step 5 (Optional): Change frequency
-- Every 15 minutes:
-- SELECT cron.unschedule('cleanup-expired-files');
-- SELECT cron.schedule(
--     'cleanup-expired-files',
--     '*/15 * * * *',
--     $$ ... same as above ... $$
-- );

-- To remove the cron job:
-- SELECT cron.unschedule('cleanup-expired-files');
