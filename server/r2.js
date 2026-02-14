/**
 * R2 Server - Handles Cloudflare R2 operations via S3-compatible API
 */

import {
    S3Client, CreateMultipartUploadCommand, UploadPartCommand,
    CompleteMultipartUploadCommand, GetObjectCommand, DeleteObjectCommand,
    PutObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Validate required R2 environment variables
const requiredR2Vars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
const missingVars = requiredR2Vars.filter(v => !process.env[v])
if (missingVars.length > 0) {
    console.error(`❌ Missing required R2 env vars: ${missingVars.join(', ')}`)
    process.exit(1)
}

// R2 Client configuration
const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
})

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'secure-share-files'

// UUID v4 format regex for fileId validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Get presigned URL for simple single-file upload (for files < 5MB)
 */
export async function getPresignedUploadUrl(fileId) {
    if (!UUID_REGEX.test(fileId)) {
        throw new Error('Invalid fileId format')
    }
    const objectKey = `files/${fileId}.enc`

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        ContentType: 'application/octet-stream'
    })

    const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 })

    return { presignedUrl, objectKey }
}

/**
 * Initiate multipart upload
 */
export async function initiateMultipartUpload(fileId) {
    if (!UUID_REGEX.test(fileId)) {
        throw new Error('Invalid fileId format')
    }
    const objectKey = `files/${fileId}.enc`

    const command = new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        ContentType: 'application/octet-stream'
    })

    const response = await r2Client.send(command)

    return {
        uploadId: response.UploadId,
        objectKey
    }
}


/**
 * Generate presigned URL for part upload
 */
export async function getPresignedPartUrl(objectKey, uploadId, partNumber) {
    const command = new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber
    })

    const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 })

    return { presignedUrl }
}

/**
 * Complete multipart upload
 */
export async function completeMultipartUpload(objectKey, uploadId, parts) {
    // Validate parts array
    if (!Array.isArray(parts) || parts.length === 0) {
        throw new Error('parts must be a non-empty array')
    }
    for (const p of parts) {
        if (!Number.isInteger(p.partNumber) || p.partNumber < 1) {
            throw new Error(`Invalid partNumber: ${p.partNumber}`)
        }
        if (typeof p.etag !== 'string' || !p.etag) {
            throw new Error(`Invalid etag for part ${p.partNumber}`)
        }
    }

    const command = new CompleteMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        UploadId: uploadId,
        MultipartUpload: {
            Parts: parts
                .sort((a, b) => a.partNumber - b.partNumber)
                .map(p => ({
                    PartNumber: p.partNumber,
                    ETag: p.etag
                }))
        }
    })

    await r2Client.send(command)

    return { success: true, objectKey }
}

/**
 * Generate presigned URL for download
 */
export async function getPresignedDownloadUrl(objectKey) {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey
    })

    const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 })

    return { presignedUrl }
}

/**
 * Delete object from R2
 */
export async function deleteObject(objectKey) {
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey
    })

    await r2Client.send(command)

    return { success: true }
}
