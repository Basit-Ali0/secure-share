-- Manual Cleanup Script
-- Run this in Supabase SQL Editor to immediately delete all expired files

-- First, show what will be deleted (preview)
SELECT 
    file_id,
    original_name,
    created_at,
    expires_at,
    CASE 
        WHEN expires_at < NOW() THEN 'EXPIRED'
        ELSE 'ACTIVE'
    END as status
FROM files
ORDER BY expires_at;

-- Run the cleanup function to delete expired files
SELECT cleanup_expired_files();

-- Verify cleanup worked (should show only active files)
SELECT COUNT(*) as remaining_files,
       COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_count
FROM files;
