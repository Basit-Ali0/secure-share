/**
 * R2 Server - Handles Cloudflare R2 operations via S3-compatible API
 */

import {
    S3Client, CreateMultipartUploadCommand, UploadPartCommand,
    CompleteMultipartUploadCommand, GetObjectCommand, DeleteObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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

/**
 * Initiate multipart upload
 */
export async function initiateMultipartUpload(fileId) {
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
    const command = new CompleteMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        UploadId: uploadId,
        MultipartUpload: {
            Parts: parts.map(p => ({
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
