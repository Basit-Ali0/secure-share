// @vitest-environment node
import request from 'supertest'
import crypto from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../server/app.js'

function createSupabaseMock({
    existingShortIds = new Set(),
    filesById = {},
    filesByShortId = {},
    authorizeDownloadResult = [],
    authorizeDownloadError = null,
}) {
    const insertedRows = []
    const deletedFileIds = []

    function resolveFile(column, value) {
        if (column === 'file_id') {
            return filesById[value] ?? null
        }
        if (column === 'short_id') {
            return filesByShortId[value] ?? null
        }
        return null
    }

    const supabase = {
        insertedRows,
        deletedFileIds,
        storage: {
            from: vi.fn(() => ({
                remove: vi.fn(async () => ({ data: [], error: null }))
            }))
        },
        rpc: vi.fn(async (name, payload) => {
            if (name === 'authorize_download') {
                return { data: authorizeDownloadResult, error: authorizeDownloadError }
            }
            return { data: null, error: null }
        }),
        from: vi.fn((table) => {
            expect(table).toBe('files')

            const state = {
                mode: null,
                selected: '*',
                filters: [],
                insertedRow: null,
            }

            const builder = {
                select(selection) {
                    state.mode = 'select'
                    state.selected = selection
                    return builder
                },
                insert(row) {
                    state.mode = 'insert'
                    state.insertedRow = row
                    return Promise.resolve((() => {
                        if (existingShortIds.has(row.short_id)) {
                            return { error: { code: '23505', message: 'duplicate key value violates unique constraint "short_id"' } }
                        }
                        insertedRows.push(row)
                        filesById[row.file_id] = row
                        if (row.short_id) {
                            filesByShortId[row.short_id] = row
                            existingShortIds.add(row.short_id)
                        }
                        return { error: null }
                    })())
                },
                delete() {
                    state.mode = 'delete'
                    return builder
                },
                eq(column, value) {
                    state.filters.push({ column, value })

                    if (state.mode === 'delete') {
                        deletedFileIds.push(value)
                        return Promise.resolve({ error: null })
                    }

                    return builder
                },
                lt() {
                    return Promise.resolve({ data: [], error: null })
                },
                single() {
                    const idFilter = state.filters.find((filter) => filter.column === 'file_id' || filter.column === 'short_id')
                    const file = idFilter ? resolveFile(idFilter.column, idFilter.value) : null
                    if (!file) {
                        return Promise.resolve({ data: null, error: { message: 'Not found' } })
                    }
                    return Promise.resolve({ data: file, error: null })
                },
                maybeSingle() {
                    const shortIdFilter = state.filters.find((filter) => filter.column === 'short_id')
                    if (!shortIdFilter) {
                        return Promise.resolve({ data: null, error: null })
                    }
                    const exists = existingShortIds.has(shortIdFilter.value)
                    return Promise.resolve({ data: exists ? { short_id: shortIdFilter.value } : null, error: null })
                }
            }

            return builder
        })
    }

    return supabase
}

