import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { vi } from 'vitest'
import HomePage from '../../src/pages/HomePage.jsx'
import { encryptAndUploadCollection, encryptAndUploadStreaming } from '../../src/utils/streamingEncryption'
import { buildCanonicalUrl, DEFAULT_TITLE, SITE_NAME } from '../../src/lib/siteConfig.js'

vi.mock('../../src/utils/streamingEncryption', () => ({
    encryptAndUploadStreaming: vi.fn(async () => ({
        objectKey: 'files/demo.enc',
        keyHex: 'key',
        ivHex: 'iv',
        totalChunks: 1,
        chunkSizes: null,
    })),
    encryptAndUploadCollection: vi.fn(async () => ({
        shareId: '123',
        shareKind: 'multi',
        transferKeyHex: 'multi-key',
        fileCount: 2,
        totalSize: 10,
        manifest: { files: [] },
        manifestUpload: {
            objectKey: 'shares/123/manifest.enc',
            totalChunks: 1,
            chunkSizes: null,
        },
        items: []
    })),
    terminateWorkerPool: vi.fn(),
}))

describe('HomePage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.restoreAllMocks()
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ success: true, fileId: '123', shortId: 'Short123' }),
        })))
        vi.stubGlobal('scrollTo', vi.fn())
        vi.spyOn(window, 'alert').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    function selectFile(container, file = new File(['hello'], 'demo.txt', { type: 'text/plain' })) {
        const input = container.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files: [file] } })
    }

    function selectFiles(container, files) {
        const input = container.querySelector('input[type="file"]')
        fireEvent.change(input, { target: { files } })
    }

    function renderHomePage() {
        return render(
            <HelmetProvider>
                <HomePage />
            </HelmetProvider>
        )
    }

    async function openAdvancedProtection() {
        fireEvent.click(await screen.findByRole('button', { name: /advanced protection/i }))
    }

    it('rejects invalid max-download values', async () => {
        const { container } = renderHomePage()
        selectFile(container)
        const uploadSpy = vi.mocked(encryptAndUploadStreaming)
        await openAdvancedProtection()

        fireEvent.change(screen.getByPlaceholderText('Unlimited'), { target: { value: '0' } })
        fireEvent.click(screen.getByRole('button', { name: /secure & send/i }))

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Download limit must be a whole number greater than 0'))
        })
        expect(uploadSpy).not.toHaveBeenCalled()
        expect(vi.mocked(encryptAndUploadCollection)).not.toHaveBeenCalled()
    })

    it('rejects non-integer max-download values', async () => {
        const { container } = renderHomePage()
        selectFile(container)
        const uploadSpy = vi.mocked(encryptAndUploadStreaming)
        await openAdvancedProtection()

        fireEvent.change(screen.getByPlaceholderText('Unlimited'), { target: { value: '1.9' } })
        fireEvent.click(screen.getByRole('button', { name: /secure & send/i }))

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Download limit must be a whole number greater than 0'))
        })
        expect(uploadSpy).not.toHaveBeenCalled()
        expect(vi.mocked(encryptAndUploadCollection)).not.toHaveBeenCalled()
    })

    it('rejects password confirmation mismatch', async () => {
        const { container } = renderHomePage()
        selectFile(container)
        const uploadSpy = vi.mocked(encryptAndUploadStreaming)
        await openAdvancedProtection()

        fireEvent.change(screen.getByPlaceholderText('Leave blank for no password'), { target: { value: 'abcd1234' } })
        fireEvent.change(screen.getByPlaceholderText('Repeat password'), { target: { value: 'wrong' } })
        fireEvent.click(await screen.findByRole('button', { name: /secure & send/i }))

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Password confirmation does not match'))
        })
        expect(uploadSpy).not.toHaveBeenCalled()
        expect(vi.mocked(encryptAndUploadCollection)).not.toHaveBeenCalled()
    })

    it('prefers short links when the backend returns shortId', async () => {
        const { container } = renderHomePage()
        selectFile(container)

        fireEvent.click(await screen.findByRole('button', { name: /secure & send/i }))

        await screen.findByText(/secure share ready/i)
        expect(screen.getByText(/\/s\/Short123#key=key&iv=iv/i)).toBeInTheDocument()
    })

    it('creates collection links with a transfer key fragment for multi-file uploads', async () => {
        const { container } = renderHomePage()
        selectFiles(container, [
            new File(['a'], 'one.txt', { type: 'text/plain' }),
            new File(['b'], 'two.txt', { type: 'text/plain' })
        ])

        fireEvent.click(await screen.findByRole('button', { name: /secure & send/i }))

        await screen.findByText(/secure share ready/i)
        expect(screen.getByText(/\/s\/Short123#key=multi-key/i)).toBeInTheDocument()
    })

    it('sets canonical metadata for the home page', async () => {
        renderHomePage()

        await waitFor(() => {
            expect(document.title).toBe(DEFAULT_TITLE)
            expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(buildCanonicalUrl('/'))
            expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toContain(SITE_NAME)
        })
    })
})
