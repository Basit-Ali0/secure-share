// Client-side utilities for hybrid encryption mode
// Generates ephemeral key and combines with server key for download

/**
 * Generate client ephemeral key for hybrid encryption
 * @returns {string} Random key in hex format
 */
export function generateClientKey() {
    const keyArray = new Uint8Array(16) // 128 bits
    crypto.getRandomValues(keyArray)
    return arrayBufferToHex(keyArray.buffer)
}

/**
 * Decrypt file in browser using hybrid keys
 * @param {Blob} encryptedBlob - Encrypted file
 * @param {string} serverKeyHex - Server key from download
 * @param {string} clientKeyHex - Client key from URL fragment
 * @param {string} ivHex - IV
 * @param {string} authTagHex - Auth tag
 * @returns {Promise<Blob>} Decrypted file
 */
export async function decryptFileHybrid(encryptedBlob, serverKeyHex, clientKeyHex, ivHex, authTagHex) {
    console.log('[Hybrid Decrypt] Server key length:', serverKeyHex.length, 'chars')
    console.log('[Hybrid Decrypt] Client key length:', clientKeyHex.length, 'chars')
    console.log('[Hybrid Decrypt] IV length:', ivHex.length, 'chars')
    console.log('[Hybrid Decrypt] Auth tag length:', authTagHex.length, 'chars')

    // Combine server and client keys
    const serverKeyBytes = hexToArrayBuffer(serverKeyHex)
    const clientKeyBytes = hexToArrayBuffer(clientKeyHex)

    console.log('[Hybrid Decrypt] Server key bytes:', serverKeyBytes.byteLength)
    console.log('[Hybrid Decrypt] Client key bytes:', clientKeyBytes.byteLength)

    const combinedKeyBytes = new Uint8Array(32) // 256 bits
    combinedKeyBytes.set(new Uint8Array(serverKeyBytes), 0)
    combinedKeyBytes.set(new Uint8Array(clientKeyBytes), 16)

    console.log('[Hybrid Decrypt] Combined key length:', combinedKeyBytes.length, 'bytes')

    // Import combined key
    const key = await crypto.subtle.importKey(
        'raw',
        combinedKeyBytes,
        'AES-GCM',
        false,
        ['decrypt']
    )

    const iv = hexToArrayBuffer(ivHex)
    const authTag = hexToArrayBuffer(authTagHex)

    // Read encrypted blob
    const encryptedBuffer = await encryptedBlob.arrayBuffer()

    console.log('[Hybrid Decrypt] Encrypted data length:', encryptedBuffer.byteLength, 'bytes')
    console.log('[Hybrid Decrypt] Auth tag length:', authTag.byteLength, 'bytes')

    // For GCM mode, append auth tag to ciphertext
    // Web Crypto API expects: ciphertext + authTag as one buffer
    const dataWithTag = new Uint8Array(encryptedBuffer.byteLength + authTag.byteLength)
    dataWithTag.set(new Uint8Array(encryptedBuffer), 0)
    dataWithTag.set(new Uint8Array(authTag), encryptedBuffer.byteLength)

    console.log('[Hybrid Decrypt] Data with tag length:', dataWithTag.byteLength, 'bytes')

    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: new Uint8Array(iv),
                tagLength: 128 // 16 bytes = 128 bits
            },
            key,
            dataWithTag
        )

        console.log('[Hybrid Decrypt] Decryption successful!', decryptedBuffer.byteLength, 'bytes')
        return new Blob([decryptedBuffer])
    } catch (error) {
        console.error('[Hybrid Decrypt] Decryption error:', error)
        throw new Error(`Decryption failed: ${error.message}. File may be corrupted or keys are incorrect.`)
    }
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
    if (!hex || hex.length === 0) {
        throw new Error('Invalid hex string: empty or null')
    }
    if (hex.length % 2 !== 0) {
        throw new Error(`Invalid hex string length:${hex.length}. Must be even.`)
    }

    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes.buffer
}
