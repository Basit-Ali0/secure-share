import {
    FileText, FileImage, FileVideo, FileAudio,
    FileCode, FileArchive, File
} from 'lucide-react'

export function getFileIcon(mimeType) {
    if (!mimeType) return File

    // Images
    if (mimeType.startsWith('image/')) return FileImage

    // Videos
    if (mimeType.startsWith('video/')) return FileVideo

    // Audio
    if (mimeType.startsWith('audio/')) return FileAudio

    // Documents
    if (mimeType.includes('pdf') ||
        mimeType.includes('document') ||
        mimeType.startsWith('text/')) return FileText

    // Archives
    if (mimeType.includes('zip') ||
        mimeType.includes('rar') ||
        mimeType.includes('7z')) return FileArchive

    // Code
    if (mimeType.includes('javascript') ||
        mimeType.includes('json') ||
        mimeType.includes('html')) return FileCode

    return File
}

export function getFileType(mimeType) {
    if (!mimeType) return 'Unknown'

    if (mimeType.startsWith('image/')) return 'Image'
    if (mimeType.startsWith('video/')) return 'Video'
    if (mimeType.startsWith('audio/')) return 'Audio'
    if (mimeType.includes('pdf')) return 'PDF'
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'Archive'
    if (mimeType.startsWith('text/')) return 'Text'

    return 'File'
}

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
