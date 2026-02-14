# MaskedFile

Zero-knowledge encrypted file sharing. Files are encrypted in your browser before upload — the server never sees your data.

## Features

- **Zero-knowledge encryption** — AES-256-GCM, client-side only
- **Large file support** — Streaming encrypt/upload/download pipeline (up to 5GB)
- **Auto-expiry** — Files automatically deleted after chosen duration
- **No account required** — Share via link with embedded decryption key
- **Cloudflare R2 storage** — Fast, global file delivery

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, TailwindCSS |
| Backend | Express.js, Node.js |
| Storage | Cloudflare R2 (S3-compatible) |
| Database | Supabase (PostgreSQL) |
| Encryption | Web Crypto API, Web Workers |

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template and fill in your keys
cp .env.example .env

# Start development server (frontend + backend)
npm run start
```

## Deployment

See `render.yaml` for Render deployment config. Set all env vars from `.env.example` in your hosting dashboard.

## License

MIT
