/**
 * MaskedFile Server - Zero-Knowledge File Sharing API
 * Handles R2 multipart uploads and cleanup
 */

import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
    getPresignedUploadUrl,
    initiateMultipartUpload,
    getPresignedPartUrl,
    completeMultipartUpload,
    getPresignedDownloadUrl,
    deleteObject
} from './r2.js'

dotenv.config()

const app = express()
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SHORT_ID_LENGTH = 8
const EXHAUSTED_FILE_DELETE_DELAY_MS = 60 * 60 * 1000
const scheduledDeletionTimers = new Map()

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || true, // Set CORS_ORIGIN in production
}))
app.use(express.json({ limit: '1mb' }))

// Validate required environment variables
if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY')
    process.exit(1)
}

// Supabase client — uses service_role key (bypasses RLS for server operations)
const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

function isUuid(value) {
    return UUID_REGEX.test(value)
}

function generateShortId(length = SHORT_ID_LENGTH) {
    const randomBytes = crypto.randomBytes(length)
    let shortId = ''

    for (let i = 0; i < length; i++) {
        shortId += SHORT_ID_ALPHABET[randomBytes[i] % SHORT_ID_ALPHABET.length]
    }

    return shortId
}

async function createUniqueShortId(maxAttempts = 5) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const shortId = generateShortId()
        const { data, error } = await supabase
            .from('files')
            .select('short_id')
            .eq('short_id', shortId)
            .maybeSingle()

        if (error) {
            throw new Error(`Failed to validate short ID uniqueness: ${error.message}`)
        }

        if (!data) {
            return shortId
        }
    }

    throw new Error('Failed to generate a unique short ID')
}

async function insertFileMetadataWithShortId(fileRecord, maxAttempts = 5) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const shortId = await createUniqueShortId()
        const { error } = await supabase.from('files').insert({
            ...fileRecord,
            short_id: shortId
        })

        if (!error) {
            return shortId
        }

        if (error.code === '23505' && error.message?.includes('short_id')) {
            continue
        }

        throw new Error(`Failed to save metadata: ${error.message}`)
    }

    throw new Error('Failed to save metadata after retrying short ID generation')
}

async function findFileByIdentifier(identifier, selectClause = '*') {
    const column = isUuid(identifier) ? 'file_id' : 'short_id'

    const { data, error } = await supabase
        .from('files')
        .select(selectClause)
        .eq(column, identifier)
        .single()

    return { data, error }
}

function getRemainingDownloads(file) {
    if (file.max_downloads == null) {
        return null
    }

    return Math.max(file.max_downloads - (file.download_count || 0), 0)
}

function formatMetadataResponse(file) {
    const baseResponse = {
        file_id: file.file_id,
        short_id: file.short_id,
        original_name: file.original_name,
        file_type: file.file_type,
        file_size: file.file_size,
        storage_path: file.storage_path,
        storage_backend: file.storage_backend,
        chunk_count: file.chunk_count,
        chunk_sizes: file.chunk_sizes,
        expires_at: file.expires_at,
        created_at: file.created_at,
        download_count: file.download_count,
        max_downloads: file.max_downloads,
        ...file,
        remaining_downloads: getRemainingDownloads(file),
        is_download_limited: file.max_downloads != null,
        is_password_protected: Boolean(file.password_hash)
    }

    delete baseResponse.password_hash
    return baseResponse
}

function formatProtectedMetadataResponse(file) {
    return {
        file_id: file.file_id,
        short_id: file.short_id,
        expires_at: file.expires_at,
        created_at: file.created_at,
        is_password_protected: true,
        is_download_limited: file.max_downloads != null
    }
}

function normalizeOptionalPassword(password) {
    if (typeof password !== 'string') {
        return null
    }

    const normalizedPassword = password.trim()
    return normalizedPassword.length > 0 ? normalizedPassword : null
}

