import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import SharePage from '../../src/pages/SharePage.jsx'
import {
    deriveCollectionItemMaterial,
    downloadAndDecryptManifest,
    downloadAndDecryptStreaming
} from '../../src/utils/streamingEncryption'

vi.mock('../../src/utils/streamingEncryption', () => ({
    downloadAndDecryptStreaming: vi.fn(async () => {}),
    downloadAndDecryptManifest: vi.fn(async () => ({ files: [] })),
    deriveCollectionItemMaterial: vi.fn(async () => ({ keyHex: 'item-key', ivHex: 'item-iv' })),
    terminateWorkerPool: vi.fn(),
}))

function renderSharePage(route = '/s/Short123#key=test-key&iv=test-iv') {
    window.location.hash = '#key=test-key&iv=test-iv'
    return render(
        <HelmetProvider>
            <MemoryRouter initialEntries={[route]}>
                <Routes>
                    <Route path="/share/:fileId" element={<SharePage />} />
                    <Route path="/s/:shortId" element={<SharePage />} />
                </Routes>
            </MemoryRouter>
        </HelmetProvider>
    )
}

describe('SharePage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.restoreAllMocks()
        vi.spyOn(window, 'alert').mockImplementation(() => {})
    })

    it('reveals collection contents for multi-file shares', async () => {
        vi.stubGlobal('fetch', vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    file_id: '123',
                    short_id: 'Short123',
                    share_kind: 'multi',
                    file_count: 2,
                    total_size: 32,
                    expires_at: '2099-01-01T00:00:00.000Z',
                    download_count: 0,
                    max_downloads: 2,
                    remaining_downloads: 2,
                    is_password_protected: false,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    success: true,
                    shareKind: 'multi',
                    fileId: '123',
                    manifestPresignedUrl: 'https://download.example/manifest',
                    manifestChunkCount: 1,
                    manifestChunkSizes: null,
                    sessionToken: 'session-token',
                    downloadCount: 1,
                    maxDownloads: 2,
                    remainingDownloads: 1,
                }),
            }))
        vi.mocked(downloadAndDecryptManifest).mockResolvedValueOnce({
            files: [
                { itemId: 'item-000001', name: 'one.txt', relativePath: 'one.txt', size: 12, type: 'text/plain', chunkCount: 1, chunkSizes: null }
            ]
        })

        renderSharePage('/s/Short123#key=test-key')
        fireEvent.click(await screen.findByRole('button', { name: /reveal files/i }))

        expect(await screen.findByText('Collection contents')).toBeInTheDocument()
        expect(screen.getByText('one.txt')).toBeInTheDocument()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('renders the locked screen for protected metadata without crashing', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                file_id: '123',
                short_id: 'Short123',
                expires_at: '2099-01-01T00:00:00.000Z',
                is_password_protected: true,
                is_download_limited: false,
            }),
        })))

        renderSharePage()
        expect(await screen.findByText(/protected share link/i)).toBeInTheDocument()
        expect(screen.queryByText(/download complete/i)).not.toBeInTheDocument()
    })

    it('unlocks and reveals file details', async () => {
        vi.stubGlobal('fetch', vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    file_id: '123',
                    short_id: 'Short123',
                    expires_at: '2099-01-01T00:00:00.000Z',
                    is_password_protected: true,
                    is_download_limited: false,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    file_id: '123',
                    short_id: 'Short123',
                    original_name: 'secret.txt',
                    file_size: 12,
                    file_type: 'text/plain',
                    storage_path: 'files/secret.enc',
                    chunk_count: 1,
                    chunk_sizes: null,
                    expires_at: '2099-01-01T00:00:00.000Z',
                    download_count: 0,
                    max_downloads: null,
                    remaining_downloads: null,
                    is_password_protected: true,
                }),
            }))

        renderSharePage()
        await screen.findByText(/protected share link/i)
        fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'abcd1234' } })
        fireEvent.click(screen.getByRole('button', { name: /unlock file/i }))

        expect(await screen.findByText('secret.txt')).toBeInTheDocument()
    })

    it('disables download when the limit is exhausted', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                file_id: '123',
                short_id: 'Short123',
                original_name: 'secret.txt',
                file_size: 12,
                file_type: 'text/plain',
                storage_path: 'files/secret.enc',
                chunk_count: 1,
                chunk_sizes: null,
                expires_at: '2099-01-01T00:00:00.000Z',
                download_count: 1,
                max_downloads: 1,
                remaining_downloads: 0,
                is_password_protected: false,
            }),
        })))

        renderSharePage()
        const button = await screen.findByRole('button', { name: /download limit reached/i })
        expect(button).toBeDisabled()
    })

    it('surfaces authorize-download errors', async () => {
        vi.stubGlobal('fetch', vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    file_id: '123',
                    short_id: 'Short123',
                    original_name: 'secret.txt',
                    file_size: 12,
                    file_type: 'text/plain',
                    storage_path: 'files/secret.enc',
                    chunk_count: 1,
                    chunk_sizes: null,
                    expires_at: '2099-01-01T00:00:00.000Z',
                    download_count: 0,
                    max_downloads: 2,
                    remaining_downloads: 2,
                    is_password_protected: false,
                }),
            })
            .mockResolvedValueOnce({
                ok: false,
                json: async () => ({ message: 'Download limit reached' }),
            }))

        renderSharePage()
        fireEvent.click(await screen.findByRole('button', { name: /decrypt & download/i }))

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith('Download failed: Download limit reached')
        })
    })

    it('syncs local quota state when authorization reports the limit is reached', async () => {
        vi.stubGlobal('fetch', vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    file_id: '123',
                    short_id: 'Short123',
                    original_name: 'secret.txt',
                    file_size: 12,
                    file_type: 'text/plain',
                    storage_path: 'files/secret.enc',
                    chunk_count: 1,
                    chunk_sizes: null,
                    expires_at: '2099-01-01T00:00:00.000Z',
                    download_count: 1,
                    max_downloads: 2,
                    remaining_downloads: 1,
                    is_password_protected: false,
                }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 410,
                json: async () => ({ message: 'Download limit reached' }),
            }))

        renderSharePage()
        fireEvent.click(await screen.findByRole('button', { name: /decrypt & download/i }))

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /download limit reached/i })).toBeDisabled()
        })
    })

    it('keeps download action available after a successful download when quota remains', async () => {
        vi.stubGlobal('fetch', vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    file_id: '123',
                    short_id: 'Short123',
                    original_name: 'secret.txt',
                    file_size: 12,
                    file_type: 'text/plain',
                    storage_path: 'files/secret.enc',
                    chunk_count: 1,
                    chunk_sizes: null,
                    expires_at: '2099-01-01T00:00:00.000Z',
                    download_count: 0,
                    max_downloads: 2,
                    remaining_downloads: 2,
                    is_password_protected: false,
                }),
            })
            .mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: true,
                    presignedUrl: 'https://download.example/file',
                    downloadCount: 1,
                    maxDownloads: 2,
                    remainingDownloads: 1,
                }),
            }))

        renderSharePage()
        const initialButton = await screen.findByRole('button', { name: /decrypt & download/i })
        fireEvent.click(initialButton)

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /download again/i })).toBeEnabled()
        }, { timeout: 2500 })

        fireEvent.click(screen.getByRole('button', { name: /download again/i }))

        await waitFor(() => {
            expect(vi.mocked(downloadAndDecryptStreaming)).toHaveBeenCalledTimes(2)
        })
    }, 8000)
})
