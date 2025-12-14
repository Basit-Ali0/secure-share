## SecureShare Documentation

This repository implements a temporary file-sharing service with server-side storage of encrypted blobs and browser-side decryption.

- **Backend**: Node.js + Express (`server.js`)
- **Frontend**: Static HTML/CSS/JS in `public/`

### Quick start

- **Install**:

```bash
npm install
```

- **Run** (default port `3000`):

```bash
node server.js
```

- **Open**: `http://localhost:3000`

### High-level flow

- **Upload**: Browser uploads a file to `POST /upload` (multipart form-data).
- **Encrypt**: Server encrypts the uploaded file using AES-256-GCM and stores the encrypted file on disk (`uploads/`).
- **Share**: Server returns a share link `GET /share/:fileId`.
- **Download**: Share page fetches metadata and (optionally) decryption material, downloads the encrypted blob from `GET /download/:fileId`, then decrypts in the browser using WebCrypto.

### Security model (important)

- **Encryption keys are generated and stored by the server** in an in-memory `fileStore` (not persisted).
- **Anyone who knows `fileId` can retrieve decryption keys** via `GET /api/fileinfo/:fileId` **unless** the file is password protected.
- **Password protection**: if a password was provided on upload, the server stores a bcrypt hash and only returns keys after a successful `POST /api/verify-password/:fileId`.
- **Not end-to-end encryption**: the server can decrypt files (it has the keys), and keys are delivered from the server to clients.

## Public HTTP API

Base URL examples below assume `http://localhost:3000`.

### `GET /`

Serves the upload UI (`public/index.html`).

- **200**: HTML

### `POST /upload`

Uploads a file, encrypts it on the server, schedules deletion, and returns a share link.

- **Content-Type**: `multipart/form-data`
- **Form fields**:
  - **`file`** (required): file binary
  - **`destroyTimer`** (optional): seconds until deletion; default `86400` (24h)
  - **`password`** (optional): password required to retrieve keys

- **Success response**: `200 application/json`

```json
{ "shareLink": "http://localhost:3000/share/<fileId>" }
```

- **Error responses**:
  - **400**: `{ "message": "No file uploaded." }`
  - **500**: `{ "message": "Failed to process file." }`

#### Example (curl)

```bash
curl -sS -X POST "http://localhost:3000/upload" \
  -F "file=@./example.pdf" \
  -F "destroyTimer=3600" \
  -F "password=optional-secret"
```

### `GET /share/:fileId`

Serves the share/download UI (`public/share.html`) for a given `fileId`.

- **200**: HTML
- **404**: `Share link invalid or expired.` (when `fileId` is unknown to the in-memory store)

#### Example

```bash
curl -i "http://localhost:3000/share/0123456789abcdef0123456789abcdef"
```

### `GET /download/:fileId`

Downloads the encrypted file blob.

- **Success**: `200 application/octet-stream`
  - `Content-Disposition: attachment; filename="<fileId>.enc"`

- **Errors**:
  - **404**: `File not found or expired.`

#### Example

```bash
curl -L "http://localhost:3000/download/<fileId>" -o "<fileId>.enc"
```

### `GET /api/fileinfo/:fileId`

Returns the original filename and whether a password is required. If not password protected, also returns decryption material.

- **Success (password protected)**: `200 application/json`

```json
{ "originalName": "photo.png", "requiresPassword": true }
```

- **Success (not password protected)**: `200 application/json`

```json
{
  "originalName": "photo.png",
  "requiresPassword": false,
  "key": "<hex>",
  "iv": "<hex>",
  "authTag": "<hex>"
}
```

- **Errors**:
  - **404**: `{ "message": "File info not found or expired." }`

#### Example

```bash
curl -sS "http://localhost:3000/api/fileinfo/<fileId>" | jq
```

### `POST /api/verify-password/:fileId`

Verifies the password for a password-protected file and returns decryption material on success.

- **Content-Type**: `application/json`
- **Request body**:

```json
{ "password": "your-password" }
```

- **Success**: `200 application/json`

```json
{ "key": "<hex>", "iv": "<hex>", "authTag": "<hex>" }
```

- **Errors**:
  - **400**: `{ "message": "File is not password protected." }` (if no password was set)
  - **400**: `{ "message": "Password required." }` (missing password)
  - **401**: `{ "message": "Incorrect password." }`
  - **404**: `{ "message": "File not found or expired." }`
  - **500**: `{ "message": "Error verifying password." }`

#### Example

```bash
curl -sS -X POST "http://localhost:3000/api/verify-password/<fileId>" \
  -H "Content-Type: application/json" \
  -d '{"password":"optional-secret"}' | jq
```

