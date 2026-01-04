// Storage tier detection and routing
// Determines which storage backend to use based on file size

export const STORAGE_TIERS = {
    TIER_1: {
        name: 'Tier 1 - Direct Upload',
        maxSize: 50 * 1024 * 1024, // 50MB
        description: 'Small files - instant upload to Supabase',
        backend: 'supabase-direct'
    },
    TIER_2: {
        name: 'Tier 2 - Chunked Upload',
        maxSize: 1024 * 1024 * 1024, // 1GB
        description: 'Medium files - chunked upload to Supabase',
        backend: 'supabase-chunked'
    },
    TIER_3: {
        name: 'Tier 3 - Multipart Upload',
        maxSize: 5 * 1024 * 1024 * 1024, // 5GB
        description: 'Large files - multipart upload to Cloudflare R2',
        backend: 'r2-multipart'
    }
}

/**
 * Determine which storage tier to use for a file
 * @param {number} fileSize - Size of file in bytes
 * @returns {object} Tier information
 */
export function detectStorageTier(fileSize) {
    if (fileSize <= STORAGE_TIERS.TIER_1.maxSize) {
        return { ...STORAGE_TIERS.TIER_1, tier: 1 }
    } else if (fileSize <= STORAGE_TIERS.TIER_2.maxSize) {
        return { ...STORAGE_TIERS.TIER_2, tier: 2 }
    } else if (fileSize <= STORAGE_TIERS.TIER_3.maxSize) {
        return { ...STORAGE_TIERS.TIER_3, tier: 3 }
    } else {
        throw new Error(`File too large. Maximum size is 5GB.`)
    }
}

/**
 * Upload encrypted file using appropriate tier
 * @param {Blob} encryptedBlob - The encrypted file
 * @param {string} fileId - Unique file identifier
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{path: string, tier: number}>}
 */
export async function uploadWithTier(encryptedBlob, fileId, onProgress) {
    const tier = detectStorageTier(encryptedBlob.size)

    if (tier.tier === 1 || tier.tier === 2) {
        // Use Supabase (Tier 1 is same as Tier 2 for now, will add chunking later)
        const { uploadEncryptedFile } = await import('./supabase')
        const result = await uploadEncryptedFile(encryptedBlob, fileId, onProgress)
        return { ...result, tier: tier.tier }
    } else {
        // Tier 3: Use Cloudflare R2 (to be implemented)
        throw new Error('Tier 3 (Cloudflare R2) not yet implemented. Coming in next update!')
    }
}
