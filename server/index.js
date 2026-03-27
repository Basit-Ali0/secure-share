import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRuntimeContext } from './app.js'
import { validateR2Config } from './r2.js'

const { app, env } = createRuntimeContext()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.join(__dirname, '..', 'dist')
const DEFAULT_SITE_URL = 'https://maskedfile.online'
const sitemapLastModified = new Date().toISOString()

function normalizeSiteUrl(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return DEFAULT_SITE_URL
    }

    return value.trim().replace(/\/+$/, '')
}

const siteUrl = normalizeSiteUrl(env.VITE_SITE_URL)
const indexingEnabled = env.NODE_ENV === 'production' && siteUrl === DEFAULT_SITE_URL

app.use((req, res, next) => {
    if (/^\/(share|s)(\/|$)/.test(req.path)) {
        res.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
    }
    next()
})

app.get('/robots.txt', (req, res) => {
    res.type('text/plain')

    if (!indexingEnabled) {
        res.send('User-agent: *\nDisallow: /\n')
        return
    }

    res.send(`User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`)
})

app.get('/sitemap.xml', (req, res) => {
    if (!indexingEnabled) {
        res.status(404).type('text/plain').send('Not Found')
        return
    }

    res.type('application/xml')
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${sitemapLastModified}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`)
})

app.use(express.static(distPath))

app.all('/api/*', (req, res) => {
    res.status(404).json({ message: `API route not found: ${req.method} ${req.path}` })
})

app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
})

const PORT = env.PORT || 3000
validateR2Config(env)
app.listen(PORT, () => {
    console.log(`Zero-Knowledge Server running on port ${PORT}`)
    console.log(`R2 Bucket: ${env.R2_BUCKET_NAME || 'secure-share-files'}`)
})
