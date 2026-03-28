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
import { COLLECTION_ITEM_ID_REGEX } from '../shared/collectionShare.js'

dotenv.config()

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SINGLE_FILE_OBJECT_KEY_REGEX = /^files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/i
const COLLECTION_MANIFEST_OBJECT_KEY_REGEX = /^shares\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/manifest\.enc$/i
const COLLECTION_ITEM_OBJECT_KEY_REGEX = new RegExp(
    `^shares\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\/items\\/${COLLECTION_ITEM_ID_REGEX.source.replace(/^\\^|\\$$/g, '')}\\.enc$`,
    'i'
)

export function validateR2Config(env = process.env) {
    const requiredR2Vars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
    const missingVars = requiredR2Vars.filter(v => !env[v])

    if (missingVars.length > 0) {
        throw new Error(`Missing required R2 env vars: ${missingVars.join(', ')}`)
    }
}

function getR2Config() {
    validateR2Config()
    return {
        client: new S3Client({
            region: 'auto',
            endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
            }
        }),
        bucketName: process.env.R2_BUCKET_NAME || 'secure-share-files'
    }
}

function validateObjectKey(objectKey) {
    if (!objectKey || typeof objectKey !== 'string') {
        throw new Error('objectKey is required')
    }
    if (objectKey.includes('..') || objectKey.includes('\0') || objectKey.startsWith('/')) {
        throw new Error('Invalid objectKey: path traversal detected')
    }
    if (
        !SINGLE_FILE_OBJECT_KEY_REGEX.test(objectKey) &&
        !COLLECTION_MANIFEST_OBJECT_KEY_REGEX.test(objectKey) &&
        !COLLECTION_ITEM_OBJECT_KEY_REGEX.test(objectKey)
    ) {
        throw new Error('Invalid objectKey: unsupported storage path')
    }
}

function resolveObjectKeyInput(fileIdOrObjectKey) {
    if (!fileIdOrObjectKey || typeof fileIdOrObjectKey !== 'string') {
        throw new Error('fileId or objectKey is required')
    }

    if (UUID_REGEX.test(fileIdOrObjectKey)) {
        return `files/${fileIdOrObjectKey}.enc`
    }

    validateObjectKey(fileIdOrObjectKey)
    return fileIdOrObjectKey
}

export async function getPresignedUploadUrl(fileIdOrObjectKey) {
    const objectKey = resolveObjectKeyInput(fileIdOrObjectKey)
    const { client, bucketName } = getR2Config()

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: 'application/octet-stream'
    })

    const presignedUrl = await getSignedUrl(client, command, { expiresIn: 3600 })

    return { presignedUrl, objectKey }
}

export async function initiateMultipartUpload(fileId) {
    const objectKey = resolveObjectKeyInput(fileId)
    const { client, bucketName } = getR2Config()

    const command = new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: objectKey,
        ContentType: 'application/octet-stream'
    })

    const response = await client.send(command)

    return {
        uploadId: response.UploadId,
        objectKey
    }
}

export async function getPresignedPartUrl(objectKey, uploadId, partNumber) {
    validateObjectKey(objectKey)
    const { client, bucketName } = getR2Config()

    if (!Number.isInteger(partNumber) || partNumber < 1) {
        throw new Error('Invalid partNumber: must be integer > 0')
    }
    if (typeof uploadId !== 'string' || uploadId.trim().length === 0) {
        throw new Error('Invalid uploadId: must be a non-empty string')
    }

    const command = new UploadPartCommand({
        Bucket: bucketName,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber
    })

    const presignedUrl = await getSignedUrl(client, command, { expiresIn: 3600 })

    return { presignedUrl }
}

export async function completeMultipartUpload(objectKey, uploadId, parts) {
    const { client, bucketName } = getR2Config()

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
        Bucket: bucketName,
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

    await client.send(command)

    return { success: true, objectKey }
}

export async function getPresignedDownloadUrl(objectKey) {
    validateObjectKey(objectKey)
    const { client, bucketName } = getR2Config()

    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey
    })

    const presignedUrl = await getSignedUrl(client, command, { expiresIn: 3600 })

    return { presignedUrl }
}

export async function deleteObject(objectKey) {
    validateObjectKey(objectKey)
    const { client, bucketName } = getR2Config()

    const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: objectKey
    })

    await client.send(command)

    return { success: true }
}
