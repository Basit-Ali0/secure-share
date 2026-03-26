import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import HomePage from '../../src/pages/HomePage.jsx'
import { encryptAndUploadStreaming } from '../../src/utils/streamingEncryption'

vi.mock('../../src/utils/streamingEncryption', () => ({
    encryptAndUploadStreaming: vi.fn(async () => ({
        objectKey: 'files/demo.enc',
        keyHex: 'key',
        ivHex: 'iv',
        totalChunks: 1,
        chunkSizes: null,
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

    it('rejects invalid max-download values', async () => {
        const { container } = render(<HomePage />)
        selectFile(container)
        const uploadSpy = vi.mocked(encryptAndUploadStreaming)

        fireEvent.change(screen.getByPlaceholderText('Unlimited'), { target: { value: '0' } })
        fireEvent.click(screen.getByRole('button', { name: /secure & send/i }))

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Download limit must be a whole number greater than 0'))
        })
        expect(uploadSpy).not.toHaveBeenCalled()
    })

    it('rejects non-integer max-download values', async () => {
        const { container } = render(<HomePage />)
        selectFile(container)
        const uploadSpy = vi.mocked(encryptAndUploadStreaming)

        fireEvent.change(screen.getByPlaceholderText('Unlimited'), { target: { value: '1.9' } })
        fireEvent.click(screen.getByRole('button', { name: /secure & send/i }))

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Download limit must be a whole number greater than 0'))
        })
        expect(uploadSpy).not.toHaveBeenCalled()
    })

    it('rejects password confirmation mismatch', async () => {
        const { container } = render(<HomePage />)
        selectFile(container)
        const uploadSpy = vi.mocked(encryptAndUploadStreaming)

        fireEvent.change(screen.getByPlaceholderText('Leave blank for no password'), { target: { value: 'abcd1234' } })
        fireEvent.change(screen.getByPlaceholderText('Repeat password'), { target: { value: 'wrong' } })
        fireEvent.click(screen.getByRole('button', { name: /secure & send/i }))

        await waitFor(() => {
            expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Password confirmation does not match'))
        })
        expect(uploadSpy).not.toHaveBeenCalled()
    })

    it('prefers short links when the backend returns shortId', async () => {
        const { container } = render(<HomePage />)
        selectFile(container)

        fireEvent.click(screen.getByRole('button', { name: /secure & send/i }))

        await screen.findByText(/file uploaded successfully/i)
        expect(screen.getByText(/\/s\/Short123#key=key&iv=iv/i)).toBeInTheDocument()
    })
})