function scheduleExhaustedFileDeletion(file) {
    if (!file?.file_id || scheduledDeletionTimers.has(file.file_id)) {
        return
    }

    const timer = setTimeout(async () => {
        try {
            if (file.storage_backend === 'r2') {
                await deleteObject(file.storage_path)
            } else {
                await supabase.storage
                    .from('encrypted-files')
                    .remove([file.storage_path])
            }

            const { error } = await supabase
                .from('files')
                .delete()
                .eq('file_id', file.file_id)

            if (error) {
                throw new Error(error.message)
            }

            console.log(`[Download Limit] Deleted exhausted file ${file.file_id}`)
        } catch (error) {
            console.error(`[Download Limit] Failed to delete exhausted file ${file.file_id}:`, error)
        } finally {
            scheduledDeletionTimers.delete(file.file_id)
        }
    }, EXHAUSTED_FILE_DELETE_DELAY_MS)

    if (typeof timer.unref === 'function') {
        timer.unref()
    }

    scheduledDeletionTimers.set(file.file_id, timer)
}

// ============================================
// Health Check
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ============================================
// R2 Upload Endpoints
// ============================================

/**
 * Get presigned URL for simple upload (small files < 5MB)
 * POST /api/r2/simple-upload
 */
app.post('/api/r2/simple-upload', async (req, res) => {
    try {
        const { fileId } = req.body

        if (!fileId) {
            return res.status(400).json({ message: 'fileId required' })
        }

        console.log(`[R2] Simple upload URL for ${fileId}`)

        const result = await getPresignedUploadUrl(fileId)

        res.json(result)

    } catch (error) {
        console.error('[R2 Simple Upload] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

/**
 * Initiate multipart upload (for files >= 5MB)
 * POST /api/r2/initiate
 */
app.post('/api/r2/initiate', async (req, res) => {
    try {
        const { fileId } = req.body

        if (!fileId) {
            return res.status(400).json({ message: 'fileId required' })
        }

        console.log(`[R2] Initiating multipart upload for ${fileId}`)

        const result = await initiateMultipartUpload(fileId)

        res.json(result)

    } catch (error) {
        console.error('[R2 Initiate] Error:', error)
        res.status(500).json({ message: error.message })
    }
})


/**
 * Get presigned URL for part upload
 * POST /api/r2/presign-part
 */
app.post('/api/r2/presign-part', async (req, res) => {
    try {
        const { objectKey, uploadId, partNumber } = req.body

        if (!objectKey || !uploadId || !partNumber) {
            return res.status(400).json({ message: 'objectKey, uploadId, and partNumber required' })
        }

        const result = await getPresignedPartUrl(objectKey, uploadId, partNumber)

        res.json(result)

    } catch (error) {
        console.error('[R2 Presign] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

/**
 * Complete multipart upload
 * POST /api/r2/complete
 */
app.post('/api/r2/complete', async (req, res) => {
    try {
        const { objectKey, uploadId, parts } = req.body

        if (!objectKey || !uploadId || !parts) {
            return res.status(400).json({ message: 'objectKey, uploadId, and parts required' })
        }

        console.log(`[R2] Completing multipart upload for ${objectKey}`)

        const result = await completeMultipartUpload(objectKey, uploadId, parts)

        res.json(result)

    } catch (error) {
        console.error('[R2 Complete] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

/**
 * Legacy direct download endpoint
 * Public clients should use POST /api/files/:identifier/authorize-download instead
 */
app.get('/api/r2/download/*', async (req, res) => {
    res.status(410).json({ message: 'Direct downloads are disabled. Authorize downloads via /api/files/:identifier/authorize-download.' })
})

// ============================================
// File Metadata Endpoints (Supabase)
// ============================================

/**
 * Save file metadata
 * POST /api/files/metadata
 */
app.post('/api/files/metadata', async (req, res) => {
    try {
        const {
            fileId,
            originalName,
            fileType,
            fileSize,
            storagePath,
            storageBackend,
            chunkCount,
            chunkSizes,
            expiresAt,
            maxDownloads,
            password
        } = req.body

        const normalizedPassword = normalizeOptionalPassword(password)
        const passwordHash = normalizedPassword
            ? await bcrypt.hash(normalizedPassword, 10)
            : null

        const shortId = await insertFileMetadataWithShortId({
            file_id: fileId,
            original_name: originalName,
            file_type: fileType,
            file_size: fileSize,
            storage_path: storagePath,
            storage_backend: storageBackend || 'r2',
            chunk_count: chunkCount || 1,
            chunk_sizes: chunkSizes || null,
            expires_at: expiresAt,
            max_downloads: maxDownloads ?? null,
            password_hash: passwordHash
        })

        res.json({ success: true, fileId, shortId })

    } catch (error) {
        console.error('[Metadata Save] Error:', error)
        res.status(500).json({ message: error.message })
    }
})


/**
 * Get file metadata
 * GET /api/files/:identifier
 */
app.get('/api/files/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params

        const { data: metadata, error } = await findFileByIdentifier(identifier)

        if (error || !metadata) {
            return res.status(404).json({ message: 'File not found' })
        }

        // Check if expired
        if (new Date(metadata.expires_at) < new Date()) {
            return res.status(410).json({ message: 'File has expired' })
        }

        if (metadata.password_hash) {
            return res.json(formatProtectedMetadataResponse(metadata))
        }

        res.json(formatMetadataResponse(metadata))

    } catch (error) {
        console.error('[Metadata Get] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

/**
 * Verify password and return full metadata for a protected file.
 * POST /api/files/:identifier/unlock
 */
app.post('/api/files/:identifier/unlock', async (req, res) => {
    try {
        const { identifier } = req.params
        const submittedPassword = normalizeOptionalPassword(req.body?.password)
        const { data: file, error } = await findFileByIdentifier(identifier)

        if (error || !file) {
            return res.status(404).json({ message: 'File not found' })
        }

        if (new Date(file.expires_at) < new Date()) {
            return res.status(410).json({ message: 'File has expired' })
        }

        if (!file.password_hash) {
            return res.json(formatMetadataResponse(file))
        }

        if (!submittedPassword) {
            return res.status(400).json({ message: 'Password is required' })
        }

        const passwordMatches = await bcrypt.compare(submittedPassword, file.password_hash)
        if (!passwordMatches) {
            return res.status(401).json({ message: 'Invalid password' })
        }

        res.json(formatMetadataResponse(file))
    } catch (error) {
        console.error('[Unlock File] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

/**
 * Authorize a download and atomically reserve a download slot.
 * POST /api/files/:identifier/authorize-download
 */
app.post('/api/files/:identifier/authorize-download', async (req, res) => {
    try {
        const { identifier } = req.params
        const { data: file, error } = await findFileByIdentifier(
            identifier,
            'file_id, short_id, storage_path, storage_backend, expires_at, download_count, max_downloads, password_hash'
        )

        if (error || !file) {
            return res.status(404).json({ message: 'File not found' })
        }

        if (new Date(file.expires_at) < new Date()) {
            return res.status(410).json({ message: 'File has expired' })
        }

        const submittedPassword = normalizeOptionalPassword(req.body?.password)
        if (file.password_hash) {
            if (!submittedPassword) {
                return res.status(401).json({ message: 'Password is required' })
            }

            const passwordMatches = await bcrypt.compare(submittedPassword, file.password_hash)
            if (!passwordMatches) {
                return res.status(401).json({ message: 'Invalid password' })
            }
        }

        const { data: reservation, error: reservationError } = await supabase.rpc('authorize_download', {
            file_id_param: file.file_id
        })

        if (reservationError) {
            throw new Error(`Failed to authorize download: ${reservationError.message}`)
        }

        if (!reservation || reservation.length === 0) {
            return res.status(410).json({ message: 'Download limit reached' })
        }

        const reservationResult = reservation[0]
        const updatedFile = {
            ...file,
            download_count: reservationResult.download_count,
            max_downloads: reservationResult.max_downloads
        }

        const { presignedUrl } = await getPresignedDownloadUrl(file.storage_path)

        if (reservationResult.exhausted) {
            scheduleExhaustedFileDeletion(updatedFile)
        }

        res.json({
            success: true,
            fileId: file.file_id,
            shortId: file.short_id,
            presignedUrl,
            downloadCount: reservationResult.download_count,
            maxDownloads: reservationResult.max_downloads,
            remainingDownloads: getRemainingDownloads(updatedFile),
            exhausted: reservationResult.exhausted
        })

    } catch (error) {
        console.error('[Authorize Download] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

// ============================================
// Cleanup Endpoint
// ============================================

/**
 * Clean up expired files
 * POST /api/cleanup-expired
 * Requires x-cleanup-secret header for authentication (timing-safe)
 */
app.post('/api/cleanup-expired', async (req, res) => {
    try {
        // Verify cleanup secret with timing-safe comparison
        const cleanupSecret = process.env.CLEANUP_SECRET
        if (!cleanupSecret) {
            console.error('[Cleanup] CLEANUP_SECRET not configured')
            return res.status(500).json({ message: 'Cleanup not configured' })
        }

        const providedSecret = req.headers['x-cleanup-secret']
        if (!providedSecret || typeof providedSecret !== 'string') {
            console.log('[Cleanup] Unauthorized attempt — no secret provided')
            return res.status(401).json({ message: 'Unauthorized' })
        }

        const secretBuf = Buffer.from(cleanupSecret, 'utf8')
        const providedBuf = Buffer.from(providedSecret, 'utf8')

        if (secretBuf.length !== providedBuf.length || !crypto.timingSafeEqual(secretBuf, providedBuf)) {
            console.log('[Cleanup] Unauthorized attempt')
            return res.status(401).json({ message: 'Unauthorized' })
        }

        console.log('[Cleanup] Starting automatic cleanup...')

        const { data: expiredFiles, error: fetchError } = await supabase
            .from('files')
            .select('file_id, storage_path, storage_backend, original_name')
            .lt('expires_at', new Date().toISOString())

        if (fetchError) {
            throw new Error(`Failed to fetch expired files: ${fetchError.message}`)
        }

        if (!expiredFiles || expiredFiles.length === 0) {
            console.log('[Cleanup] No expired files found')
            return res.json({ deleted: 0, message: 'No expired files' })
        }


        let deletedCount = 0
        const errors = []

        for (const file of expiredFiles) {
            try {
                // Delete from storage (R2 or Supabase) FIRST
                if (file.storage_backend === 'r2') {
                    await deleteObject(file.storage_path)
                } else {
                    await supabase.storage
                        .from('encrypted-files')
                        .remove([file.storage_path])
                }

                // Only delete from database AFTER storage deletion succeeds
                // This prevents orphaned storage objects
                const { error: dbError } = await supabase
                    .from('files')
                    .delete()
                    .eq('file_id', file.file_id)

                if (dbError) {
                    errors.push(`${file.original_name} - DB delete failed: ${dbError.message}`)
                } else {
                    deletedCount++
                    console.log(`[Cleanup] Deleted: ${file.original_name}`)
                }

            } catch (error) {
                // Storage deletion failed — skip DB deletion to allow retry on next cleanup
                errors.push(`${file.original_name} - Storage delete failed: ${error.message}`)
            }
        }

        console.log(`[Cleanup] Completed: ${deletedCount}/${expiredFiles.length} deleted`)

        res.json({
            deleted: deletedCount,
            total_expired: expiredFiles.length,
            errors: errors.length > 0 ? errors : undefined,
            message: `Cleaned up ${deletedCount} expired files`
        })

    } catch (error) {
        console.error('[Cleanup] Error:', error)
        res.status(500).json({ message: error.message })
    }
})
// ============================================
// Health Check
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ============================================
// Production: Serve Frontend Static Files
// ============================================

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.join(__dirname, '..', 'dist')

// Serve Vite build output
app.use(express.static(distPath))

// API 404 handler — return JSON instead of SPA HTML for unknown API routes
app.all('/api/*', (req, res) => {
    res.status(404).json({ message: `API route not found: ${req.method} ${req.path}` })
})

// SPA fallback: serve index.html for all non-API routes
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
})

// ============================================
// Start Server
// ============================================

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`🚀 Zero-Knowledge Server running on port ${PORT}`)
    console.log(`📦 R2 Bucket: ${process.env.R2_BUCKET_NAME || 'secure-share-files'}`)
})
