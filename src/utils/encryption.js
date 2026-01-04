// Client-side encryption utilities using Web Crypto API
// Zero-knowledge: encryption happens in browser, server never sees keys

/**
 * Encrypts a file using AES-256-GCM
 * @param {File} file - The file to encrypt
 * @returns {Promise<{encryptedBlob: Blob, key: string, iv: string}>}
 */
export async function encryptFile(file) {
    // Generate random encryption key (256-bit for AES-256)
    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable
        ['encrypt', 'decrypt']
    )

    // Generate random initialization vector (96-bit for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Read file as array buffer
    const fileBuffer = await file.arrayBuffer()

    // Encrypt the file
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        fileBuffer
    )

    // Export key to share in URL
    const exportedKey = await crypto.subtle.exportKey('raw', key)

    return {
        encryptedBlob: new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
        key: arrayBufferToHex(exportedKey),
        iv: arrayBufferToHex(iv),
        originalName: file.name,
        originalType: file.type,
        originalSize: file.size
    }
}

/**
 * Decrypts a file using AES-256-GCM
 * @param {Blob} encryptedBlob - The encrypted file blob
 * @param {string} keyHex - Encryption key in hex format
 * @param {string} ivHex - IV in hex format
 * @returns {Promise<Blob>}
 */
export async function decryptFile(encryptedBlob, keyHex, ivHex) {
    // Import the key
    const keyBuffer = hexToArrayBuffer(keyHex)
    const key = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        'AES-GCM',
        false,
        ['decrypt']
    )

    // Convert IV from hex
    const iv = hexToArrayBuffer(ivHex)

    // Read encrypted blob as array buffer
    const encryptedBuffer = await encryptedBlob.arrayBuffer()

    // Decrypt
    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            encryptedBuffer
        )

        return new Blob([decryptedBuffer])
    } catch (error) {
        throw new Error('Decryption failed. Invalid key or corrupted file.')
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
