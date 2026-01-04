// Web Worker for file encryption
// Runs encryption in background thread to avoid blocking UI

import { encryptFile } from './encryption'

self.addEventListener('message', async (e) => {
    const { type, file } = e.data

    if (type === 'ENCRYPT_FILE') {
        try {
            // Send progress updates
            self.postMessage({ type: 'PROGRESS', progress: 10 })

            const result = await encryptFile(file)

            self.postMessage({ type: 'PROGRESS', progress: 100 })
            self.postMessage({ type: 'SUCCESS', result })
        } catch (error) {
            self.postMessage({ type: 'ERROR', error: error.message })
        }
    }
})
