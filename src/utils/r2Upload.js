/**
 * R2 Upload Client - Handles multipart uploads to Cloudflare R2
 * Uses S3-compatible API for chunked uploads with parallel processing
 */

const MAX_CONCURRENT_UPLOADS = 3
const SIMPLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024 // 5MB - files smaller than this use simple upload

/**
 * Upload encrypted file to R2
 * Automatically chooses simple or multipart upload based on file size
 * @param {ArrayBuffer[]} encryptedChunks - Encrypted chunks
 * @param {ArrayBuffer[]} authTags - Auth tags for each chunk
 * @param {string} fileId - Unique file identifier
 * @param {Function} onProgress - Progress callback (percent, stage)
 * @returns {Object} - { objectKey, totalChunks }
 */
export async function uploadToR2(encryptedChunks, authTags, fileId, onProgress = () => { }) {
    // Calculate total size
    const totalSize = encryptedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)

    // Use simple upload for small files (single chunk under 5MB)
    if (encryptedChunks.length === 1 && totalSize < SIMPLE_UPLOAD_THRESHOLD) {
        return simpleUploadToR2(encryptedChunks[0], authTags[0], fileId, onProgress)
    }

    // Use multipart upload for larger files
    return multipartUploadToR2(encryptedChunks, authTags, fileId, onProgress)
}

/**
 * Simple single-file upload for small files
 */
export async function simpleUploadToR2(encryptedChunk, authTag, fileId, onProgress) {
    onProgress(0, 'initiating')

    // Get presigned URL
    const response = await fetch('/api/r2/simple-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId })
    })

    if (!response.ok) {
        throw new Error('Failed to get upload URL')
    }

    const { presignedUrl, objectKey } = await response.json()

    onProgress(10, 'uploading')

    // Combine chunk + authTag
    const combined = new Uint8Array(encryptedChunk.byteLength + authTag.byteLength)
    combined.set(new Uint8Array(encryptedChunk), 0)
    combined.set(new Uint8Array(authTag), encryptedChunk.byteLength)

    // Upload directly to R2
    const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: combined,
        headers: { 'Content-Type': 'application/octet-stream' }
    })

    if (!uploadResponse.ok) {
        throw new Error('Failed to upload file')
    }

    onProgress(100, 'complete')

    return { objectKey, totalChunks: 1 }
}

/**
 * Multipart upload for larger files
 */
