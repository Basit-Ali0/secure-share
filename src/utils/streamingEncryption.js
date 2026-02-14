/**
 * Streaming Encryption - High-performance zero-knowledge encryption
 * Uses chunked processing + Web Workers for large file support
 */

import { chunkFile, getOptimalChunkSize, getChunkCount } from './fileChunker.js'
import { getWorkerPool, terminateWorkerPool } from './workerPool.js'
import {
    simpleUploadToR2,
    initiateMultipartUpload,
    uploadChunkToR2,
    completeMultipartUpload
} from './r2Upload.js'

/**
 * Generate encryption key and IV
 * @returns {Object} - { key, iv, keyHex, ivHex }
 */
export async function generateEncryptionKeys() {
    const key = crypto.getRandomValues(new Uint8Array(32)) // 256-bit key
    const iv = crypto.getRandomValues(new Uint8Array(12))  // 96-bit IV for GCM

    return {
        key,
        iv,
        keyHex: arrayBufferToHex(key.buffer),
        ivHex: arrayBufferToHex(iv.buffer)
    }
}

/**
 * Encrypt file using streaming chunked encryption
 * @param {File} file - File to encrypt
 * @param {Function} onProgress - Progress callback (percent, stage, chunkIndex)
 * @returns {Object} - { encryptedChunks[], authTags[], keyHex, ivHex, totalChunks }
 */
export async function encryptFileStreaming(file, onProgress = () => { }) {
    const { key, iv, keyHex, ivHex } = await generateEncryptionKeys()
    const chunkSize = getOptimalChunkSize(file.size)
    const totalChunks = getChunkCount(file, chunkSize)

    const pool = getWorkerPool()
    await pool.init()

    const encryptedChunks = []
    const authTags = []

    onProgress(0, 'encrypting', 0, totalChunks)

    // Process chunks through worker pool
    const encryptionPromises = []

    for await (const chunk of chunkFile(file, chunkSize)) {
        const promise = pool.encryptChunk(chunk.buffer, key, iv, chunk.index)
            .then(result => {
                encryptedChunks[result.chunkIndex] = result.encryptedBuffer
                authTags[result.chunkIndex] = result.authTag

                const completedCount = encryptedChunks.filter(Boolean).length
                const progress = (completedCount / totalChunks) * 100
                onProgress(progress, 'encrypting', completedCount, totalChunks)
            })

        encryptionPromises.push(promise)
    }

    // Wait for all encryption to complete
    await Promise.all(encryptionPromises)

    onProgress(100, 'encrypted', totalChunks, totalChunks)

    return {
        encryptedChunks,
        authTags,
        keyHex,
        ivHex,
        totalChunks,
        originalSize: file.size,
        originalName: file.name,
        originalType: file.type
    }
}

/**
 * Streaming encrypt + upload pipeline (memory-efficient)
 * Encrypts one chunk → uploads it → frees it → next chunk
 * Peak memory: ~1-2 chunks (~200MB) instead of entire file
 *
 * @param {File} file - File to encrypt and upload
 * @param {string} fileId - Unique file identifier
 * @param {Function} onProgress - Progress callback (percent, statusText)
 * @returns {Object} - { objectKey, keyHex, ivHex, totalChunks, chunkSizes }
 */
