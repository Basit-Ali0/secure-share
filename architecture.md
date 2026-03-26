# Current Architecture

This document describes the implemented architecture in the current codebase.

## System Shape

- React + Vite frontend
- Express backend
- Cloudflare R2 for encrypted file storage
- Supabase for metadata and server-side authorization state
- Web Workers for chunk encryption/decryption

## Upload Flow

1. `HomePage` creates a UUID `fileId`.
2. The browser generates an AES-256-GCM key and IV.
3. `streamingEncryption.js` chunks the file and encrypts each chunk through the worker pool.
4. The frontend asks the backend for presigned upload URLs:
   - simple upload for small files
   - multipart upload for larger files
5. Encrypted chunks are uploaded directly to R2.
6. The frontend calls `POST /api/files/metadata` to store metadata in Supabase.
7. The backend creates a `short_id` and stores optional `max_downloads` and `password_hash`.
8. The frontend builds a share URL:
   - `/s/:shortId#key=...&iv=...` when available
   - fallback `/share/:fileId#key=...&iv=...`

## Download Flow

1. The browser loads `/share/:fileId` or `/s/:shortId`.
2. The frontend fetches `GET /api/files/:identifier`.
3. If the file is password-protected, the backend returns only minimal locked metadata.
4. The user unlocks with `POST /api/files/:identifier/unlock`.
5. The frontend requests `POST /api/files/:identifier/authorize-download`.
6. The backend:
   - resolves UUID or short ID
   - checks expiry
   - validates password if required
   - atomically reserves a download slot through the Supabase RPC
   - returns a presigned R2 download URL
7. The browser downloads encrypted data from R2 and decrypts it locally.

## Security Notes

- The decryption key and IV live only in the URL fragment.
- Password protection is additive; it does not replace zero-knowledge encryption.
- Download limits are enforced at authorization time, not after client-reported completion.
- Exhausted-file deletion is delayed best-effort cleanup.

## Current Constraints

- Multiple file upload is not implemented yet.
- No browser E2E automation yet.
- External services are not exercised by the automated test suite; tests use mocks.
