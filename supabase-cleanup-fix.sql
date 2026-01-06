-- Updated cleanup function that works with Supabase
-- This version only deletes database records
-- Storage files need to be cleaned separately

CREATE OR REPLACE FUNCTION cleanup_expired_files()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
  deleted_rows INTEGER;
BEGIN
  -- Delete expired files from database only
  -- Storage cleanup must be done via client API
  DELETE FROM files
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  
  RETURN QUERY SELECT deleted_rows;
END;
$$ LANGUAGE plpgsql;

-- Run cleanup now
SELECT * FROM cleanup_expired_files();