async function multipartUploadToR2(encryptedChunks, authTags, fileId, onProgress) {
    const totalChunks = encryptedChunks.length

    onProgress(0, 'initiating')

    // 1. Initiate multipart upload
    const { uploadId, objectKey } = await initiateMultipartUpload(fileId)

    try {
        onProgress(5, 'uploading')

        // 2. Upload chunks in parallel (max 3 concurrent)
        const parts = []
        const chunkSizes = [] // Track sizes for download
        let completedChunks = 0

        // Create upload queue
        const uploadQueue = encryptedChunks.map((chunk, index) => ({
            chunk,
            authTag: authTags[index],
            partNumber: index + 1 // S3 parts are 1-indexed
        }))

        // Process queue with concurrency limit
        const uploadPart = async (item) => {
            const { chunk, authTag, partNumber } = item

            // Combine chunk + authTag for storage
            const combined = new Uint8Array(chunk.byteLength + authTag.byteLength)
            combined.set(new Uint8Array(chunk), 0)
            combined.set(new Uint8Array(authTag), chunk.byteLength)

            // Track chunk size (encrypted + auth tag)
            chunkSizes[partNumber - 1] = combined.byteLength

            const { etag } = await uploadChunkToR2(objectKey, uploadId, partNumber, combined)

            parts[partNumber - 1] = { partNumber, etag }
            completedChunks++

            const progress = 5 + (completedChunks / totalChunks) * 90 // 5-95%
            onProgress(progress, 'uploading')
        }

        // Parallel upload with concurrency limit
        await parallelProcess(uploadQueue, uploadPart, MAX_CONCURRENT_UPLOADS)

        onProgress(95, 'finalizing')

        // 3. Complete multipart upload
        await completeMultipartUpload(objectKey, uploadId, parts)

        onProgress(100, 'complete')

        return { objectKey, totalChunks, chunkSizes }
    } catch (error) {
        // Abort multipart upload on failure to prevent stale uploads in R2
        try {
            await fetch(`/api/r2/abort-upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ objectKey, uploadId })
            })
        } catch {
            // Best-effort abort — cleanup scripts will handle stale uploads
        }
        throw error
    }
}



/**
 * Process items in parallel with concurrency limit
 */
async function parallelProcess(items, processFn, concurrency) {
    const results = []
    let index = 0

    async function worker() {
        while (index < items.length) {
            const currentIndex = index++
            results[currentIndex] = await processFn(items[currentIndex])
        }
    }

    await Promise.all(Array(Math.min(concurrency, items.length)).fill().map(worker))
    return results
}

/**
 * Initiate multipart upload (calls server endpoint)
 */
export async function initiateMultipartUpload(fileId) {
    const response = await fetch('/api/r2/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId })
    })

    if (!response.ok) {
        throw new Error('Failed to initiate multipart upload')
    }

    return response.json()
}

/**
 * Upload single chunk to R2
 */
export async function uploadChunkToR2(objectKey, uploadId, partNumber, data) {
    // Get presigned URL for this part
    const urlResponse = await fetch('/api/r2/presign-part', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectKey, uploadId, partNumber })
    })

    if (!urlResponse.ok) {
        throw new Error(`Failed to get presigned URL for part ${partNumber}`)
    }

    const { presignedUrl } = await urlResponse.json()

    // Upload directly to R2
    const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        body: data,
        headers: { 'Content-Type': 'application/octet-stream' }
    })

    if (!uploadResponse.ok) {
        throw new Error(`Failed to upload part ${partNumber}`)
    }

    const etag = uploadResponse.headers.get('ETag')
    if (!etag) {
        throw new Error('Missing ETag from upload response — ensure R2 bucket CORS includes ExposeHeaders: ["ETag"]')
    }
    return { etag }
}

/**
 * Complete multipart upload
 */
export async function completeMultipartUpload(objectKey, uploadId, parts) {
    const response = await fetch('/api/r2/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectKey, uploadId, parts })
    })

    if (!response.ok) {
        throw new Error('Failed to complete multipart upload')
    }

    return response.json()
}

/**
 * Download file from R2
 * For simple uploads (1 chunk), downloads entire file
 * For multipart uploads, downloads entire file and splits chunks using stored sizes
 * @deprecated This function loads the entire file into memory. For large files,
 * use downloadAndDecryptStreaming() in streamingEncryption.js instead.
 * Retained only as a legacy fallback for small files.
 * @param {string} objectKey - R2 object key
 * @param {number} totalChunks - Expected number of chunks
 * @param {number[]|null} chunkSizes - Size of each stored chunk (encrypted + auth tag)
 * @param {Function} onProgress - Progress callback
 * @returns {Object} - { encryptedChunks, authTags }
 */
export async function downloadFromR2(objectKey, totalChunks, chunkSizes = null, onProgress = () => { }) {
    onProgress(0, 'downloading')

    // Get presigned download URL
    const urlResponse = await fetch(`/api/r2/download/${encodeURIComponent(objectKey)}`)

    if (!urlResponse.ok) {
        throw new Error('Failed to get download URL')
    }

    const { presignedUrl } = await urlResponse.json()

    onProgress(10, 'downloading')

    // Download the full encrypted file from R2
    const downloadResponse = await fetch(presignedUrl)

    if (!downloadResponse.ok) {
        throw new Error('Failed to download file from storage')
    }

    const data = await downloadResponse.arrayBuffer()

    onProgress(80, 'processing')

    // For single chunk files (simple upload)
    if (totalChunks === 1) {
        // Data = encrypted content + 16-byte auth tag
        const encryptedChunks = [data.slice(0, -16)]
        const authTags = [data.slice(-16)]

        onProgress(100, 'complete')
        return { encryptedChunks, authTags }
    }

    // For multipart uploads, split using chunk sizes
    if (!chunkSizes || chunkSizes.length !== totalChunks) {
        throw new Error('Chunk size information missing - cannot reconstruct file')
    }

    const encryptedChunks = []
    const authTags = []
    let offset = 0

    for (let i = 0; i < totalChunks; i++) {
        const chunkTotalSize = chunkSizes[i]
        const chunkData = data.slice(offset, offset + chunkTotalSize)

        // Each chunk = encrypted data + 16-byte auth tag
        encryptedChunks[i] = chunkData.slice(0, -16)
        authTags[i] = chunkData.slice(-16)

        offset += chunkTotalSize

        const progress = 80 + ((i + 1) / totalChunks) * 20
        onProgress(progress, 'processing')
    }

    onProgress(100, 'complete')
    return { encryptedChunks, authTags }
}


