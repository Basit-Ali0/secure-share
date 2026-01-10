# Automatic Cleanup Setup Guide

## ✅ Simple Setup: Supabase Cron + API Endpoint

Since Supabase cron is available in the free tier, we'll use it to automatically call a cleanup API endpoint.

---

## 📋 **Setup Steps**

### **1. Make Sure Server is Running**

Your Express server must be running for cron to work:

```bash
node server/index.js
```

**For production:** Deploy your server and keep it running (Render, Railway, etc.)

---

### **2. Test the Cleanup Endpoint**

Visit or curl:
```
http://localhost:3000/api/cleanup-expired
```

**Expected response:**
```json
{
  "deleted": 5,
  "total_expired": 5,
  "message": "Cleaned up 5 expired files"
}
```

---

### **3. Set Up Supabase Cron**

**A. Go to Supabase SQL Editor**

**B. Run this SQL:**

```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create hourly cleanup job
SELECT cron.schedule(
    'cleanup-expired-files',
    '0 * * * *',  -- Every hour
    $$
    SELECT 
        net.http_get(
            url := 'http://YOUR_SERVER_URL/api/cleanup-expired',
            headers := '{"Content-Type": "application/json"}'::jsonb
        )
    $$
);
```

**C. Replace `YOUR_SERVER_URL`:**
- **Local dev:** `http://localhost:3000` (won't work - cron can't reach localhost)
- **Production:** `https://your-backend.railway.app` or your deployed URL

⚠️ **Important:** For local development, cron won't work because Supabase can't reach `localhost`. You need to:
- Deploy your server to a public URL (Railway, Render, Vercel Serverless)
- OR use ngrok to expose localhost temporarily
- OR run `node scripts/cleanup.js` manually during development

---

### **4. Verify Cron is Running**

```sql
SELECT * FROM cron.job WHERE jobname = 'cleanup-expired-files';
```

Should show your scheduled job.

---

### **5. Check Cron Logs**

```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'cleanup-expired-files')
ORDER BY start_time DESC 
LIMIT 10;
```

Shows when cron last ran and if it succeeded.

---

## 🚀 **Quick Start (Development)**

Since cron can't reach localhost, during development use:

```bash
# Manual cleanup
node scripts/cleanup.js

# OR set up a local cron job (Windows Task Scheduler / macOS crontab)
```

---

## 🌐 **Production Setup**

1. **Deploy your Express server** to Railway/Render/Vercel
2. **Get your public URL** (e.g., `https://secure-share-api.railway.app`)
3. **Update cron job** with your production URL:

```sql
SELECT cron.schedule(
    'cleanup-expired-files',
    '0 * * * *',
    $$
    SELECT 
        net.http_get(
            url := 'https://YOUR-ACTUAL-URL.com/api/cleanup-expired',
            headers := '{"Content-Type": "application/json"}'::jsonb
        )
    $$
);
```

4. **Monitor cron logs** to ensure it's running

---

## 🛠️ **Troubleshooting**

### Cron not running?

```sql
-- Check if extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check cron schedule
SELECT * FROM cron.job;

-- View recent runs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
```

### API endpoint not responding?

- Verify server is running: `curl http://localhost:3000/api/cleanup-expired`
- Check server logs for errors
- Ensure `.env` has Supabase credentials

### Cron can't reach server?

- Server must be publicly accessible
- Use ngrok for local testing: `ngrok http 3000`
- Or deploy to production

---

## 📝 **Alternative: Manual Cron (Local Development)**

If you want automatic cleanup during local development:

**Windows (Task Scheduler):**
1. Open Task Scheduler
2. Create Basic Task
3. Trigger: Daily, repeat every 1 hour
4. Action: Start Program → `node`, Args: `C:\path\to\scripts\cleanup.js`

**macOS/Linux (crontab):**
```bash
# Edit crontab
crontab -e

# Add this line (runs every hour)
0 * * * * cd /path/to/project && node scripts/cleanup.js
```

---

## ✅ **Verification**

After setup:
1. Upload a test file with 1-hour expiry
2. Wait 1+ hour
3. Check if file was auto-deleted
4. View cron logs to confirm it ran

---

**Recommended for Production:**
- Supabase cron + Public server URL
- Monitor cron.job_run_details regularly
- Set up error notifications if cleanup fails
