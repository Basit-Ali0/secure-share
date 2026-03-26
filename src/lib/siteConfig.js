const DEFAULT_SITE_URL = 'https://maskedfile.online'

function normalizeSiteUrl(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return DEFAULT_SITE_URL
    }

    return value.trim().replace(/\/+$/, '')
}

export const SITE_URL = normalizeSiteUrl(import.meta.env.VITE_SITE_URL)
export const SITE_NAME = 'MaskedFile'
export const DEFAULT_TITLE = 'MaskedFile - Client-Side Encrypted File Sharing'
export const DEFAULT_DESCRIPTION = 'Zero-knowledge encrypted file sharing with short links, password protection, and download limits.'
export const OG_IMAGE_URL = `${SITE_URL}/og-image.svg`

export function buildCanonicalUrl(path = '/') {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    return `${SITE_URL}${normalizedPath}`
}
