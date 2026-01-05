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
    // Combine server and client keys
    const serverKeyBytes = hexToArrayBuffer(serverKeyHex)
    const clientKeyBytes = hexToArrayBuffer(clientKeyHex)

    const combinedKeyBytes = new Uint8Array(32) // 256 bits
    combinedKeyBytes.set(new Uint8Array(serverKeyBytes), 0)
    combinedKeyBytes.set(new Uint8Array(clientKeyBytes), 16)

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

    // Append auth tag to encrypted data (required for GCM)
    const dataWithTag = new Uint8Array(encryptedBuffer.byteLength + authTag.byteLength)
    dataWithTag.set(new Uint8Array(encryptedBuffer), 0)
    dataWithTag.set(new Uint8Array(authTag), encryptedBuffer.byteLength)

    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv) },
            key,
            dataWithTag
        )

        return new Blob([decryptedBuffer])
    } catch (error) {
        throw new Error('Decryption failed. File may be corrupted or keys are incorrect.')
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
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes.buffer
}
