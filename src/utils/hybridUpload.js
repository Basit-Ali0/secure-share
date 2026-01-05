import { supabase } from './supabase'
import { generateClientKey } from './hybridEncryption'

/**
 * Upload file with hybrid encryption (fast mode)
 * @param {File} file - Original file (not encrypted)
 * @param {string} fileId - Unique file ID
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{path: string, clientKey: string, serverKey: string, iv: string, authTag: string}>}
 */
export async function uploadFileHybrid(file, fileId, onProgress) {
    // Generate client ephemeral key
    const clientKey = generateClientKey()

    if (onProgress) onProgress(10)

    // Create form data
    const formData = new FormData()
    formData.append('file', file)
    formData.append('fileId', fileId)
    formData.append('clientKey', clientKey)

    if (onProgress) onProgress(20)

    // Upload to server for encryption
    const response = await fetch('/api/upload-hybrid', {
        method: 'POST',
        body: formData
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Upload failed')
    }

    const result = await response.json()

    if (onProgress) onProgress(100)

    return {
        path: result.path,
        clientKey,
        serverKey: result.serverKey,
        iv: result.iv,
        authTag: result.authTag
    }
}