## Frontend components and client-side APIs

This project uses plain DOM-based components.

### Upload page (`public/index.html` + `public/js/script.js`)

**Primary elements (public UI “components”)**:

- **Upload form**: `#upload-form`
- **File input**: `#file-input` (hidden; click label in drop area)
- **Drag/drop zone**: `.file-drop-area`
- **Timer select**: `#timer-select` (`destroyTimer` seconds)
- **Optional password**: `#password-input`
- **Submit button**: `#upload-button`
- **Progress bar**: `#upload-progress` (with `.progress-bar-fill`, `.progress-bar-text`)
- **Result area**: `#result-area` + `#share-link` + `#copy-button`
- **Error banner**: `#error-message`

**Client-side functions** (defined in `public/js/script.js`):

- **`displayFileName(file)`**
  - Updates `#file-name-display` with `Selected: <name>`.

- **`showError(message)`**
  - Displays an error in `#error-message`.

**Upload behavior**:

- Submitting the form builds a `FormData` payload containing:
  - `file`, `destroyTimer`, and (if present) `password`
- Uses `XMLHttpRequest` to `POST /upload` to support upload progress events.
- On success, shows `shareLink` in `#share-link`.

**Copy behavior**:

- Clicking **Copy** selects the share link input and calls `document.execCommand('copy')`.

### Share/download page (`public/share.html` inline script)

The share page is responsible for:

- Determining `fileId` from the URL path.
- Calling `GET /api/fileinfo/:fileId`.
  - If `requiresPassword: true`, show password prompt.
  - If `requiresPassword: false`, use returned `key/iv/authTag`.
- Downloading encrypted bytes via `GET /download/:fileId`.
- Decrypting using WebCrypto (`window.crypto.subtle.decrypt`) and triggering a browser download using the original filename.

**Client-side functions** (inline in `public/share.html`):

- **`hexToBuffer(hex)`**
  - Converts a hex string to a `Uint8Array`.

- **`showGeneralError(message)`**
  - Shows an error and hides download/password sections.

- **`showPasswordError(message)`**
  - Shows an error in the password section and re-enables the unlock button.

- **`updateProgress(percentage)`**
  - Updates the decrypt progress UI.

- **`startDownloadAndDecrypt(keyHex, ivHex, authTagHex)`**
  - Downloads `/download/:fileId`, combines ciphertext + auth tag, decrypts via AES-GCM, and triggers the final download.

- **`handlePasswordSubmit()`**
  - Calls `POST /api/verify-password/:fileId` and, on success, calls `startDownloadAndDecrypt(...)`.

- **`initializeSharePage()`**
  - Page bootstrap: fetches file info and wires the correct UI.

## Backend implementation notes (maintainer-facing)

### In-memory store (`fileStore`)

`server.js` maintains an in-memory map:

- Key: `fileId` (hex string)
- Value:
  - `filePath`: encrypted file path on disk (`uploads/<fileId>.enc`)
  - `originalName`: original uploaded filename
  - `job`: scheduled deletion job (node-schedule)
  - `key`, `iv`, `authTag`: hex strings
  - `passwordHash`: bcrypt hash or `null`

**Implications**:

- Restarting the server loses `fileStore`. Existing encrypted files become “orphaned” and will be deleted by `cleanupExpiredFiles()` on startup.

### Helper functions in `server.js`

- **`encryptFile(filePath, key, iv) -> Promise<{ filePath, authTag }>`**
  - Encrypts a file using `aes-256-gcm` and returns the encrypted file path plus the GCM auth tag.

- **`cleanupExpiredFiles()`**
  - On startup, deletes files in `uploads/` not present in `fileStore`.

## Common tasks

### Change default expiry

Update the default in `server.js` where it parses `destroyTimer`:

- `const timerSeconds = parseInt(req.body.destroyTimer, 10) || 86400;`

### Add persistence

To persist share links across restarts:

- Replace `fileStore` with a database table containing: `fileId`, `filePath`, `originalName`, `expiryDate`, `key`, `iv`, `authTag`, `passwordHash`.
- On startup, reload and reschedule deletion jobs.

### Add rate limiting (recommended)

Add rate limiting to:

- `POST /upload`
- `POST /api/verify-password/:fileId`

## Troubleshooting

- **“Share link invalid or expired.”**: server doesn’t have that `fileId` in memory (restart, deletion, or never uploaded).
- **404 on download**: file is missing on disk or expired.
- **Decryption failed**: wrong password (wrong keys), corrupted download, or mismatched auth tag.
