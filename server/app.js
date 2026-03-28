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
import {
    SHARE_KIND_MULTI,
    SHARE_KIND_SINGLE,
    normalizeShareKind,
    buildCollectionItemId,
    buildCollectionItemObjectKey,
    buildCollectionManifestObjectKey,
    buildCollectionSummaryName,
    parseCollectionItemId
} from '../shared/collectionShare.js'

dotenv.config()

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SHORT_ID_LENGTH = 8
const EXHAUSTED_FILE_DELETE_DELAY_MS = 60 * 60 * 1000
const DOWNLOAD_SESSION_TTL_MS = 15 * 60 * 1000
const DEFAULT_SITE_URL = 'https://maskedfile.online'

function normalizeSiteUrl(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return DEFAULT_SITE_URL
    }

    return value.trim().replace(/\/+$/, '')
}

function getCanonicalSiteUrl(env) {
    return normalizeSiteUrl(env.PUBLIC_SITE_URL || env.VITE_SITE_URL)
}

function isIndexingEnabled(env) {
    return env.INDEXING_ENABLED !== 'false'
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
    const indexingEnabled = isIndexingEnabled(env)
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

    function getShareKind(file) {
        return normalizeShareKind(file?.share_kind)
    }

    function isMultiShare(file) {
        return getShareKind(file) === SHARE_KIND_MULTI
    }

    function getCollectionFileCount(file) {
        if (Number.isInteger(file?.file_count) && file.file_count > 0) {
            return file.file_count
        }

        return 1
    }

    function getCollectionTotalSize(file) {
        if (typeof file?.total_size === 'number' && Number.isFinite(file.total_size)) {
            return file.total_size
        }

        return file?.file_size ?? null
    }

    function getCollectionSummaryResponse(file) {
        return {
            file_id: file.file_id,
            short_id: file.short_id,
            share_kind: SHARE_KIND_MULTI,
            file_count: getCollectionFileCount(file),
            total_size: getCollectionTotalSize(file),
            expires_at: file.expires_at,
            created_at: file.created_at,
            download_count: file.download_count ?? 0,
            max_downloads: file.max_downloads,
            remaining_downloads: getRemainingDownloads(file),
            is_download_limited: file.max_downloads != null,
            is_password_protected: Boolean(file.password_hash)
        }
    }

    function encodeBase64Url(value) {
        return Buffer.from(value)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '')
    }

    function decodeBase64Url(value) {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
        const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
        return Buffer.from(`${normalized}${padding}`, 'base64')
    }

    function createDownloadSessionToken(file) {
        const secret = env.DOWNLOAD_SESSION_SECRET
        if (!secret) {
            throw new Error('DOWNLOAD_SESSION_SECRET is required for multi-file downloads')
        }

        const now = Date.now()
        const payload = JSON.stringify({
            shareId: file.file_id,
            shareKind: SHARE_KIND_MULTI,
            iat: now,
            exp: now + DOWNLOAD_SESSION_TTL_MS
        })
        const payloadToken = encodeBase64Url(payload)
        const signature = encodeBase64Url(
            cryptoModule.createHmac('sha256', secret).update(payloadToken).digest()
        )

        return `${payloadToken}.${signature}`
    }

    function verifyDownloadSessionToken(token, expectedShareId) {
        const secret = env.DOWNLOAD_SESSION_SECRET
        if (!secret) {
            throw new Error('DOWNLOAD_SESSION_SECRET is required for multi-file downloads')
        }

        if (typeof token !== 'string') {
            throw new Error('sessionToken is required')
        }

        const [payloadToken, signatureToken] = token.split('.')
        if (!payloadToken || !signatureToken) {
            throw new Error('Invalid session token')
        }

        const expectedSignature = encodeBase64Url(
            cryptoModule.createHmac('sha256', secret).update(payloadToken).digest()
        )

        const signatureBuffer = Buffer.from(signatureToken, 'utf8')
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8')
        if (
            signatureBuffer.length !== expectedBuffer.length ||
            !cryptoModule.timingSafeEqual(signatureBuffer, expectedBuffer)
        ) {
            throw new Error('Invalid session token')
        }

        const payload = JSON.parse(decodeBase64Url(payloadToken).toString('utf8'))
        if (payload.shareKind !== SHARE_KIND_MULTI || payload.shareId !== expectedShareId) {
            throw new Error('Invalid session token')
        }

        if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
            throw new Error('Download session has expired')
        }

        return payload
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
        if (isMultiShare(file)) {
            return getCollectionSummaryResponse(file)
        }

        const baseResponse = {
            ...file,
            share_kind: SHARE_KIND_SINGLE,
            file_count: 1,
            total_size: file.file_size,
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
        if (isMultiShare(file)) {
            return {
                ...getCollectionSummaryResponse(file),
                is_password_protected: true
            }
        }

        return {
            file_id: file.file_id,
            short_id: file.short_id,
            share_kind: SHARE_KIND_SINGLE,
            file_count: 1,
            total_size: file.file_size ?? null,
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

    function parsePositiveIntegerRequired(value, fieldName) {
        if (!Number.isInteger(value) || value < 1) {
            throw new Error(`${fieldName} must be a whole number greater than 0`)
        }

        return value
    }

    async function deleteShareObjects(file) {
        if (file.storage_backend !== 'r2') {
            const objectPaths = []
            if (file.storage_path) {
                objectPaths.push(file.storage_path)
            }
            if (isMultiShare(file) && file.manifest_storage_path && file.manifest_storage_path !== file.storage_path) {
                objectPaths.push(file.manifest_storage_path)
            }
            if (objectPaths.length > 0) {
                await supabase.storage.from('encrypted-files').remove(objectPaths)
            }
            return
        }

        if (isMultiShare(file)) {
            await r2.deleteObject(file.manifest_storage_path || buildCollectionManifestObjectKey(file.file_id))
            for (let index = 0; index < getCollectionFileCount(file); index++) {
                await r2.deleteObject(buildCollectionItemObjectKey(file.file_id, buildCollectionItemId(index)))
            }
            return
        }

        await r2.deleteObject(file.storage_path)
    }

    function scheduleExhaustedFileDeletion(file) {
        if (!file?.file_id || scheduledDeletionTimers.has(file.file_id)) {
            return
        }

        const timer = timeoutFn(async () => {
            try {
                await deleteShareObjects(file)

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

        if (!indexingEnabled) {
            res.send('User-agent: *\nDisallow: /\n')
            return
        }

        res.send(`User-agent: *\nAllow: /\n\nSitemap: ${canonicalSiteUrl}/sitemap.xml\n`)
    })

    app.get('/sitemap.xml', (req, res) => {
        if (!indexingEnabled) {
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
            const { fileId, objectKey } = req.body

            if (!fileId && !objectKey) {
                return res.status(400).json({ message: 'fileId or objectKey required' })
            }

            const result = await r2.getPresignedUploadUrl(objectKey || fileId)
            res.json(result)
        } catch (error) {
            console.error('[R2 Simple Upload] Error:', error)
            res.status(500).json({ message: error.message })
        }
    })

    app.post('/api/r2/initiate', async (req, res) => {
        try {
            const { fileId, objectKey } = req.body

            if (!fileId && !objectKey) {
                return res.status(400).json({ message: 'fileId or objectKey required' })
            }

            const result = await r2.initiateMultipartUpload(objectKey || fileId)
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
                shareKind,
                originalName,
                fileType,
                fileSize,
                storagePath,
                storageBackend,
                chunkCount,
                chunkSizes,
                fileCount,
                totalSize,
                manifestStoragePath,
                manifestChunkCount,
                manifestChunkSizes,
                expiresAt,
                maxDownloads,
                password
            } = req.body

            const normalizedShareKind = normalizeShareKind(shareKind)

            if (!isUuid(fileId)) {
                return res.status(400).json({ message: 'fileId must be a valid UUID' })
            }

            if (!isFutureDateString(expiresAt)) {
                return res.status(400).json({ message: 'expiresAt must be a valid future date' })
            }

            const parsedMaxDownloads = parsePositiveIntegerInput(maxDownloads)
            if (Number.isNaN(parsedMaxDownloads)) {
                return res.status(400).json({ message: 'maxDownloads must be a whole number greater than 0' })
            }

            const normalizedPassword = normalizeOptionalPassword(password)
            const passwordHash = normalizedPassword
                ? await bcryptModule.hash(normalizedPassword, 10)
                : null

            const normalizedExpiresAt = new Date(expiresAt).toISOString()
            const normalizedStorageBackend = storageBackend || 'r2'
            const baseRecord = {
                file_id: fileId,
                share_kind: normalizedShareKind,
                expires_at: normalizedExpiresAt,
                max_downloads: parsedMaxDownloads,
                password_hash: passwordHash,
                storage_backend: normalizedStorageBackend
            }

            if (normalizedShareKind === SHARE_KIND_MULTI) {
                if (typeof manifestStoragePath !== 'string' || manifestStoragePath.length === 0) {
                    return res.status(400).json({ message: 'manifestStoragePath is required for multi-file shares' })
                }

                if (typeof totalSize !== 'number' || !Number.isFinite(totalSize) || totalSize < 0) {
                    return res.status(400).json({ message: 'totalSize must be a non-negative number' })
                }

                try {
                    parsePositiveIntegerRequired(fileCount, 'fileCount')
                    parsePositiveIntegerRequired(manifestChunkCount, 'manifestChunkCount')
                } catch (validationError) {
                    return res.status(400).json({ message: validationError.message })
                }

                if (manifestChunkSizes != null && !Array.isArray(manifestChunkSizes)) {
                    return res.status(400).json({ message: 'manifestChunkSizes must be an array when provided' })
                }

                const shortId = await insertFileMetadataWithShortId({
                    ...baseRecord,
                    original_name: buildCollectionSummaryName(fileCount),
                    file_type: 'application/x.maskedfile-collection',
                    file_size: totalSize,
                    storage_path: manifestStoragePath,
                    chunk_count: manifestChunkCount,
                    chunk_sizes: manifestChunkSizes || null,
                    file_count: fileCount,
                    total_size: totalSize,
                    manifest_storage_path: manifestStoragePath,
                    manifest_chunk_count: manifestChunkCount,
                    manifest_chunk_sizes: manifestChunkSizes || null
                })

                return res.json({ success: true, fileId, shortId })
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

            if (chunkCount != null && (!Number.isInteger(chunkCount) || chunkCount < 1)) {
                return res.status(400).json({ message: 'chunkCount must be an integer greater than 0' })
            }

            if (chunkSizes != null && !Array.isArray(chunkSizes)) {
                return res.status(400).json({ message: 'chunkSizes must be an array when provided' })
            }

            const normalizedChunkCount = chunkCount ?? 1
            const shortId = await insertFileMetadataWithShortId({
                ...baseRecord,
                original_name: originalName,
                file_type: fileType,
                file_size: fileSize,
                storage_path: storagePath,
                chunk_count: normalizedChunkCount,
                chunk_sizes: chunkSizes || null,
                file_count: 1,
                total_size: fileSize
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
                'file_id, short_id, share_kind, file_count, total_size, storage_path, storage_backend, chunk_count, chunk_sizes, manifest_storage_path, manifest_chunk_count, manifest_chunk_sizes, expires_at, download_count, max_downloads, password_hash'
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

            if (reservationResult.exhausted) {
                scheduleExhaustedFileDeletion(updatedFile)
            }

            if (isMultiShare(file)) {
                const manifestPath = file.manifest_storage_path || buildCollectionManifestObjectKey(file.file_id)
                const { presignedUrl: manifestPresignedUrl } = await r2.getPresignedDownloadUrl(manifestPath)
                const sessionToken = createDownloadSessionToken(file)

                return res.json({
                    success: true,
                    fileId: file.file_id,
                    shortId: file.short_id,
                    shareKind: SHARE_KIND_MULTI,
                    manifestPresignedUrl,
                    manifestChunkCount: file.manifest_chunk_count ?? file.chunk_count ?? 1,
                    manifestChunkSizes: file.manifest_chunk_sizes ?? file.chunk_sizes ?? null,
                    sessionToken,
                    downloadCount: reservationResult.download_count,
                    maxDownloads: reservationResult.max_downloads,
                    remainingDownloads: getRemainingDownloads(updatedFile),
                    exhausted: reservationResult.exhausted
                })
            }

            const { presignedUrl } = await r2.getPresignedDownloadUrl(file.storage_path)

            res.json({
                success: true,
                fileId: file.file_id,
                shortId: file.short_id,
                shareKind: SHARE_KIND_SINGLE,
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

    app.post('/api/files/:identifier/authorize-item-download', async (req, res) => {
        try {
            const { identifier } = req.params
            const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId.trim() : ''
            const sessionToken = req.body?.sessionToken
            const { data: file, error } = await findFileByIdentifier(
                identifier,
                'file_id, short_id, share_kind, file_count, storage_backend, expires_at'
            )

            if (error || !file) {
                return res.status(404).json({ message: 'File not found' })
            }

            if (!isMultiShare(file)) {
                return res.status(400).json({ message: 'Item downloads are only available for multi-file shares' })
            }

            if (new Date(file.expires_at) < new Date()) {
                return res.status(410).json({ message: 'File has expired' })
            }

            const itemIndex = parseCollectionItemId(itemId)
            if (itemIndex == null || itemIndex >= getCollectionFileCount(file)) {
                return res.status(400).json({ message: 'Invalid itemId' })
            }

            verifyDownloadSessionToken(sessionToken, file.file_id)

            const objectKey = buildCollectionItemObjectKey(file.file_id, itemId)
            const { presignedUrl } = await r2.getPresignedDownloadUrl(objectKey)

            res.json({
                success: true,
                fileId: file.file_id,
                shortId: file.short_id,
                itemId,
                presignedUrl
            })
        } catch (error) {
            const status = error.message === 'Download session has expired' ? 401 : 400
            console.error('[Authorize Item Download] Error:', error)
            res.status(status).json({ message: error.message })
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
                .select('file_id, share_kind, file_count, storage_path, storage_backend, original_name, manifest_storage_path')
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
                    await deleteShareObjects(file)

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