export async function encryptAndUploadStreaming(file, fileId, onProgress = () => { }) {
    const { key, iv, keyHex, ivHex } = await generateEncryptionKeys()
    const chunkSize = getOptimalChunkSize(file.size)
    const totalChunks = getChunkCount(file, chunkSize)

    const pool = getWorkerPool()
    await pool.init()

    const SIMPLE_THRESHOLD = 5 * 1024 * 1024 // 5MB

    // --- Simple upload for small files (single chunk < 5MB) ---
    if (totalChunks === 1 && file.size < SIMPLE_THRESHOLD) {
        onProgress(5, 'Encrypting...')

        const chunk = file.slice(0, file.size)
        const buffer = await chunk.arrayBuffer()
        const result = await pool.encryptChunk(buffer, key, iv, 0)

        onProgress(30, 'Uploading...')

        const { objectKey } = await simpleUploadToR2(
            result.encryptedBuffer,
            result.authTag,
            fileId,
            (p) => onProgress(30 + p * 0.65, 'Uploading...')
        )

        onProgress(100, 'Complete!')
        return { objectKey, keyHex, ivHex, totalChunks: 1, chunkSizes: null }
    }

    // --- Pipelined multipart: encrypt → upload → free per chunk ---
    onProgress(2, 'Starting upload...')

    const { uploadId, objectKey } = await initiateMultipartUpload(fileId)

    const parts = []
    const chunkSizes = []
    let completedChunks = 0

    onProgress(5, `Encrypting & uploading (0/${totalChunks})...`)

    for await (const chunk of chunkFile(file, chunkSize)) {
        // 1. Encrypt this chunk
        const encResult = await pool.encryptChunk(chunk.buffer, key, iv, chunk.index)

        // 2. Combine encrypted data + auth tag
        const combined = new Uint8Array(encResult.encryptedBuffer.byteLength + encResult.authTag.byteLength)
        combined.set(new Uint8Array(encResult.encryptedBuffer), 0)
        combined.set(new Uint8Array(encResult.authTag), encResult.encryptedBuffer.byteLength)

        chunkSizes[chunk.index] = combined.byteLength

        // 3. Upload this chunk immediately
        const partNumber = chunk.index + 1
        const { etag } = await uploadChunkToR2(objectKey, uploadId, partNumber, combined)

        parts[chunk.index] = { partNumber, etag }
        completedChunks++

        // 4. Report progress (5% - 95%)
        const progress = 5 + (completedChunks / totalChunks) * 90
        onProgress(progress, `Encrypting & uploading (${completedChunks}/${totalChunks})...`)

        // encResult and combined go out of scope here → GC can free them
    }

    // 5. Complete multipart upload
    onProgress(96, 'Finalizing...')
    await completeMultipartUpload(objectKey, uploadId, parts)

    onProgress(100, 'Complete!')
    return { objectKey, keyHex, ivHex, totalChunks, chunkSizes }
}

/**
 * Streaming download + decrypt + save pipeline (memory-efficient)
 * Downloads one chunk at a time via Range requests → decrypts → writes to disk
 * Peak memory: ~200MB (1-2 chunks) instead of entire file
 *
 * @param {string} objectKey - R2 object key
 * @param {number} totalChunks - Number of chunks
 * @param {number[]|null} chunkSizes - Size of each stored chunk (encrypted + auth tag)
 * @param {string} keyHex - Encryption key (hex)
 * @param {string} ivHex - Base IV (hex)
 * @param {string} fileName - Original file name for save dialog
 * @param {Function} onProgress - Progress callback (percent, statusText)
 */
