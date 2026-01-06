import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

async function cleanupExpiredFiles() {
    console.log('🧹 Starting cleanup of expired files...')

    // 1. Get all expired files
    const { data: expiredFiles, error: fetchError } = await supabase
        .from('files')
        .select('file_id, storage_path, original_name')
        .lt('expires_at', new Date().toISOString())

    if (fetchError) {
        console.error('❌ Error fetching expired files:', fetchError)
        return
    }

    if (!expiredFiles || expiredFiles.length === 0) {
        console.log('✅ No expired files to clean up')
        return
    }

    console.log(`📋 Found ${expiredFiles.length} expired files`)

    let deletedCount = 0

    // 2. Delete each file from storage and database
    for (const file of expiredFiles) {
        try {
            // Delete from storage
            const { error: storageError } = await supabase.storage
                .from('encrypted-files')
                .remove([file.storage_path])

            if (storageError) {
                console.error(`⚠️  Storage delete failed for ${file.original_name}:`, storageError.message)
            } else {
                console.log(`🗑️  Deleted from storage: ${file.original_name}`)
            }

            // Delete from database
            const { error: dbError } = await supabase
                .from('files')
                .delete()
                .eq('file_id', file.file_id)

            if (dbError) {
                console.error(`⚠️  Database delete failed for ${file.original_name}:`, dbError.message)
            } else {
                console.log(`✅ Deleted from database: ${file.original_name}`)
                deletedCount++
            }

        } catch (error) {
            console.error(`❌ Error deleting ${file.original_name}:`, error)
        }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${deletedCount}/${expiredFiles.length} files`)
}

// Run cleanup
cleanupExpiredFiles()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Cleanup failed:', error)
        process.exit(1)
    })
