import express from 'express'
import multer from 'multer'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'
import { encryptFileHybrid, encryptServerKey, decryptServerKey } from './hybridEncryption.js'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

// Middleware
app.use(cors())
app.use(express.json())

// Supabase client
const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

/**
 * Hybrid encryption upload endpoint
 * POST /api/upload-hybrid
 */
app.post('/api/upload-hybrid', upload.single('file'), async (req, res) => {
    try {
        const file = req.file
        const { fileId, clientKey } = req.body

        if (!file || !fileId || !clientKey) {
            return res.status(400).json({ message: 'Missing required fields' })
        }

        console.log(`[Hybrid Upload] Starting encryption for ${fileId}, size: ${file.size} bytes`)

        // Encrypt file with hybrid encryption
        const encrypted = encryptFileHybrid(file.buffer, clientKey)

        // Upload encrypted blob to Supabase
        const filePath = `${fileId}.enc`
        const { error: uploadError } = await supabase.storage
            .from('encrypted-files')
            .upload(filePath, encrypted.encryptedData, {
                contentType: 'application/octet-stream',
                upsert: false
            })

        if (uploadError) {
            throw new Error(`Storage upload failed: ${uploadError.message}`)
        }

        console.log(`[Hybrid Upload] File uploaded to storage: ${filePath}`)

        // Encrypt server key with master key before storing
        const encryptedServerKey = encryptServerKey(encrypted.serverKey)

        // Return encryption metadata (server key, IV, authTag)
        // Client key is NOT returned - client already has it
        res.json({
            path: filePath,
            serverKey: encryptedServerKey, // Encrypted server key
            iv: encrypted.iv,
            authTag: encrypted.authTag
        })

    } catch (error) {
        console.error('[Hybrid Upload] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

/**
 * Hybrid encryption download endpoint
 * GET /api/download-hybrid/:fileId
 */
app.get('/api/download-hybrid/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params
        const { clientKey } = req.query

        if (!clientKey) {
            return res.status(400).json({ message: 'Client key required' })
        }

        // Get file metadata from database
        const { data: metadata, error: metadataError } = await supabase
            .from('files')
            .select('*')
            .eq('file_id', fileId)
            .single()

        if (metadataError || !metadata) {
            return res.status(404).json({ message: 'File not found' })
        }

        // Check if expired
        if (new Date(metadata.expires_at) < new Date()) {
            return res.status(410).json({ message: 'File has expired' })
        }

        // Decrypt server key with master key before sending to client
        const plainServerKey = decryptServerKey(metadata.server_key)

        console.log(`[Hybrid Download] Serving ${fileId} to client`)

        res.json({
            serverKey: plainServerKey, // PLAIN server key (decrypted)
            iv: metadata.iv,
            authTag: metadata.auth_tag,
            storagePath: metadata.storage_path,
            originalName: metadata.original_name
        })

    } catch (error) {
        console.error('[Hybrid Download] Error:', error)
        res.status(500).json({ message: error.message })
    }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`🚀 Hybrid encryption server running on port ${PORT}`)
})


const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
    console.log(`🚀 Hybrid encryption server running on port ${PORT}`)
})
