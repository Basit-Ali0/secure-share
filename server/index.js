/**
 * MaskedFile Server - Zero-Knowledge File Sharing API
 * Handles R2 multipart uploads and cleanup
 */

import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
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
 * Get presigned download URL
 * GET /api/r2/download/:objectKey
 */
app.get('/api/r2/download/*', async (req, res) => {
    try {
        const objectKey = req.params[0]

        if (!objectKey) {
            return res.status(400).json({ message: 'objectKey required' })
        }

        // P1: Enforce expiry check before signing download URL
        const { data: file, error: dbError } = await supabase
            .from('files')
            .select('expires_at')
            .eq('storage_path', objectKey)
            .single()

        if (dbError || !file) {
            return res.status(404).json({ message: 'File not found' })
        }

        if (new Date(file.expires_at) < new Date()) {
            return res.status(410).json({ message: 'File has expired' })
        }

        const result = await getPresignedDownloadUrl(objectKey)

        res.json(result)

    } catch (error) {
        console.error('[R2 Download] Error:', error)
        res.status(500).json({ message: error.message })
    }
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
            expiresAt
        } = req.body

        const { error } = await supabase.from('files').insert({
            file_id: fileId,
            original_name: originalName,
            file_type: fileType,
            file_size: fileSize,
            storage_path: storagePath,
            storage_backend: storageBackend || 'r2',
            chunk_count: chunkCount || 1,
            chunk_sizes: chunkSizes || null,
            expires_at: expiresAt
        })

        if (error) {
            throw new Error(`Failed to save metadata: ${error.message}`)
        }

        res.json({ success: true })

    } catch (error) {
        console.error('[Metadata Save] Error:', error)
        res.status(500).json({ message: error.message })
    }
})


/**
 * Get file metadata
 * GET /api/files/:fileId
 */
app.get('/api/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params

        const { data: metadata, error } = await supabase
            .from('files')
            .select('*')
            .eq('file_id', fileId)
            .single()

        if (error || !metadata) {
            return res.status(404).json({ message: 'File not found' })
        }

        // Check if expired
        if (new Date(metadata.expires_at) < new Date()) {
            return res.status(410).json({ message: 'File has expired' })
        }

        res.json(metadata)

    } catch (error) {
        console.error('[Metadata Get] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

/**
 * Increment download count (call after successful download)
 * POST /api/files/:fileId/downloaded
 */
app.post('/api/files/:fileId/downloaded', async (req, res) => {
    try {
        const { fileId } = req.params

        await supabase.rpc('increment_download_count', {
            file_id_param: fileId
        })

        res.json({ success: true })

    } catch (error) {
        console.error('[Download Count] Error:', error)
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
