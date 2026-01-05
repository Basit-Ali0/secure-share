# Hybrid Encryption Mode - Setup Guide

## What You Need to Do Manually

### 1. Update Supabase Database Schema

Run the migration SQL in Supabase SQL Editor:

**File:** `supabase-hybrid-migration.sql`

This adds columns for:
- `encryption_mode` (zero-knowledge or hybrid)
- `server_key` (encrypted server key for hybrid)
- `iv` (initialization vector)
- `auth_tag` (GCM authentication tag)

### 2. Add Environment Variable

Add to your `.env` file:

```bash
# Encryption master key (generate a random 32+ character string)
ENCRYPTION_MASTER_KEY=your-very-secure-random-master-key-here-min-32-chars
```

**Generate a secure key:**
```bash
# In Node.js console or terminal
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Update `saveFileMetadata` Function

In `src/utils/supabase.js`, update the function to include hybrid fields:

```javascript
export async function saveFileMetadata(metadata) {
  const { data, error } = await supabase
    .from('files')
    .insert({
      file_id: metadata.fileId,
      original_name: metadata.originalName,
      file_type: metadata.fileType,
      file_size: metadata.fileSize,
      storage_path: metadata.storagePath,
      expires_at: metadata.expiresAt,
      password_hash: metadata.passwordHash || null,
      max_downloads: metadata.maxDownloads || null,
      encryption_mode: metadata.encryptionMode || 'zero-knowledge',
      server_key: metadata.serverKey || null,
      iv: metadata.iv || null,
      auth_tag: metadata.authTag || null
    })
    .select()
    .single()
  
  if (error) {
    throw new Error(`Failed to save metadata: ${error.message}`)
  }
  
  return data
}
```

### 4. Start the Express Server

```bash
# Start backend server (in one terminal)
node server/index.js

# Start frontend dev server (in another terminal)
npm run dev
```

The backend runs on port 3000, frontend on 5173.

---

## How It Works

### Upload Flow:

**Hybrid Mode (Fast):**
1. User selects file
2. File uploaded to server
3. Server generates server key
4. Server encrypts with client+server combined key
5. Server stores encrypted file
6. Share URL: `/share/id#ck=clientKey`

**Zero-Knowledge Mode (Private):**
1. User selects file
2. Browser encrypts file
3. Upload encrypted blob
4. Share URL: `/share/id#key=encKey&iv=ivValue`

### Download Flow:

**Hybrid Mode:**
1. User visits share link (has client key in URL)
2. Fetch server key from API
3. Combine keys
4. Download and decrypt in browser

**Zero-Knowledge Mode:**
1. User visits share link (has key+IV in URL)
2. Download encrypted blob
3. Decrypt in browser

---

## Testing

1. Upload a file in Hybrid mode
2. Upload a file in Zero-Knowledge mode  
3. Test downloads for both
4. Compare speeds!

You should see Hybrid mode is ~2-3x faster for large files!

---

## Next Steps

After testing, update SharePage to handle hybrid downloads (currently only supports zero-knowledge).
