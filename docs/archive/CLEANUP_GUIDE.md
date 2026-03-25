# File Cleanup Guide

## Problem: Test Files Not Being Deleted

Files are stored in Supabase but not automatically deleted when they expire.

---

## 🚀 Quick Fix: Manual Cleanup (Do This Now)

1. **Go to Supabase Dashboard** → SQL Editor
2. **Run this query:**

```sql
SELECT cleanup_expired_files();
```

3. **Verify deletion:**

```sql
SELECT 
    file_id,
    original_name,
    expires_at,
    CASE WHEN expires_at < NOW() THEN 'EXPIRED' ELSE 'ACTIVE' END as status
FROM files;
```

All expired files should be gone!

---

## 🔄 Automatic Cleanup Setup

### Option 1: pg_cron (Recommended if available)

**In Supabase SQL Editor, run:**

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup every hour
SELECT cron.schedule(
    'cleanup-expired-files',
    '0 * * * *',
    $$SELECT cleanup_expired_files()$$
);

-- Verify
SELECT * FROM cron.job;
```

**⚠️ Note:** `pg_cron` may not be available on Supabase free tier. If it fails, use Option 2.

---

### Option 2: Manual Periodic Cleanup

If pg_cron isn't available, you'll need to run cleanup manually or via external scheduler.

**Create a simple cron job on your server:**

```javascript
// cleanup-cron.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

async function cleanupExpiredFiles() {
    const { error } = await supabase.rpc('cleanup_expired_files')
    if (error) {
        console.error('Cleanup failed:', error)
    } else {
        console.log('Cleanup successful!')
    }
}

// Run every hour
setInterval(cleanupExpiredFiles, 60 * 60 * 1000)
cleanupExpiredFiles() // Run immediately on start
```

**Run it:**
```bash
node cleanup-cron.js
```

Keep this running as a background service.

---

### Option 3: Supabase Edge Functions (Alternative)

If you have Edge Functions enabled:

1. Create Edge Function: `supabase functions new cleanup`
2. Add code to call `cleanup_expired_files()`
3. Set up cron trigger in dashboard

---

## 📊 Monitoring Cleanup

**Check when cleanup last ran:**

```sql
SELECT 
    COUNT(*) as total_files,
    COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_files,
    MIN(expires_at) as oldest_expiry
FROM files;
```

If `expired_files > 0`, cleanup hasn't run or failed.

---

## 🧹 Delete All Test Files (Nuclear Option)

**⚠️ WARNING: This deletes EVERYTHING!**

```sql
-- Delete all files from database
DELETE FROM files;

-- Manually delete from Supabase Storage:
-- Go to Storage → encrypted-files → Select All → Delete
```

Use this only for development/testing cleanup!

---

## Best Practice

For production:
- Set up automatic cleanup (pg_cron or Edge Functions)
- Monitor cleanup runs
- Have backup manual cleanup script ready
- Log cleanup operations

For development:
- Run manual cleanup periodically
- Use short expiry times (1 hour) for test files
- Delete test files manually when done testing
