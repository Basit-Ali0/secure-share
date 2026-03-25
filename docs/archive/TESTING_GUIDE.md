# SecureShare - Complete Testing Guide

## ⚠️ About the 50MB Supabase Limit

**What does "Files over 50MB (Supabase limit)" mean?**

Supabase Storage has a **50MB per file upload limit** on their free tier. This means:
- Files under 50MB: ✅ Upload successfully
- Files over 50MB: ❌ Upload will fail with error

**Why this matters:**
- Your 600MB file test will fail because Supabase rejects uploads >50MB
- This is a Supabase limitation, not our app's limitation
- To support larger files, you would need to:
  - Upgrade to Supabase paid tier, OR
  - Implement Tier 3 (Cloudflare R2) which supports up to 5GB

**For now:** Test with files under 50MB only.

---

## 🧪 Complete Testing Checklist

### **Setup (Do This First)**

1. [ ] Run SQL migration in Supabase SQL Editor (`supabase-hybrid-migration.sql`)
2. [ ] Add `ENCRYPTION_MASTER_KEY` to `.env`
3. [ ] Start both servers:
   - Terminal 1: `node server/index.js` (port 3000)
   - Terminal 2: `npm run dev` (port 5173)
4. [ ] Verify no errors in either terminal

---

## 📝 **Test Plan**

### **Test 1: Zero-Knowledge Upload + Download (Small File)**

**File:** Use a 2-5MB image

1. [ ] Open app → Select "Maximum Privacy (Zero-Knowledge)"
2. [ ] Upload the file
3. [ ] Verify:
   - Blue info box appears: "Processing may take time..."
   - Progress: 5% → 35% (encryption) → 80% (upload) → 100%
   - "File Uploaded Successfully!" appears
   - Share URL format: `/share/id#key=xxx&iv=yyy`
4. [ ] Click "Copy Link"
5. [ ] Open link in **incognito window**
6. [ ] Verify:
   - File name, size, upload date correct
   - "Zero-Knowledge Encryption" badge shows
   - Click "Download File"
   - Progress bar animates
   - File downloads
7. [ ] Open downloaded file → Should match original perfectly

---

### **Test 2: Hybrid Upload + Download (Small File)**

**File:** Use a 2-5MB PDF

1. [ ] Open app → Select "Standard (Hybrid Encryption)"
2. [ ] Upload the file
3. [ ] Verify:
   - Upload is noticeably faster (2-3x speed)
   - No encryption info box (upload happens directly)
   - Progress: 20% → 80% (upload) → 100%
   - Share URL format: `/share/id#ck=xxx` (only client key)
4. [ ] Click "Show QR Code"
5. [ ] Verify QR code appears
6. [ ] Click "Copy Link"
7. [ ] Open link in **incognito window**
8. [ ] Verify:
   - File name, size correct
   - "Hybrid Encryption" badge shows
   - Click "Download File"
   - File downloads successfully
9. [ ] Open downloaded file → Should match original

---

### **Test 3: Supabase Database Verification**

Go to Supabase → Table Editor → `files`

1. [ ] Find your zero-knowledge file:
   - `encryption_mode` = "zero-knowledge"
   - `server_key` = NULL
   - `iv` = NULL or empty
   - `auth_tag` = NULL or empty

2. [ ] Find your hybrid file:
   - `encryption_mode` = "hybrid"
   - `server_key` = long hex string (encrypted)
   - `iv` = hex string
   - `auth_tag` = hex string

---

### **Test 4: UI/UX Features**

**Mode Selector:**
1. [ ] Both modes display correctly
2. [ ] "Recommended" badge on Hybrid mode
3. [ ] Clicking switches modes
4. [ ] Speed and Security badges show

**File Preview:**
1. [ ] Select an image → Click "Preview File"
2. [ ] Modal opens with image preview
3. [ ] Close modal works
4. [ ] Try with PDF (should show PDF viewer)

**Expiry Selector:**
1. [ ] All options selectable (1h, 6h, 24h, 7d, 30d)
2. [ ] Selected option highlights
3. [ ] Upload with 1 hour expiry
4. [ ] Check database: `expires_at` should be ~1 hour from now

**QR Code:**
1. [ ] "Show QR Code" button appears after upload
2. [ ] Click toggles QR code visibility
3. [ ] Scan QR with phone camera
4. [ ] Phone opens share link (if on same network)

---

### **Test 5: Speed Comparison**

**Test with 10MB file:**

1. [ ] Upload in Zero-Knowledge mode → Note time
2. [ ] Upload same file in Hybrid mode → Note time
3. [ ] Hybrid should be **2-3x faster**

**Expected times (10MB file):**
- Zero-Knowledge: ~30-60 seconds
- Hybrid: ~10-20 seconds

---

### **Test 6: File Size Warnings**

1. [ ] Try to upload 150MB file
2. [ ] Warning dialog should appear:
   - "Warning: This file is 150MB..."
   - "Files over 50MB may fail..."
3. [ ] If you click "Continue", upload will likely fail at ~50MB

---

### **Test 7: Error Handling**

**Expired File:**
1. [ ] Upload a file with 1 hour expiry
2. [ ] In Supabase, manually set `expires_at` to yesterday
3. [ ] Try to download
4. [ ] Should show "File has expired" error

**Missing Keys:**
1. [ ] Take a share URL Zero-knowledge mode
2. [ ] Remove `#key=...` part from URL
3. [ ] Try to open link
4. [ ] Should show error: "Encryption keys missing"

**Invalid File ID:**
1. [ ] Go to `/share/invalid-id-here`
2. [ ] Should show "File not found" error

---

## ✅ **Success Criteria**

**Minimum to pass:**
- [ ] Zero-knowledge upload works
- [ ] Zero-knowledge download works
- [ ] Hybrid upload works
- [ ] Hybrid download works
- [ ] Database shows correct data for both modes
- [ ] Mode selector switches correctly
- [ ] Both modes complete in reasonable time (<5MB files)

**Bonus (Nice to have):**
- [ ] File preview works for images/PDFs
- [ ] QR codes generate and scan correctly
- [ ] Expiry times save correctly
- [ ] Error messages display properly

---

## 🐛 **Common Issues & Solutions**

**Issue:** Server not starting
- **Solution:** Check `.env` has all required variables

**Issue:** "Missing Supabase credentials"
- **Solution:** Check `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

**Issue:** "Table 'files' does not exist"
- **Solution:** Run `supabase-schema.sql` first, then `supabase-hybrid-migration.sql`

**Issue:** Hybrid upload fails with "404"
- **Solution:** Make sure backend server is running on port 3000

**Issue:** Download says "Decryption failed"
- **Solution:** URL might be corrupted or keys are missing

---

## 📊 **What to Report Back**

Tell me which tests:
1. ✅ Passed
2. ❌ Failed (with error message)
3. ⚠️ Partially worked (describe what happened)

I'll help debug any failures!
