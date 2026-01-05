// Server-side encryption utilities for Hybrid mode
// Server encrypts with client-provided ephemeral key

const crypto = require('crypto')

/**
 * Encrypt file on server with hybrid key
 * @param {Buffer} fileBuffer - File data
 * @param {string} clientKeyHex - Client ephemeral key (hex)
 * @returns {object} Encrypted data with server key
 */
function encryptFileHybrid(fileBuffer, clientKeyHex) {
    // Generate server-side key
    const serverKey = crypto.randomBytes(16) // 128 bits

    // Combine client and server keys
    const clientKey = Buffer.from(clientKeyHex, 'hex')
    const combinedKey = Buffer.concat([serverKey, clientKey]) // 256 bits total

    // Generate IV
    const iv = crypto.randomBytes(12) // GCM standard

    // Encrypt with combined key
    const cipher = crypto.createCipheriv('aes-256-gcm', combinedKey, iv)
    const encrypted = Buffer.concat([
        cipher.update(fileBuffer),
        cipher.final()
    ])

    const authTag = cipher.getAuthTag()

    return {
        encryptedData: encrypted,
        serverKey: serverKey.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    }
}

/**
 * Decrypt file with hybrid keys
 * @param {Buffer} encryptedData - Encrypted file
 * @param {string} serverKeyHex - Server key
 * @param {string} clientKeyHex - Client key
 * @param {string} ivHex - IV
 * @param {string} authTagHex - Auth tag
 * @returns {Buffer} Decrypted data
 */
function decryptFileHybrid(encryptedData, serverKeyHex, clientKeyHex, ivHex, authTagHex) {
    // Reconstruct combined key
    const serverKey = Buffer.from(serverKeyHex, 'hex')
    const clientKey = Buffer.from(clientKeyHex, 'hex')
    const combinedKey = Buffer.concat([serverKey, clientKey])

    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', combinedKey, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
    ])

    return decrypted
}

/**
 * Encrypt server key with master key for storage
 * @param {string} serverKeyHex - Server key to encrypt
 * @returns {string} Encrypted server key
 */
function encryptServerKey(serverKeyHex) {
    const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'default-master-key-change-in-production'

    const masterKeyHash = crypto.createHash('sha256')
        .update(MASTER_KEY)
        .digest()

    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKeyHash, iv)

    const encrypted = Buffer.concat([
        cipher.update(Buffer.from(serverKeyHex, 'hex')),
        cipher.final()
    ])

    const authTag = cipher.getAuthTag()

    // Return IV + AuthTag + Encrypted as single hex string
    return Buffer.concat([iv, authTag, encrypted]).toString('hex')
}

/**
 * Decrypt server key from storage
 * @param {string} encryptedKeyHex - Encrypted server key
 * @returns {string} Decrypted server key (hex)
 */
function decryptServerKey(encryptedKeyHex) {
    const MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY || 'default-master-key-change-in-production'

    const masterKeyHash = crypto.createHash('sha256')
        .update(MASTER_KEY)
        .digest()

    const data = Buffer.from(encryptedKeyHex, 'hex')

    // Extract IV (12 bytes), AuthTag (16 bytes), Encrypted data
    const iv = data.slice(0, 12)
    const authTag = data.slice(12, 28)
    const encrypted = data.slice(28)

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKeyHash, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ])

    return decrypted.toString('hex')
}

module.exports = {
    encryptFileHybrid,
    decryptFileHybrid,
    encryptServerKey,
    decryptServerKey
}
