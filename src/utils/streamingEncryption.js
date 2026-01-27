/**
 * Streaming Encryption - High-performance zero-knowledge encryption
 * Uses chunked processing + Web Workers for large file support
 */

import { chunkFile, getOptimalChunkSize, getChunkCount } from './fileChunker.js'
import { getWorkerPool, terminateWorkerPool } from './workerPool.js'

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
 * Decrypt chunks using streaming decryption
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
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes.buffer
}

export { terminateWorkerPool }
