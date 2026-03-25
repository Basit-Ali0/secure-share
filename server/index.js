import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRuntimeContext } from './app.js'

const { app, env } = createRuntimeContext()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.join(__dirname, '..', 'dist')

app.use(express.static(distPath))

app.all('/api/*', (req, res) => {
    res.status(404).json({ message: `API route not found: ${req.method} ${req.path}` })
})

app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
})

const PORT = env.PORT || 3000
app.listen(PORT, () => {
    console.log(`Zero-Knowledge Server running on port ${PORT}`)
    console.log(`R2 Bucket: ${env.R2_BUCKET_NAME || 'secure-share-files'}`)
})
