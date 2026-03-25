# Phase 2 Setup Guide - Zero-Knowledge Architecture

## ⚠️ IMPORTANT: Manual Steps Required

Before the upload functionality will work, you need to set up Supabase database and storage.

---

## Step 1: Create Supabase Account (if not done)

1. Go to [supabase.com](https://supabase.com)
2. Sign up for free account
3. Create a new project
4. Note your project credentials

---

## Step 2: Set Up Environment Variables

1. Copy `.env.example` to `.env`
2. Fill in your Supabase credentials:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

3. Find these in: **Project Settings → API**

---

## Step 3: Create Database Schema

1. Go to Supabase Dashboard
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy the contents of `supabase-schema.sql`
5. Paste and click **Run**

This creates:
- `files` table for metadata
- `encrypted-files` storage bucket
- Storage policies for upload/download
- Helper functions for cleanup

---

## Step 4: Create Storage Bucket

The SQL schema creates it automatically, but verify:

1. Go to **Storage** in Supabase dashboard
2. You should see `encrypted-files` bucket
3. If not, create it manually:
   - Name: `encrypted-files`
   - Public: **No** (private)

---

## Step 5: Test the Upload Flow

1. Restart your dev server:
   ```bash
   npm run dev
   ```

2. Upload a small file (< 10MB for testing)
3. Check Supabase dashboard:
   - **Table Editor → files**: Should see metadata
   - **Storage → encrypted-files**: Should see encrypted blob

---

## How It Works (Zero-Knowledge)

```
User Browser:
1. Select file
2. Encrypt with AES-256-GCM (Web Crypto API)
3. Generate random key + IV
4. Upload encrypted blob to Supabase Storage
5. Save metadata to database (NO keys!)
6. Get share URL with key in fragment

Share URL Format:
https://yourapp.com/share/abc123#key=xyz&iv=123

Server NEVER sees:
❌ Encryption keys
❌ Original file content
❌ Decrypted data

Server ONLY stores:
✅ Encrypted blob (unreadable)
✅ Metadata (name, size, expiry)
```

---

## Troubleshooting

### Error: "Missing Supabase credentials"
- Check `.env` file exists
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
- Restart dev server after adding .env

### Error: "relation 'files' does not exist"
- Run the SQL schema in Supabase SQL Editor
- Check **Table Editor** to verify tables exist

### Error: "bucket 'encrypted-files' not found"
- Check **Storage** section in Supabase
- Create bucket manually if needed

### Upload succeeds but no data in dashboard
- Check browser console for errors
- Verify storage policies are created
- Check RLS (Row Level Security) is not blocking

---

## Next Steps

After successful setup:
1. Test file upload
2. Verify encrypted blob in storage
3. Test download flow
4. Ready for Phase 3!

---

**Questions?** Let me know if you hit any issues! 🚀
