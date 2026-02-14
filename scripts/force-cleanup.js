/**
 * Force cleanup ALL files from database and R2 (for testing)
 */
import { createClient } from '@supabase/supabase-js'
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

const r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
})

const BUCKET = process.env.R2_BUCKET_NAME || 'secure-share-files'

async function forceCleanup() {
    console.log('🧹 Force cleanup — deleting ALL files...\n')

    // 1. Delete all DB records
    const { data: files, error } = await supabase
        .from('files')
        .select('file_id, original_name, storage_path')

    if (error) {
        console.error('❌ DB fetch error:', error.message)
    } else {
        console.log(`📋 Found ${files.length} files in database`)
        for (const f of files) {
            const { error: delErr } = await supabase.from('files').delete().eq('file_id', f.file_id)
            if (delErr) console.error(`  ❌ DB delete failed: ${f.original_name}`)
            else console.log(`  ✅ DB deleted: ${f.original_name}`)
        }
    }

    // 2. Delete all R2 objects
    console.log('\n📦 Cleaning R2 bucket...')
    try {
        const listCmd = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'files/' })
        const listed = await r2Client.send(listCmd)

        if (listed.Contents && listed.Contents.length > 0) {
            console.log(`  Found ${listed.Contents.length} objects in R2`)
            for (const obj of listed.Contents) {
                await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }))
                console.log(`  🗑️  Deleted: ${obj.Key}`)
            }
        } else {
            console.log('  No objects in R2')
        }
    } catch (e) {
        console.error('  ❌ R2 cleanup error:', e.message)
    }

    console.log('\n✅ Force cleanup complete!')
}

forceCleanup().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
