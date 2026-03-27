import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import bcrypt from 'bcrypt'
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SHORT_ID_LENGTH = 8
const EXHAUSTED_FILE_DELETE_DELAY_MS = 60 * 60 * 1000
const DEFAULT_SITE_URL = 'https://maskedfile.online'
const INDEXABLE_HOSTS = new Set(['maskedfile.online', 'www.maskedfile.online'])

function normalizeSiteUrl(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return DEFAULT_SITE_URL
    }

    return value.trim().replace(/\/+$/, '')
}

function getCanonicalSiteUrl(env) {
    return normalizeSiteUrl(env.PUBLIC_SITE_URL || env.VITE_SITE_URL)
}

function getRequestHost(req) {
    const forwardedHost = req.headers['x-forwarded-host']
    const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.get('host') || ''
    return hostHeader.split(',')[0].trim().split(':')[0].toLowerCase()
}

function shouldExposeIndexing(req) {
    return INDEXABLE_HOSTS.has(getRequestHost(req))
}

function validateRequiredEnv(env) {
    if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
        throw new Error('Missing required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY')
    }
}

function createSupabaseFromEnv(env) {
    validateRequiredEnv(env)
    return createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
}

export function createApp(options = {}) {
    const env = options.env ?? process.env
    const app = express()
    const scheduledDeletionTimers = new Map()
    const cryptoModule = options.cryptoModule ?? crypto
    const bcryptModule = options.bcryptModule ?? bcrypt
    const timeoutFn = options.setTimeoutFn ?? setTimeout
    const supabase = options.supabase ?? createSupabaseFromEnv(env)
    const canonicalSiteUrl = getCanonicalSiteUrl(env)
    const sitemapLastModified = new Date().toISOString()
    const r2 = {
        getPresignedUploadUrl: options.getPresignedUploadUrl ?? getPresignedUploadUrl,
        initiateMultipartUpload: options.initiateMultipartUpload ?? initiateMultipartUpload,
        getPresignedPartUrl: options.getPresignedPartUrl ?? getPresignedPartUrl,
        completeMultipartUpload: options.completeMultipartUpload ?? completeMultipartUpload,
        getPresignedDownloadUrl: options.getPresignedDownloadUrl ?? getPresignedDownloadUrl,
        deleteObject: options.deleteObject ?? deleteObject
    }

    app.use(cors({
        origin: env.CORS_ORIGIN || true,
    }))
    app.use(express.json({ limit: '1mb' }))
    app.use((req, res, next) => {
        if (/^\/(share|s)(\/|$)/.test(req.path)) {
            res.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
        }
        next()
    })

    function isUuid(value) {
        return UUID_REGEX.test(value)
    }

    function generateShortId(length = SHORT_ID_LENGTH) {
        let shortId = ''
        const alphabetLength = SHORT_ID_ALPHABET.length
        const maxByte = Math.floor(256 / alphabetLength) * alphabetLength

        while (shortId.length < length) {
            const randomBytes = cryptoModule.randomBytes(length)

            for (const randomByte of randomBytes) {
                if (randomByte >= maxByte) {
                    continue
                }

                shortId += SHORT_ID_ALPHABET[randomByte % alphabetLength]

                if (shortId.length === length) {
                    break
                }
            }
        }

        return shortId
    }

    async function insertFileMetadataWithShortId(fileRecord, maxAttempts = 5) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const shortId = generateShortId()
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
            ...file,
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

    function isFutureDateString(value) {
        if (typeof value !== 'string' || value.trim().length === 0) {
            return false
        }

        const parsedDate = new Date(value)
        return !Number.isNaN(parsedDate.getTime()) && parsedDate > new Date()
    }

    function parsePositiveIntegerInput(value) {
        if (value == null || value === '') {
            return null
        }

        if (typeof value === 'number') {
            return Number.isInteger(value) && value > 0 ? value : NaN
        }

        if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
            return Number(value.trim())
        }

        return NaN
    }

    function scheduleExhaustedFileDeletion(file) {
        if (!file?.file_id || scheduledDeletionTimers.has(file.file_id)) {
            return
        }

        const timer = timeoutFn(async () => {
            try {
                if (file.storage_backend === 'r2') {
                    await r2.deleteObject(file.storage_path)
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
            } catch (error) {
                console.error(`[Download Limit] Failed to delete exhausted file ${file.file_id}:`, error)
            } finally {
                scheduledDeletionTimers.delete(file.file_id)
            }
        }, EXHAUSTED_FILE_DELETE_DELAY_MS)

        if (typeof timer?.unref === 'function') {
            timer.unref()
        }

        scheduledDeletionTimers.set(file.file_id, timer)
    }

    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() })
    })

    app.get('/api/runtime-config', (req, res) => {
        res.json({
            siteUrl: canonicalSiteUrl,
            gaMeasurementId: env.GA_MEASUREMENT_ID || env.VITE_GA_MEASUREMENT_ID || null
        })
    })

    app.get('/robots.txt', (req, res) => {
        res.type('text/plain')

        if (!shouldExposeIndexing(req)) {
            res.send('User-agent: *\nDisallow: /\n')
            return
        }

        res.send(`User-agent: *\nAllow: /\n\nSitemap: ${canonicalSiteUrl}/sitemap.xml\n`)
    })

    app.get('/sitemap.xml', (req, res) => {
        if (!shouldExposeIndexing(req)) {
            res.status(404).type('text/plain').send('Not Found')
            return
        }

        res.type('application/xml')
        res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${canonicalSiteUrl}/</loc>
    <lastmod>${sitemapLastModified}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`)
    })

    app.post('/api/r2/simple-upload', async (req, res) => {
        try {
            const { fileId } = req.body

            if (!fileId) {
                return res.status(400).json({ message: 'fileId required' })
            }

            const result = await r2.getPresignedUploadUrl(fileId)
            res.json(result)
        } catch (error) {
            console.error('[R2 Simple Upload] Error:', error)
            res.status(500).json({ message: error.message })
        }
    })

    app.post('/api/r2/initiate', async (req, res) => {
        try {
            const { fileId } = req.body

            if (!fileId) {
                return res.status(400).json({ message: 'fileId required' })
            }

            const result = await r2.initiateMultipartUpload(fileId)
            res.json(result)
        } catch (error) {
            console.error('[R2 Initiate] Error:', error)
            res.status(500).json({ message: error.message })
        }
    })

    app.post('/api/r2/presign-part', async (req, res) => {
        try {
            const { objectKey, uploadId, partNumber } = req.body

            if (!objectKey || !uploadId || !partNumber) {
                return res.status(400).json({ message: 'objectKey, uploadId, and partNumber required' })
            }

            const result = await r2.getPresignedPartUrl(objectKey, uploadId, partNumber)
            res.json(result)
        } catch (error) {
            console.error('[R2 Presign] Error:', error)
            res.status(500).json({ message: error.message })
        }
    })

    app.post('/api/r2/complete', async (req, res) => {
        try {
            const { objectKey, uploadId, parts } = req.body

            if (!objectKey || !uploadId || !parts) {
                return res.status(400).json({ message: 'objectKey, uploadId, and parts required' })
            }

            const result = await r2.completeMultipartUpload(objectKey, uploadId, parts)
            res.json(result)
        } catch (error) {
            console.error('[R2 Complete] Error:', error)
            res.status(500).json({ message: error.message })
        }
    })

    app.get('/api/r2/download/*', async (req, res) => {
        res.status(410).json({ message: 'Direct downloads are disabled. Authorize downloads via /api/files/:identifier/authorize-download.' })
    })

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

            if (!isUuid(fileId)) {
                return res.status(400).json({ message: 'fileId must be a valid UUID' })
            }

            if (!storagePath || typeof storagePath !== 'string') {
                return res.status(400).json({ message: 'storagePath is required' })
            }

            if (typeof originalName !== 'string' || originalName.trim().length === 0) {
                return res.status(400).json({ message: 'originalName is required' })
            }

            if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize < 0) {
                return res.status(400).json({ message: 'fileSize must be a non-negative number' })
            }

            if (!isFutureDateString(expiresAt)) {
                return res.status(400).json({ message: 'expiresAt must be a valid future date' })
            }

            const parsedMaxDownloads = parsePositiveIntegerInput(maxDownloads)
            if (Number.isNaN(parsedMaxDownloads)) {
                return res.status(400).json({ message: 'maxDownloads must be a whole number greater than 0' })
            }

            if (chunkCount != null && (!Number.isInteger(chunkCount) || chunkCount < 1)) {
                return res.status(400).json({ message: 'chunkCount must be an integer greater than 0' })
            }

            if (chunkSizes != null && !Array.isArray(chunkSizes)) {
                return res.status(400).json({ message: 'chunkSizes must be an array when provided' })
            }

            const normalizedPassword = normalizeOptionalPassword(password)
            const passwordHash = normalizedPassword
                ? await bcryptModule.hash(normalizedPassword, 10)
                : null

            const normalizedExpiresAt = new Date(expiresAt).toISOString()
            const normalizedChunkCount = chunkCount ?? 1
            const normalizedStorageBackend = storageBackend || 'r2'

            const shortId = await insertFileMetadataWithShortId({
                file_id: fileId,
                original_name: originalName,
                file_type: fileType,
                file_size: fileSize,
                storage_path: storagePath,
                storage_backend: normalizedStorageBackend,
                chunk_count: normalizedChunkCount,
                chunk_sizes: chunkSizes || null,
                expires_at: normalizedExpiresAt,
                max_downloads: parsedMaxDownloads,
                password_hash: passwordHash
            })

            res.json({ success: true, fileId, shortId })
        } catch (error) {
            console.error('[Metadata Save] Error:', error)
            res.status(500).json({ message: error.message })
        }
    })

    app.get('/api/files/:identifier', async (req, res) => {
        try {
            const { identifier } = req.params
            const { data: metadata, error } = await findFileByIdentifier(identifier)

            if (error || !metadata) {
                return res.status(404).json({ message: 'File not found' })
            }

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

            const passwordMatches = await bcryptModule.compare(submittedPassword, file.password_hash)
            if (!passwordMatches) {
                return res.status(401).json({ message: 'Invalid password' })
            }

            res.json(formatMetadataResponse(file))
        } catch (error) {
            console.error('[Unlock File] Error:', error)
            res.status(500).json({ message: error.message })
        }
    })

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

                const passwordMatches = await bcryptModule.compare(submittedPassword, file.password_hash)
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

            const { presignedUrl } = await r2.getPresignedDownloadUrl(file.storage_path)

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

    app.post('/api/cleanup-expired', async (req, res) => {
        try {
            const cleanupSecret = env.CLEANUP_SECRET
            if (!cleanupSecret) {
                return res.status(500).json({ message: 'Cleanup not configured' })
            }

            const providedSecret = req.headers['x-cleanup-secret']
            if (!providedSecret || typeof providedSecret !== 'string') {
                return res.status(401).json({ message: 'Unauthorized' })
            }

            const secretBuf = Buffer.from(cleanupSecret, 'utf8')
            const providedBuf = Buffer.from(providedSecret, 'utf8')

            if (secretBuf.length !== providedBuf.length || !cryptoModule.timingSafeEqual(secretBuf, providedBuf)) {
                return res.status(401).json({ message: 'Unauthorized' })
            }

            const { data: expiredFiles, error: fetchError } = await supabase
                .from('files')
                .select('file_id, storage_path, storage_backend, original_name')
                .lt('expires_at', new Date().toISOString())

            if (fetchError) {
                throw new Error(`Failed to fetch expired files: ${fetchError.message}`)
            }

            if (!expiredFiles || expiredFiles.length === 0) {
                return res.json({ deleted: 0, message: 'No expired files' })
            }

            let deletedCount = 0
            const errors = []

            for (const file of expiredFiles) {
                try {
                    if (file.storage_backend === 'r2') {
                        await r2.deleteObject(file.storage_path)
                    } else {
                        await supabase.storage
                            .from('encrypted-files')
                            .remove([file.storage_path])
                    }

                    const { error: dbError } = await supabase
                        .from('files')
                        .delete()
                        .eq('file_id', file.file_id)

                    if (dbError) {
                        errors.push(`${file.original_name} - DB delete failed: ${dbError.message}`)
                    } else {
                        deletedCount++
                    }
                } catch (error) {
                    errors.push(`${file.original_name} - Storage delete failed: ${error.message}`)
                }
            }

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

    return app
}

export function createRuntimeContext(env = process.env) {
    return {
        env,
        app: createApp({ env })
    }
}
