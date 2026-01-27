/**
 * R2 Upload Client - Handles multipart uploads to Cloudflare R2
 * Uses S3-compatible API for chunked uploads with parallel processing
 */

const MAX_CONCURRENT_UPLOADS = 3

/**
 * Upload encrypted file to R2 using multipart upload
 * @param {ArrayBuffer[]} encryptedChunks - Encrypted chunks
 * @param {ArrayBuffer[]} authTags - Auth tags for each chunk
 * @param {string} fileId - Unique file identifier
 * @param {Function} onProgress - Progress callback (percent, stage)
 * @returns {Object} - { objectKey, etags }
 */
export async function uploadToR2(encryptedChunks, authTags, fileId, onProgress = () => { }) {
    const totalChunks = encryptedChunks.length

    onProgress(0, 'initiating')

    // 1. Initiate multipart upload
    const { uploadId, objectKey } = await initiateMultipartUpload(fileId)

    onProgress(5, 'uploading')

    // 2. Upload chunks in parallel (max 3 concurrent)
    const parts = []
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

    return { objectKey, totalChunks }
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
async function initiateMultipartUpload(fileId) {
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
async function uploadChunkToR2(objectKey, uploadId, partNumber, data) {
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
    return { etag }
}

/**
 * Complete multipart upload
 */
async function completeMultipartUpload(objectKey, uploadId, parts) {
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
 * Download file from R2 in chunks
 * @param {string} objectKey - R2 object key
 * @param {number} totalChunks - Expected number of chunks
 * @param {Function} onProgress - Progress callback
 * @returns {Object} - { encryptedChunks, authTags }
 */
export async function downloadFromR2(objectKey, totalChunks, onProgress = () => { }) {
    const encryptedChunks = []
    const authTags = []

    onProgress(0, 'downloading')

    // Download all chunks
    for (let i = 0; i < totalChunks; i++) {
        const response = await fetch(`/api/r2/download/${objectKey}?part=${i + 1}`)

        if (!response.ok) {
            throw new Error(`Failed to download part ${i + 1}`)
        }

        const data = await response.arrayBuffer()

        // Split chunk and authTag (authTag is last 16 bytes)
        encryptedChunks[i] = data.slice(0, -16)
        authTags[i] = data.slice(-16)

        const progress = ((i + 1) / totalChunks) * 100
        onProgress(progress, 'downloading')
    }

    return { encryptedChunks, authTags }
}
