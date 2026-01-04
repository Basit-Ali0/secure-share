-- Create files table for metadata storage
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id TEXT UNIQUE NOT NULL,
  original_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  
  -- Limits & expiry
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  download_count INTEGER DEFAULT 0,
  max_downloads INTEGER,
  
  -- Security (NO ENCRYPTION KEYS - zero-knowledge!)
  password_hash TEXT,
  uploader_ip_hash TEXT,
  
  -- Indexes
  CONSTRAINT idx_file_id UNIQUE (file_id)
);

-- Create index for expires_at for efficient cleanup
CREATE INDEX IF NOT EXISTS idx_expires_at ON files(expires_at);

-- Create storage bucket for encrypted files
INSERT INTO storage.buckets (id, name, public)
VALUES ('encrypted-files', 'encrypted-files', false)
ON CONFLICT DO NOTHING;

-- Storage policy: Allow uploads
CREATE POLICY "Allow uploads"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'encrypted-files');

-- Storage policy: Allow downloads
CREATE POLICY "Allow downloads"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'encrypted-files');

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_download_count(file_id_param TEXT)
RETURNS void AS $$
BEGIN
  UPDATE files
  SET download_count = download_count + 1
  WHERE file_id = file_id_param;
  
  -- Auto-delete if max downloads reached
  DELETE FROM files
  WHERE file_id = file_id_param
    AND max_downloads IS NOT NULL
    AND download_count >= max_downloads;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired files
CREATE OR REPLACE FUNCTION cleanup_expired_files()
RETURNS void AS $$
DECLARE
  expired_file RECORD;
BEGIN
  FOR expired_file IN 
    SELECT file_id, storage_path
    FROM files 
    WHERE expires_at < NOW()
  LOOP
    -- Delete from storage
    PERFORM storage.delete_object('encrypted-files', expired_file.storage_path);
    
    -- Delete from database
    DELETE FROM files WHERE file_id = expired_file.file_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup every hour (requires pg_cron extension)
-- Run this manually if pg_cron is enabled:
-- SELECT cron.schedule('cleanup-expired', '0 * * * *', 'SELECT cleanup_expired_files()');
