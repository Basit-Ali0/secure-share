/**
 * Cleanup expired files from R2 + Database
 * Run manually: node scripts/cleanup.js
 * Or triggered by GitHub Actions workflow via server endpoint
 */
import { createClient } from '@supabase/supabase-js'
import { S3Client, DeleteObjectCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

dotenv.config()

// Validate env vars
if (!process.env.VITE_SUPABASE_URL) {
    console.error('❌ Missing required env var: VITE_SUPABASE_URL')
    process.exit(1)
}

if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_SERVICE_KEY — required for cleanup (anon key blocked by RLS)')
    process.exit(1)
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

// R2 client (for deleting stored files)
let r2Client = null
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
    r2Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
        }
    })
}

const BUCKET = process.env.R2_BUCKET_NAME || 'secure-share-files'

async function cleanupExpiredFiles() {
    console.log('🧹 Starting cleanup of expired files...')
    console.log(`⏰ Current time: ${new Date().toISOString()}\n`)

    // 1. Get all expired files
    const { data: expiredFiles, error: fetchError } = await supabase
        .from('files')
        .select('file_id, storage_path, original_name, storage_backend, expires_at')
        .lt('expires_at', new Date().toISOString())

    if (fetchError) {
        console.error('❌ Error fetching expired files:', fetchError)
        return
    }

    if (!expiredFiles || expiredFiles.length === 0) {
        console.log('✅ No expired files to clean up')
        return
    }

    console.log(`📋 Found ${expiredFiles.length} expired file(s)\n`)

    let deletedCount = 0
    const errors = []

    for (const file of expiredFiles) {
        try {
            console.log(`Processing: ${file.original_name} (expired: ${file.expires_at})`)

            // Delete from storage FIRST (R2 or Supabase Storage)
            if (file.storage_backend === 'r2' && r2Client) {
                // Delete from R2
                await r2Client.send(new DeleteObjectCommand({
                    Bucket: BUCKET,
                    Key: file.storage_path
                }))
                console.log(`  🗑️  R2 deleted: ${file.storage_path}`)
            } else {
                // Fallback: try Supabase Storage
                const { error: storageError } = await supabase.storage
                    .from('encrypted-files')
                    .remove([file.storage_path])

                if (storageError) {
                    console.error(`  ⚠️  Storage delete failed: ${storageError.message}`)
                    errors.push(`${file.original_name} - Storage: ${storageError.message}`)
                    continue // Don't delete DB record if storage fails
                }
                console.log(`  🗑️  Supabase deleted: ${file.storage_path}`)
            }

            // Delete DB record AFTER storage succeeds
            const { error: dbError } = await supabase
                .from('files')
                .delete()
                .eq('file_id', file.file_id)

            if (dbError) {
                console.error(`  ⚠️  DB delete failed: ${dbError.message}`)
                errors.push(`${file.original_name} - DB: ${dbError.message}`)
            } else {
                console.log(`  ✅ DB deleted`)
                deletedCount++
            }
        } catch (error) {
            console.error(`  ❌ Error: ${error.message}`)
            errors.push(`${file.original_name} - ${error.message}`)
        }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${deletedCount}/${expiredFiles.length} files`)
    if (errors.length > 0) {
        console.log(`⚠️  ${errors.length} error(s):`)
        errors.forEach(e => console.log(`  - ${e}`))
    }
}

/**
 * Clean up orphaned/stale multipart uploads (from failed/aborted uploads)
 * These eat bucket space but aren't regular objects
 */
async function cleanupStaleMultipartUploads() {
    if (!r2Client) {
        console.log('\n⚠️  R2 not configured — skipping multipart cleanup')
        return
    }

    console.log('\n📦 Checking for stale multipart uploads...')

    try {
        const res = await r2Client.send(new ListMultipartUploadsCommand({ Bucket: BUCKET }))
        const uploads = res.Uploads || []

        if (uploads.length === 0) {
            console.log('  ✅ No stale multipart uploads')
            return
        }

        // Abort multipart uploads older than 1 hour
        const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000)
        let abortedCount = 0

        for (const upload of uploads) {
            const initiated = new Date(upload.Initiated)
            if (initiated < ONE_HOUR_AGO) {
                await r2Client.send(new AbortMultipartUploadCommand({
                    Bucket: BUCKET,
                    Key: upload.Key,
                    UploadId: upload.UploadId
                }))
                console.log(`  🗑️  Aborted: ${upload.Key} (started ${initiated.toISOString()})`)
                abortedCount++
            }
        }

        console.log(`  ✅ Aborted ${abortedCount}/${uploads.length} stale multipart uploads`)
    } catch (e) {
        console.error('  ❌ Multipart cleanup error:', e.message)
    }
}

// Run cleanup
async function run() {
    await cleanupExpiredFiles()
    await cleanupStaleMultipartUploads()
}

run()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Cleanup failed:', error)
        process.exit(1)
    })