describe('server app routes', () => {
    it('returns a shortId when saving metadata', async () => {
        const supabase = createSupabaseMock({})
        const app = createApp({
            env: {
                VITE_SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-role-key',
            },
            supabase,
            cryptoModule: {
                ...crypto,
                randomBytes: vi.fn(() => Buffer.from('abcdefgh'))
            }
        })

        const response = await request(app)
            .post('/api/files/metadata')
            .send({
                fileId: '123e4567-e89b-12d3-a456-426614174000',
                originalName: 'demo.txt',
                fileType: 'text/plain',
                fileSize: 12,
                storagePath: 'files/123e4567-e89b-12d3-a456-426614174000.enc',
                expiresAt: '2099-01-01T00:00:00.000Z'
            })

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.shortId).toHaveLength(8)
        expect(supabase.insertedRows[0].short_id).toBe(response.body.shortId)
    })

    it('looks up file metadata by short id', async () => {
        const file = {
            file_id: '123e4567-e89b-12d3-a456-426614174000',
            short_id: 'Short123',
            original_name: 'demo.txt',
            file_type: 'text/plain',
            file_size: 12,
            storage_path: 'files/demo.enc',
            storage_backend: 'r2',
            chunk_count: 1,
            chunk_sizes: null,
            expires_at: '2099-01-01T00:00:00.000Z',
            download_count: 0,
            max_downloads: null,
            password_hash: null,
        }
        const supabase = createSupabaseMock({
            filesById: { [file.file_id]: file },
            filesByShortId: { [file.short_id]: file },
            existingShortIds: new Set([file.short_id]),
        })

        const app = createApp({
            env: {
                VITE_SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-role-key',
            },
            supabase,
        })

        const response = await request(app).get('/api/files/Short123')
        expect(response.status).toBe(200)
        expect(response.body.file_id).toBe(file.file_id)
        expect(response.body.short_id).toBe(file.short_id)
    })

    it('returns minimal metadata for password-protected files', async () => {
        const file = {
            file_id: '123e4567-e89b-12d3-a456-426614174000',
            short_id: 'Secret12',
            expires_at: '2099-01-01T00:00:00.000Z',
            created_at: '2026-01-01T00:00:00.000Z',
            max_downloads: 2,
            password_hash: 'hashed-password',
        }
        const supabase = createSupabaseMock({
            filesById: { [file.file_id]: file },
            filesByShortId: { [file.short_id]: file },
        })

        const app = createApp({
            env: {
                VITE_SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-role-key',
            },
            supabase,
        })

        const response = await request(app).get(`/api/files/${file.short_id}`)
        expect(response.status).toBe(200)
        expect(response.body.is_password_protected).toBe(true)
        expect(response.body.original_name).toBeUndefined()
    })

    it('unlocks protected files with the correct password', async () => {
        const file = {
            file_id: '123e4567-e89b-12d3-a456-426614174000',
            short_id: 'Secret12',
            original_name: 'secret.txt',
            file_type: 'text/plain',
            file_size: 12,
            storage_path: 'files/secret.enc',
            storage_backend: 'r2',
            chunk_count: 1,
            chunk_sizes: null,
            expires_at: '2099-01-01T00:00:00.000Z',
            download_count: 0,
            max_downloads: null,
            password_hash: 'hashed-password',
        }
        const supabase = createSupabaseMock({
            filesById: { [file.file_id]: file },
            filesByShortId: { [file.short_id]: file },
        })

        const bcryptModule = {
            hash: vi.fn(),
            compare: vi.fn(async (submitted, stored) => submitted === 'correct-password' && stored === 'hashed-password')
        }

        const app = createApp({
            env: {
                VITE_SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-role-key',
            },
            supabase,
            bcryptModule,
        })

        const success = await request(app)
            .post(`/api/files/${file.short_id}/unlock`)
            .send({ password: 'correct-password' })
        expect(success.status).toBe(200)
        expect(success.body.original_name).toBe('secret.txt')

        const failure = await request(app)
            .post(`/api/files/${file.short_id}/unlock`)
            .send({ password: 'wrong-password' })
        expect(failure.status).toBe(401)
    })

    it('authorizes downloads, returns a presigned URL, and blocks bad passwords', async () => {
        const file = {
            file_id: '123e4567-e89b-12d3-a456-426614174000',
            short_id: 'Secret12',
            storage_path: 'files/secret.enc',
            storage_backend: 'r2',
            expires_at: '2099-01-01T00:00:00.000Z',
            download_count: 0,
            max_downloads: 2,
            password_hash: 'hashed-password',
        }
        const supabase = createSupabaseMock({
            filesById: { [file.file_id]: file },
            filesByShortId: { [file.short_id]: file },
            authorizeDownloadResult: [{ download_count: 1, max_downloads: 2, exhausted: false }],
        })
        const bcryptModule = {
            hash: vi.fn(),
            compare: vi.fn(async (submitted) => submitted === 'correct-password')
        }
        const getPresignedDownloadUrl = vi.fn(async () => ({ presignedUrl: 'https://download.example/file' }))

        const app = createApp({
            env: {
                VITE_SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-role-key',
            },
            supabase,
            bcryptModule,
            getPresignedDownloadUrl,
        })

        const denied = await request(app)
            .post(`/api/files/${file.short_id}/authorize-download`)
            .send({ password: 'wrong-password' })
        expect(denied.status).toBe(401)

        const success = await request(app)
            .post(`/api/files/${file.short_id}/authorize-download`)
            .send({ password: 'correct-password' })
        expect(success.status).toBe(200)
        expect(success.body.presignedUrl).toBe('https://download.example/file')
        expect(success.body.remainingDownloads).toBe(1)
        expect(getPresignedDownloadUrl).toHaveBeenCalledWith(file.storage_path)
    })

    it('blocks downloads once max_downloads is exhausted', async () => {
        const file = {
            file_id: '123e4567-e89b-12d3-a456-426614174000',
            short_id: 'Limit123',
            storage_path: 'files/demo.enc',
            storage_backend: 'r2',
            expires_at: '2099-01-01T00:00:00.000Z',
            download_count: 1,
            max_downloads: 1,
            password_hash: null,
        }
        const supabase = createSupabaseMock({
            filesById: { [file.file_id]: file },
            filesByShortId: { [file.short_id]: file },
            authorizeDownloadResult: [],
        })
        const app = createApp({
            env: {
                VITE_SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-role-key',
            },
            supabase,
        })

        const response = await request(app).post(`/api/files/${file.short_id}/authorize-download`)
        expect(response.status).toBe(410)
        expect(response.body.message).toBe('Download limit reached')
    })

    it('rejects expired downloads before authorization', async () => {
        const file = {
            file_id: '123e4567-e89b-12d3-a456-426614174000',
            short_id: 'OldFile12',
            storage_path: 'files/demo.enc',
            storage_backend: 'r2',
            expires_at: '2000-01-01T00:00:00.000Z',
            download_count: 0,
            max_downloads: null,
            password_hash: null,
        }
        const supabase = createSupabaseMock({
            filesById: { [file.file_id]: file },
            filesByShortId: { [file.short_id]: file },
        })
        const app = createApp({
            env: {
                VITE_SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-role-key',
            },
            supabase,
        })

        const response = await request(app).post(`/api/files/${file.short_id}/authorize-download`)
        expect(response.status).toBe(410)
        expect(response.body.message).toBe('File has expired')
    })

    it('serves robots.txt and sitemap.xml only for the canonical public host', async () => {
        const app = createApp({
            env: {
                VITE_SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_SERVICE_KEY: 'service-role-key',
            },
            supabase: createSupabaseMock({}),
        })

        const publicRobots = await request(app)
            .get('/robots.txt')
            .set('Host', 'maskedfile.online')
        expect(publicRobots.status).toBe(200)
        expect(publicRobots.text).toContain('Allow: /')
        expect(publicRobots.text).toContain('Sitemap: https://maskedfile.online/sitemap.xml')

        const publicSitemap = await request(app)
            .get('/sitemap.xml')
            .set('Host', 'maskedfile.online')
        expect(publicSitemap.status).toBe(200)
        expect(publicSitemap.text).toContain('<loc>https://maskedfile.online/</loc>')
        expect(publicSitemap.text).toContain('<lastmod>')

        const runAppRobots = await request(app)
            .get('/robots.txt')
            .set('Host', 'maskedfile-447590108387.asia-south1.run.app')
        expect(runAppRobots.status).toBe(200)
        expect(runAppRobots.text).toBe('User-agent: *\nDisallow: /\n')

        const runAppSitemap = await request(app)
            .get('/sitemap.xml')
            .set('Host', 'maskedfile-447590108387.asia-south1.run.app')
        expect(runAppSitemap.status).toBe(404)
    })
})
