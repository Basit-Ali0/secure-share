-- Streaming Zero-Knowledge Architecture Migration
-- Run this in Supabase SQL Editor

-- Add columns for streaming/chunked uploads
ALTER TABLE files 
ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS storage_backend TEXT DEFAULT 'supabase';

-- Update storage_backend to 'r2' for future uploads
-- (existing files stay on 'supabase')

-- Remove hybrid mode columns (if they exist)
ALTER TABLE files DROP COLUMN IF EXISTS server_key;
ALTER TABLE files DROP COLUMN IF EXISTS encryption_mode;
ALTER TABLE files DROP COLUMN IF EXISTS auth_tag;
ALTER TABLE files DROP COLUMN IF EXISTS iv;

-- The new schema is purely zero-knowledge:
-- Keys are NEVER stored in the database
-- They only exist in the URL fragment

-- Verify the changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'files'
ORDER BY ordinal_position;
