/**
 * Encryption Worker - Runs in separate thread for non-blocking encryption
 * Uses Web Crypto API (SubtleCrypto) for native AES-256-GCM encryption
 */

// Worker message handler
self.onmessage = async function (e) {
    const { type, payload, requestId } = e.data

    try {
        switch (type) {
            case 'ENCRYPT_CHUNK': {
                const result = await encryptChunk(payload)
                self.postMessage(
                    { type: 'ENCRYPT_RESULT', payload: result, requestId },
                    [result.encryptedBuffer, result.authTag]
                )
                break
            }

            case 'DECRYPT_CHUNK': {
                const decrypted = await decryptChunk(payload)
                self.postMessage(
                    { type: 'DECRYPT_RESULT', payload: decrypted, requestId },
                    [decrypted.decryptedBuffer]
                )
                break
            }

            default:
                throw new Error(`Unknown message type: ${type}`)
        }
    } catch (error) {
        self.postMessage({ type: 'ERROR', error: error.message, requestId })
    }
}

/**
 * Encrypt a single chunk
 * @param {Object} payload - { buffer, keyBytes, baseIv, chunkIndex }
 * @returns {Object} - { encryptedBuffer, authTag, chunkIndex }
 */
async function encryptChunk({ buffer, keyBytes, baseIv, chunkIndex }) {
    // Derive unique IV for this chunk (baseIV XOR chunkIndex)
    const chunkIv = deriveChunkIV(baseIv, chunkIndex)

    // Import key
    const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    )

    // Encrypt
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: chunkIv, tagLength: 128 },
        key,
        buffer
    )

    // Extract auth tag (last 16 bytes of encrypted data in GCM)
    const encryptedData = new Uint8Array(encryptedBuffer.slice(0, -16))
    const authTag = new Uint8Array(encryptedBuffer.slice(-16))

    return {
        encryptedBuffer: encryptedData.buffer,
        authTag: authTag.buffer,
        chunkIndex
    }
}

/**
 * Decrypt a single chunk
 * @param {Object} payload - { encryptedBuffer, authTag, keyBytes, baseIv, chunkIndex }
 * @returns {Object} - { decryptedBuffer, chunkIndex }
 */
async function decryptChunk({ encryptedBuffer, authTag, keyBytes, baseIv, chunkIndex }) {
    // Derive unique IV for this chunk
    const chunkIv = deriveChunkIV(baseIv, chunkIndex)

    // Import key
    const key = await crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    )

    // Combine encrypted data + auth tag for decryption
    const combined = new Uint8Array(encryptedBuffer.byteLength + authTag.byteLength)
    combined.set(new Uint8Array(encryptedBuffer), 0)
    combined.set(new Uint8Array(authTag), encryptedBuffer.byteLength)

    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: chunkIv, tagLength: 128 },
        key,
        combined
    )

    return {
        decryptedBuffer,
        chunkIndex
    }
}

/**
 * Derive unique IV for each chunk by XORing chunk index into base IV
 * This ensures each chunk has a unique IV while using the same key
 * @param {Uint8Array} baseIv - Base IV (12 bytes)
 * @param {number} chunkIndex - Chunk index
 * @returns {Uint8Array} - Unique IV for this chunk
 */
function deriveChunkIV(baseIv, chunkIndex) {
    const iv = new Uint8Array(baseIv)
    // XOR chunk index into last 4 bytes of IV
    const view = new DataView(iv.buffer)
    const current = view.getUint32(8, true) // little-endian
    view.setUint32(8, current ^ chunkIndex, true)
    return iv
}
