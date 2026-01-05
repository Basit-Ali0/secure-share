-- Add hybrid encryption fields to files table
ALTER TABLE files 
ADD COLUMN encryption_mode TEXT DEFAULT 'zero-knowledge',
ADD COLUMN server_key TEXT,  -- Encrypted server key (for hybrid mode)
ADD COLUMN iv TEXT,           -- IV for encryption
ADD COLUMN auth_tag TEXT;     -- Auth tag for GCM

-- Add index for encryption mode queries
CREATE INDEX IF NOT EXISTS idx_encryption_mode ON files(encryption_mode);

-- Update comment
COMMENT ON COLUMN files.encryption_mode IS 'Encryption mode: zero-knowledge or hybrid';
COMMENT ON COLUMN files.server_key IS 'Encrypted server key (hybrid mode only)';
COMMENT ON COLUMN files.iv IS 'Initialization vector';
COMMENT ON COLUMN files.auth_tag IS 'GCM authentication tag';
