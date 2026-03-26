# Streaming + R2 Setup

This guide covers only the current streaming encryption and Cloudflare R2 setup.

## What the Current App Uses

- Web Workers for chunk encryption/decryption
- Cloudflare R2 for encrypted blob storage
- Express endpoints for presigned upload/download authorization
- Supabase for metadata and download authorization state

## Required Environment Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
PORT=3000
CLEANUP_SECRET=
```

## Cloudflare R2 Setup

1. Create an R2 bucket.
2. Create an R2 API token with object read/write access for that bucket.
3. Add the credentials to `.env`.

Recommended local bucket CORS:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

`ETag` must be exposed for multipart upload completion.

## Supabase Setup

Run the tracked SQL scripts that match the current app:

- `scripts/phase1_link_shortening.sql`
- `scripts/phase2_download_limits.sql`
- `scripts/phase3_password_protection.sql`

## Local Startup

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run server
```

Or both:

```bash
npm run dev:full
```

## What to Verify Manually

- small-file upload succeeds
- multipart upload succeeds
- R2 returns `ETag` headers for uploaded parts
- a new share link includes `/s/:shortId`
- password-protected links require unlock
- limited links stop authorizing once exhausted

## Notes

- The current backend no longer supports hybrid mode.
- The current download flow no longer exposes a public direct-download endpoint to the client.
- Browser-side decryption is still the source of truth for plaintext recovery.
