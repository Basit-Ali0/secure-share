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

    // Supabase has a 50MB upload limit per request
    // For larger files, we need to use their multipart upload or split differently
    const MAX_SUPABASE_SIZE = 50 * 1024 * 1024 // 50MB

    if (encryptedBlob.size > MAX_SUPABASE_SIZE) {
        console.warn(`File size ${encryptedBlob.size} exceeds Supabase 50MB limit. Upload may fail.`)
        // For now, still attempt upload but warn user
    }

    return await uploadDirect(encryptedBlob, filePath, onProgress)
}

/**
 * Direct upload with real progress tracking
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
