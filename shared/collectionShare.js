export const SHARE_KIND_SINGLE = 'single'
export const SHARE_KIND_MULTI = 'multi'
export const COLLECTION_ITEM_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeShareKind(value) {
    return value === SHARE_KIND_MULTI ? SHARE_KIND_MULTI : SHARE_KIND_SINGLE
}

export function isValidCollectionItemId(itemId) {
    return typeof itemId === 'string' && COLLECTION_ITEM_ID_REGEX.test(itemId)
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
