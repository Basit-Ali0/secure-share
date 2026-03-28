export const SHARE_KIND_SINGLE = 'single'
export const SHARE_KIND_MULTI = 'multi'
export const COLLECTION_ITEM_ID_PAD_LENGTH = 6
export const COLLECTION_ITEM_ID_REGEX = new RegExp(`^item-(\\d{${COLLECTION_ITEM_ID_PAD_LENGTH}})$`)

export function normalizeShareKind(value) {
    return value === SHARE_KIND_MULTI ? SHARE_KIND_MULTI : SHARE_KIND_SINGLE
}

export function buildCollectionItemId(index) {
    if (!Number.isInteger(index) || index < 0) {
        throw new Error('Collection item index must be a non-negative integer')
    }

    return `item-${String(index + 1).padStart(COLLECTION_ITEM_ID_PAD_LENGTH, '0')}`
}

export function parseCollectionItemId(itemId) {
    if (typeof itemId !== 'string') {
        return null
    }

    const match = itemId.match(COLLECTION_ITEM_ID_REGEX)
    if (!match) {
        return null
    }

    const numericIndex = Number(match[1])
    if (!Number.isInteger(numericIndex) || numericIndex < 1) {
        return null
    }

    return numericIndex - 1
}

export function buildCollectionManifestObjectKey(shareId) {
    return `shares/${shareId}/manifest.enc`
}

export function buildCollectionItemObjectKey(shareId, itemId) {
    return `shares/${shareId}/items/${itemId}.enc`
}

export function buildCollectionSummaryName(fileCount) {
    return `${fileCount} encrypted file${fileCount === 1 ? '' : 's'}`
}
