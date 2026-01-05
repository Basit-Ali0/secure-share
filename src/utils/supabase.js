import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials. Please add them to .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Upload encrypted file to Supabase Storage
 * @param {Blob} encryptedBlob - The encrypted file
 * @param {string} fileId - Unique file identifier
 * @returns {Promise<{path: string}>}
 */
export async function uploadEncryptedFile(encryptedBlob, fileId) {
    const filePath = `${fileId}.enc`

    const { data, error } = await supabase.storage
        .from('encrypted-files')
        .upload(filePath, encryptedBlob, {
            contentType: 'application/octet-stream',
            upsert: false
        })

    if (error) {
        throw new Error(`Upload failed: ${error.message}`)
    }

    return { path: data.path }
}

/**
 * Save file metadata to database (NO ENCRYPTION KEYS!)
 * @param {object} metadata - File metadata
 * @returns {Promise<{fileId: string}>}
 */
export async function saveFileMetadata(metadata) {
    const { data, error } = await supabase
        .from('files')
        .insert({
            file_id: metadata.fileId,
            original_name: metadata.originalName,
            file_type: metadata.fileType,
            file_size: metadata.fileSize,
            storage_path: metadata.storagePath,
            expires_at: metadata.expiresAt,
            password_hash: metadata.passwordHash || null,
            max_downloads: metadata.maxDownloads || null,
            encryption_mode: metadata.encryptionMode || 'zero-knowledge',
            server_key: metadata.serverKey || null,
            iv: metadata.iv || null,
            auth_tag: metadata.authTag || null
        })
        .select()
        .single()

    if (error) {
        throw new Error(`Failed to save metadata: ${error.message}`)
    }

    return data
}

/**
 * Get file metadata from database
 * @param {string} fileId - File identifier
 * @returns {Promise<object>}
 */
export async function getFileMetadata(fileId) {
    const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('file_id', fileId)
        .single()

    if (error) {
        throw new Error(`File not found: ${error.message}`)
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
        throw new Error('File has expired')
    }

    return data
}

/**
 * Download encrypted file from storage
 * @param {string} storagePath - Path in storage
 * @returns {Promise<Blob>}
 */
export async function downloadEncryptedFile(storagePath) {
    const { data, error } = await supabase.storage
        .from('encrypted-files')
        .download(storagePath)

    if (error) {
        throw new Error(`Download failed: ${error.message}`)
    }

    return data
}

/**
 * Increment download count
 * @param {string} fileId - File identifier
 * @returns {Promise<void>}
 */
export async function incrementDownloadCount(fileId) {
    const { error } = await supabase.rpc('increment_download_count', {
        file_id_param: fileId
    })

    if (error) {
        console.error('Failed to increment download count:', error)
    }
}
