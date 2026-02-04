/**
 * File Chunker - Streams file in chunks without loading entire file into memory
 * Uses File.slice() and async generators for memory-efficient processing
 */

const DEFAULT_CHUNK_SIZE = 50 * 1024 * 1024 // 50MB chunks

/**
 * Async generator that yields file chunks
 * @param {File} file - The file to chunk
 * @param {number} chunkSize - Size of each chunk in bytes
 * @yields {Object} - { buffer, index, offset, size, isLast, progress }
 */
export async function* chunkFile(file, chunkSize = DEFAULT_CHUNK_SIZE) {
    const totalChunks = Math.ceil(file.size / chunkSize)
    let offset = 0
    let chunkIndex = 0

    while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size)
        const blob = file.slice(offset, end)
        const buffer = await blob.arrayBuffer()

        yield {
            buffer,
            index: chunkIndex,
            offset,
            size: buffer.byteLength,
            isLast: end >= file.size,
            totalChunks,
            progress: ((chunkIndex + 1) / totalChunks) * 100
        }

        offset = end
        chunkIndex++
    }
}

/**
 * Calculate total number of chunks for a file
 * @param {File} file 
 * @param {number} chunkSize 
 * @returns {number}
 */
export function getChunkCount(file, chunkSize = DEFAULT_CHUNK_SIZE) {
    return Math.ceil(file.size / chunkSize)
}

/**
 * Get optimal chunk size based on file size
 * R2/S3 multipart uploads require minimum 5MB per part (except last)
 * @param {number} fileSize - File size in bytes
 * @returns {number} - Optimal chunk size
 */
export function getOptimalChunkSize(fileSize) {
    const MIN_CHUNK_SIZE = 5 * 1024 * 1024 // 5MB minimum for R2

    if (fileSize < 100 * 1024 * 1024) {
        // < 100MB: use 5MB chunks (R2 minimum)
        return MIN_CHUNK_SIZE
    } else if (fileSize < 1024 * 1024 * 1024) {
        // 100MB-1GB: use 50MB chunks
        return 50 * 1024 * 1024
    } else {
        // 1GB+: use 100MB chunks
        return 100 * 1024 * 1024
    }
}


export { DEFAULT_CHUNK_SIZE }
