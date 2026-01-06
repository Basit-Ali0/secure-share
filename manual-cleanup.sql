-- Manual Cleanup Script (Database Only)
-- Run this in Supabase SQL Editor to delete expired file records
-- Note: Storage files must be cleaned separately using the Node.js script

-- First, preview what will be deleted
SELECT 
    file_id,
    original_name,
    storage_path,
    created_at,
    expires_at,
    CASE 
        WHEN expires_at < NOW() THEN 'EXPIRED ❌'
        ELSE 'ACTIVE ✅'
    END as status
FROM files
ORDER BY expires_at;

-- Delete expired files from database
DELETE FROM files
WHERE expires_at < NOW();

-- Verify cleanup (should show 0 expired files)
SELECT 
    COUNT(*) as total_files,
    COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_files,
    COUNT(CASE WHEN expires_at >= NOW() THEN 1 END) as active_files
FROM files;
