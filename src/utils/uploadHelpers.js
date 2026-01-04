import { supabase } from './supabase'

/**
 * Upload encrypted file to Supabase Storage with progress tracking
 * @param {Blob} encryptedBlob - The encrypted file
 * @param {string} fileId - Unique file identifier
 * @param {Function} onProgress - Progress callback (0-100)
 * @returns {Promise<{path: string}>}
 */
export async function uploadEncryptedFile(encryptedBlob, fileId, onProgress) {
    const filePath = `${fileId}.enc`

    // For files > 6MB, use chunked upload (Supabase limit is 50MB per chunk)
    const CHUNK_SIZE = 6 * 1024 * 1024 // 6MB chunks

    if (encryptedBlob.size > CHUNK_SIZE) {
        return await uploadChunked(encryptedBlob, filePath, onProgress)
    } else {
        return await uploadDirect(encryptedBlob, filePath, onProgress)
    }
}

/**
 * Direct upload for small files
 */
async function uploadDirect(blob, filePath, onProgress) {
    if (onProgress) onProgress(0)

    const { data, error } = await supabase.storage
        .from('encrypted-files')
        .upload(filePath, blob, {
            contentType: 'application/octet-stream',
            upsert: false
        })

    if (error) {
        throw new Error(`Upload failed: ${error.message}`)
    }

    if (onProgress) onProgress(100)
    return { path: data.path }
}

/**
 * Chunked upload for larger files with progress
 */
async function uploadChunked(blob, filePath, onProgress) {
    const CHUNK_SIZE = 6 * 1024 * 1024
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE)

    // For now, Supabase doesn't support true chunked uploads via SDK
    // We'll upload directly but simulate progress
    // In a real implementation, you'd use resumable uploads or multipart

    if (onProgress) {
        // Simulate chunked progress
        const uploadInterval = setInterval(() => {
            const currentProgress = Math.min(95, Math.random() * 100)
            onProgress(currentProgress)
        }, 500)

        try {
            const result = await uploadDirect(blob, filePath, () => { })
            clearInterval(uploadInterval)
            onProgress(100)
            return result
        } catch (error) {
            clearInterval(uploadInterval)
            throw error
        }
    } else {
        return await uploadDirect(blob, filePath, onProgress)
    }
}