export async function downloadAndDecryptStreaming(
    objectKey, totalChunks, chunkSizes, keyHex, ivHex, fileName, onProgress = () => { }
) {
    const key = new Uint8Array(hexToArrayBuffer(keyHex))
    const iv = new Uint8Array(hexToArrayBuffer(ivHex))

    const pool = getWorkerPool()
    await pool.init()

    onProgress(2, 'Getting download URL...')

    // Get presigned download URL
    const urlResponse = await fetch(`/api/r2/download/${encodeURIComponent(objectKey)}`)
    if (!urlResponse.ok) {
        throw new Error('Failed to get download URL')
    }
    const { presignedUrl } = await urlResponse.json()

    // Multi-chunk file missing chunkSizes — cannot proceed
    if (totalChunks > 1 && !chunkSizes) {
        throw new Error('Missing chunkSizes metadata for multi-chunk file — cannot determine byte ranges for download')
    }

    // --- Single chunk / small file: download all at once (fine for < ~100MB) ---
    if (totalChunks === 1) {
        onProgress(5, 'Downloading...')

        const downloadResponse = await fetch(presignedUrl)
        if (!downloadResponse.ok) throw new Error('Failed to download file')

        const data = await downloadResponse.arrayBuffer()
        onProgress(40, 'Decrypting...')

        // Split: encrypted content + 16-byte auth tag
        const encryptedData = data.slice(0, -16)
        const authTag = data.slice(-16)

        const result = await pool.decryptChunk(encryptedData, authTag, key, iv, 0)
        onProgress(90, 'Preparing download...')

        const blob = new Blob([new Uint8Array(result.decryptedBuffer)])
        triggerBlobDownload(blob, fileName)

        onProgress(100, 'Complete!')
        return
    }

    // --- Multi-chunk: Range-request per chunk → decrypt → write to file ---

    // Try File System Access API for streaming writes (Chrome/Edge)
    let fileHandle = null
    let writableStream = null
    const useStreamingSave = typeof window.showSaveFilePicker === 'function'

    if (useStreamingSave) {
        try {
            fileHandle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'File',
                    accept: { 'application/octet-stream': [] }
                }]
            })
            writableStream = await fileHandle.createWritable()
        } catch (e) {
            // User cancelled save dialog or API not available
            if (e.name === 'AbortError') throw new Error('Download cancelled')
            // Fall back to in-memory approach
            writableStream = null
        }
    }

    // Fallback: collect decrypted chunks in memory (for Firefox/Safari)
    const decryptedParts = writableStream ? null : []

    // Calculate byte ranges from chunkSizes
    let byteOffset = 0
    const ranges = chunkSizes.map(size => {
        const start = byteOffset
        const end = byteOffset + size - 1
        byteOffset += size
        return { start, end, size }
    })

    let completedChunks = 0

    for (let i = 0; i < totalChunks; i++) {
        const range = ranges[i]

        // 1. Download this chunk using Range header
        const chunkResponse = await fetch(presignedUrl, {
            headers: { 'Range': `bytes=${range.start}-${range.end}` }
        })

        if (!chunkResponse.ok) {
            throw new Error(`Failed to download chunk ${i + 1}`)
        }

        const chunkData = await chunkResponse.arrayBuffer()

        // 2. Split: encrypted data + 16-byte auth tag
        const encryptedData = chunkData.slice(0, -16)
        const authTag = chunkData.slice(-16)

        // 3. Decrypt this chunk
        const result = await pool.decryptChunk(encryptedData, authTag, key, iv, i)

        // 4. Write decrypted data
        if (writableStream) {
            await writableStream.write(new Uint8Array(result.decryptedBuffer))
        } else {
            decryptedParts.push(new Uint8Array(result.decryptedBuffer))
        }

        completedChunks++
        const progress = 5 + (completedChunks / totalChunks) * 90
        onProgress(progress, `Downloading & decrypting (${completedChunks}/${totalChunks})...`)

        // chunkData, encryptedData, result go out of scope → GC can free them
    }

    // 5. Finalize
    if (writableStream) {
        await writableStream.close()
        onProgress(100, 'Complete!')
    } else {
        // Fallback: combine and trigger download
        onProgress(96, 'Preparing download...')
        const blob = new Blob(decryptedParts)
        triggerBlobDownload(blob, fileName)
        onProgress(100, 'Complete!')
    }
}

/**
 * Trigger browser download from a Blob
 */
function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Decrypt chunks using streaming decryption (legacy — used for in-memory approach)
 * @param {ArrayBuffer[]} encryptedChunks - Encrypted chunks
 * @param {ArrayBuffer[]} authTags - Auth tags for each chunk
 * @param {string} keyHex - Encryption key (hex)
 * @param {string} ivHex - Base IV (hex)
 * @param {Function} onProgress - Progress callback
 * @returns {Blob} - Decrypted file
 */
export async function decryptFileStreaming(encryptedChunks, authTags, keyHex, ivHex, onProgress = () => { }) {
    const key = new Uint8Array(hexToArrayBuffer(keyHex))
    const iv = new Uint8Array(hexToArrayBuffer(ivHex))
    const totalChunks = encryptedChunks.length

    const pool = getWorkerPool()
    await pool.init()

    const decryptedChunks = []

    onProgress(0, 'decrypting', 0, totalChunks)

    const decryptionPromises = encryptedChunks.map((chunk, index) =>
        pool.decryptChunk(chunk, authTags[index], key, iv, index)
            .then(result => {
                decryptedChunks[result.chunkIndex] = result.decryptedBuffer

                const completedCount = decryptedChunks.filter(Boolean).length
                const progress = (completedCount / totalChunks) * 100
                onProgress(progress, 'decrypting', completedCount, totalChunks)
            })
    )

    await Promise.all(decryptionPromises)

    onProgress(100, 'decrypted', totalChunks, totalChunks)

    // Combine all chunks into single blob
    return new Blob(decryptedChunks.map(buf => new Uint8Array(buf)))
}

/**
 * Convert ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Convert hex string to ArrayBuffer
 */
function hexToArrayBuffer(hex) {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes.buffer
}

export { terminateWorkerPool }
