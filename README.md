# MaskedFile

Zero-knowledge encrypted file sharing with browser-side encryption, Cloudflare R2 storage, Supabase metadata, short links, download limits, and password-protected access.

## Current Architecture

MaskedFile encrypts files in the browser before upload. The server never receives plaintext file contents or URL-fragment decryption keys.

Current flow:
1. The browser generates an AES-256-GCM key and IV.
2. The file is chunked and encrypted in Web Workers.
3. The browser uploads encrypted chunks to Cloudflare R2 using presigned URLs issued by the Express backend.
4. The backend stores file metadata in Supabase.
5. The share link contains either `/share/:fileId` or `/s/:shortId`, while the decryption key and IV stay in the URL fragment.
6. Downloads are authorized server-side before a presigned R2 download URL is returned.

### Implemented Features

- Zero-knowledge client-side encryption
- Cloudflare R2 multipart/simple upload support
- Short share links
- Download limits with atomic authorization
- Password-protected share access
- Auto-expiry with cleanup endpoint

### Not Implemented Yet

- Multiple file upload / ZIP packaging
- Automated browser E2E coverage
- Hard transactional deletion of exhausted links

## Routes and APIs

Frontend routes:
- `/`
- `/share/:fileId`
- `/s/:shortId`

Backend routes:
- `POST /api/r2/simple-upload`
- `POST /api/r2/initiate`
- `POST /api/r2/presign-part`
- `POST /api/r2/complete`
- `POST /api/files/metadata`
- `GET /api/files/:identifier`
- `POST /api/files/:identifier/unlock`
- `POST /api/files/:identifier/authorize-download`
- `POST /api/cleanup-expired`
- `GET /api/health`

`identifier` resolves either a UUID `file_id` or a generated `short_id`.

## Security Model

- File contents are encrypted in the browser using AES-256-GCM.
- The decryption key and IV remain in the URL fragment and are never sent to the server.
- Password protection is an additional server-side access gate before download authorization.
- Download authorization is atomic and server-controlled, so download limits cannot be bypassed by calling old direct-download routes.
- Exhausted-file deletion is best-effort delayed cleanup, not a hard transactional delete.

## Data Model

Current `files` metadata includes:
- `file_id`
- `short_id`
- `original_name`
- `file_type`
- `file_size`
- `storage_path`
- `storage_backend`
- `chunk_count`
- `chunk_sizes`
- `expires_at`
- `download_count`
- `max_downloads`
- `password_hash`

The database stores metadata only. The encrypted blob lives in R2.

## Local Development

Install dependencies:

```bash
npm install
```

Start frontend only:

```bash
npm run dev
```

Start backend only:

```bash
npm run server
```

Start both together:

```bash
npm run dev:full
```

Expected local ports:
- frontend: `http://localhost:5173`
- backend: `http://localhost:3000`

## Environment Variables

Current variables used by the app:

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

Notes:
- `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are required by the backend.
- `VITE_SUPABASE_ANON_KEY` is required by the frontend.
- The cleanup endpoint requires `x-cleanup-secret` to match `CLEANUP_SECRET`.

## Manual SQL Steps

Run these tracked scripts in Supabase SQL Editor as needed:

- `scripts/phase1_link_shortening.sql`
- `scripts/phase2_download_limits.sql`
- `scripts/phase3_password_protection.sql`

## Testing

This repo includes automated unit and integration tests for:
- frontend share/upload behavior
- backend metadata and authorization flows

Run all tests:

```bash
npm test
```

Run in watch mode:

```bash
npm run test:watch
```

Run with coverage:

```bash
npm run test:coverage
```

Manual smoke checks are still recommended for:
- real upload/download flows against Supabase + R2
- password-protected share unlock in the browser
- download-limit exhaustion behavior in a real session

## Supporting Docs

- `architecture.md`
- `STREAMING_SETUP.md`
- Historical docs are archived in `docs/archive/`
