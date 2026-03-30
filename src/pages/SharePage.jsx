import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { formatFileSize } from '../utils/fileUtils'
import {
    deriveCollectionItemMaterial,
    downloadAndDecryptManifest,
    downloadAndDecryptStreaming,
    terminateWorkerPool
} from '../utils/streamingEncryption'
import QRCode from '../components/SharePage/QRCode'
import MfNav from '../components/layout/MfNav'
import MfFooter from '../components/layout/MfFooter'
import MfCornerCard from '../components/layout/MfCornerCard'
import { OG_IMAGE_URL, SITE_NAME } from '../lib/siteConfig'
import { trackEvent } from '../lib/analytics'
import { fadeUpProps, transitionSec } from '../lib/motionPresets.js'

function ShareHelmet({ title, description, url }) {
    return (
        <Helmet>
            <title>{title}</title>
            <meta name="description" content={description} />
            <meta name="robots" content="noindex, nofollow, noarchive" />
            <meta name="googlebot" content="noindex, nofollow, noarchive" />
            <meta property="og:site_name" content={SITE_NAME} />
            <meta property="og:type" content="website" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            {url ? <meta property="og:url" content={url} /> : null}
            <meta property="og:image" content={OG_IMAGE_URL} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={OG_IMAGE_URL} />
        </Helmet>
    )
}

function ShareDownloadErrorBanner({ message, onDismiss }) {
    if (!message) return null
    return (
        <div role="alert" className="border-b border-mf-danger/45 bg-mf-danger/10 px-6 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <p className="flex-1 font-mono text-[11px] leading-relaxed text-mf-danger">{message}</p>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted underline decoration-mf-border underline-offset-2 hover:text-mf-ink"
                >
                    Dismiss
                </button>
            </div>
        </div>
    )
}

function formatCountdownHMS(ms) {
    if (ms <= 0) return '00:00:00'
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function CollectionListItem({ item, displayName, downloading, disabled, onDownload }) {
    const relativePath = item.relativePath && item.relativePath !== item.name ? item.relativePath : null

    return (
        <div className="flex items-center gap-3 border border-mf-border bg-mf-bg-panel px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-mf-accent/10 text-mf-accent">
                <span className="material-symbols-outlined text-[20px]">description</span>
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-mf-ink">{displayName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-mf-ink-muted">
                    <span className="inline-flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[12px] leading-none" aria-hidden>
                            download
                        </span>
                        {formatFileSize(item.size)}
                    </span>
                    {item.type ? <span>• {item.type}</span> : null}
                </div>
                {relativePath ? <p className="mt-1 truncate font-mono text-[10px] text-mf-ink-muted">{relativePath}</p> : null}
            </div>
            <button
                type="button"
                onClick={onDownload}
                disabled={disabled}
                className="shrink-0 border border-mf-border bg-mf-card px-4 py-2 font-mono text-xs text-mf-ink transition-colors hover:border-mf-accent disabled:opacity-50"
            >
                {downloading ? 'Downloading…' : 'Download'}
            </button>
        </div>
    )
}

function createDuplicateNameLabels(files) {
    const counts = new Map()
    return files.reduce((acc, item) => {
        const currentCount = (counts.get(item.name) || 0) + 1
        counts.set(item.name, currentCount)
        acc[item.itemId] = currentCount > 1 && (!item.relativePath || item.relativePath === item.name)
            ? `${item.name} (${currentCount})`
            : item.name
        return acc
    }, {})
}

export default function SharePage() {
    const { fileId, shortId } = useParams()
    const navigate = useNavigate()
    const identifier = shortId || fileId
    const sharePageUrl = typeof window === 'undefined'
        ? ''
        : `${window.location.origin}${window.location.pathname}${window.location.search}`

    const [metadata, setMetadata] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [downloading, setDownloading] = useState(false)
    const [downloadComplete, setDownloadComplete] = useState(false)
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [downloadStatus, setDownloadStatus] = useState('')
    const [showQR, setShowQR] = useState(false)
    const [timeLeft, setTimeLeft] = useState(null)
    const [passwordInput, setPasswordInput] = useState('')
    const [unlocking, setUnlocking] = useState(false)
    const [unlockError, setUnlockError] = useState('')
    const [isUnlocked, setIsUnlocked] = useState(false)
    const [collectionManifest, setCollectionManifest] = useState(null)
    const [collectionSessionToken, setCollectionSessionToken] = useState('')
    const [transferKey, setTransferKey] = useState('')
    const [collectionLoading, setCollectionLoading] = useState(false)
    const [collectionDownloadAll, setCollectionDownloadAll] = useState(false)
    const [activeCollectionItemId, setActiveCollectionItemId] = useState('')
    const [expiryBaselineMs, setExpiryBaselineMs] = useState(null)
    const [shareActionError, setShareActionError] = useState('')
    const prefersReducedMotion = useReducedMotion()

    const downloadCount = metadata?.download_count || 0
    const maxDownloads = metadata?.max_downloads ?? null
    const remainingDownloads = maxDownloads == null
        ? null
        : Math.max((metadata?.remaining_downloads ?? (maxDownloads - downloadCount)), 0)
    const limitReached = maxDownloads != null && remainingDownloads <= 0
    const requiresPassword = Boolean(metadata?.is_password_protected) && !isUnlocked
    const isCollection = metadata?.share_kind === 'multi'
    const duplicateNameLabels = collectionManifest?.files ? createDuplicateNameLabels(collectionManifest.files) : {}
    const collectionInteractionLocked = collectionLoading || collectionDownloadAll || activeCollectionItemId !== '' || downloading

    useEffect(() => {
        loadFileMetadata()
    }, [identifier])

    useEffect(() => {
        setMetadata(null)
        setError(null)
        setTimeLeft(null)
        setExpiryBaselineMs(null)
        setShareActionError('')
        setDownloadComplete(false)
        setDownloadProgress(0)
        setDownloadStatus('')
        setPasswordInput('')
        setUnlockError('')
        setCollectionManifest(null)
        setCollectionSessionToken('')
        setTransferKey('')
        setShowQR(false)
        setCollectionLoading(false)
        setCollectionDownloadAll(false)
        setActiveCollectionItemId('')
        setIsUnlocked(false)
    }, [identifier])

    useEffect(() => {
        if (!metadata?.expires_at || expiryBaselineMs != null) return
        const ms = new Date(metadata.expires_at) - Date.now()
        setExpiryBaselineMs(Math.max(ms, 60_000))
    }, [metadata?.expires_at, expiryBaselineMs])

    useEffect(() => {
        if (!metadata?.expires_at) return

        function updateCountdown() {
            const diff = new Date(metadata.expires_at) - new Date()
            setTimeLeft(diff > 0 ? diff : 0)
            return diff <= 0
        }

        if (updateCountdown()) return undefined

        const interval = setInterval(() => {
            if (updateCountdown()) clearInterval(interval)
        }, 1000)
        return () => clearInterval(interval)
    }, [metadata?.expires_at])

    function formatTimeLeft(ms) {
        if (ms <= 0) return 'Expired'
        const hours = Math.floor(ms / 3600000)
        const minutes = Math.floor((ms % 3600000) / 60000)
        if (hours >= 24) {
            const days = Math.floor(hours / 24)
            const remainingHours = hours % 24
            return `${days}d ${remainingHours}h`
        }
        if (hours > 0) return `${hours}h ${minutes}m`
        return `${minutes}m`
    }

    async function loadFileMetadata() {
        try {
            setLoading(true)
            const response = await fetch(`/api/files/${identifier}`)
            if (!response.ok) {
                let message = `Request failed with status ${response.status}`
                try {
                    const data = await response.json()
                    message = data.message || message
                } catch {
                    // Response body is not JSON (e.g., HTML 502 from reverse proxy)
                }
                throw new Error(message)
            }
            const data = await response.json()
            setMetadata(data)
            setIsUnlocked(!data.is_password_protected)
            setCollectionManifest(null)
            setCollectionSessionToken('')
            setTransferKey('')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleUnlock(event) {
        event?.preventDefault()

        try {
            setUnlocking(true)
            setUnlockError('')

            const response = await fetch(`/api/files/${identifier}/unlock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: passwordInput })
            })

            if (!response.ok) {
                let message = `Request failed with status ${response.status}`
                try {
                    const data = await response.json()
                    message = data.message || message
                } catch {
                    // Ignore non-JSON error payloads
                }
                throw new Error(message)
            }

            const data = await response.json()
            setMetadata(data)
            setIsUnlocked(true)
            setCollectionManifest(null)
            setCollectionSessionToken('')
            setTransferKey('')
        } catch (err) {
            setUnlockError(err.message)
            trackEvent('unlock_failed', {
                category: 'engagement',
                label: 'password_required',
            })
        } finally {
            setUnlocking(false)
        }
    }

    async function authorizeCollectionShare() {
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const transferKeyHex = params.get('key')

        if (!transferKeyHex) {
            throw new Error('Transfer key missing from URL. Invalid collection link.')
        }

        setTransferKey(transferKeyHex)

        const authorizeResponse = await fetch(`/api/files/${identifier}/authorize-download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: passwordInput })
        })

        if (!authorizeResponse.ok) {
            let message = `Request failed with status ${authorizeResponse.status}`
            try {
                const data = await authorizeResponse.json()
                message = data.message || message
                if (authorizeResponse.status === 410 && data.message === 'Download limit reached') {
                    setMetadata(prev => prev ? {
                        ...prev,
                        download_count: prev.max_downloads ?? prev.download_count ?? 0,
                        remaining_downloads: 0
                    } : prev)
                }
            } catch {
                // Ignore non-JSON error payloads
            }
            throw new Error(message)
        }

        const authorization = await authorizeResponse.json()
        setMetadata(prev => prev ? {
            ...prev,
            download_count: authorization.downloadCount,
            max_downloads: authorization.maxDownloads,
            remaining_downloads: authorization.remainingDownloads
        } : prev)

        const manifest = await downloadAndDecryptManifest(
            authorization.manifestPresignedUrl,
            authorization.manifestChunkCount || 1,
            authorization.manifestChunkSizes || null,
            transferKeyHex,
            authorization.fileId
        )

        setCollectionManifest(manifest)
        setCollectionSessionToken(authorization.sessionToken)
        trackEvent('download_authorized', {
            category: 'engagement',
            label: authorization.maxDownloads == null ? 'multi-unlimited' : 'multi-limited',
        })

        return { authorization, manifest, transferKeyHex }
    }

    async function handleCollectionItemDownload(item, sessionToken = collectionSessionToken) {
        const transferKeyHex = transferKey || new URLSearchParams(window.location.hash.substring(1)).get('key')

        if (!transferKeyHex) {
            throw new Error('Transfer key missing from URL. Invalid collection link.')
        }

        setActiveCollectionItemId(item.itemId)
        const response = await fetch(`/api/files/${identifier}/authorize-item-download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken,
                itemId: item.itemId
            })
        })

        if (!response.ok) {
            let message = `Request failed with status ${response.status}`
            try {
                const data = await response.json()
                message = data.message || message
            } catch {
                // Ignore non-JSON payloads
            }
            throw new Error(message)
        }

        const result = await response.json()
        const itemMaterial = await deriveCollectionItemMaterial(transferKeyHex, metadata.file_id, item.itemId)

        await downloadAndDecryptStreaming(
            result.presignedUrl,
            item.chunkCount || 1,
            item.chunkSizes || null,
            itemMaterial.keyHex,
            item.ivHex,
            item.name,
            (progress, statusText) => {
                setDownloadProgress(progress)
                setDownloadStatus(`${statusText} • ${item.name}`)
            }
        )
    }

    async function handleDownload() {
        let deferSingleFileSuccess = false

        try {
            setShareActionError('')
            setDownloading(true)
            setDownloadProgress(0)
            setDownloadStatus(isCollection ? 'Revealing collection...' : 'Authorizing...')
            setDownloadComplete(false)

            if (isCollection) {
                setCollectionLoading(true)
                await authorizeCollectionShare()
                setDownloadStatus('Collection ready')
                setDownloadProgress(100)
                setDownloadComplete(true)
                return
            }

            const hash = window.location.hash.substring(1)
            const params = new URLSearchParams(hash)
            const keyHex = params.get('key')
            const ivHex = params.get('iv')

            if (!keyHex || !ivHex) {
                throw new Error('Encryption keys missing from URL. Invalid share link.')
            }

            if (requiresPassword) {
                throw new Error('Unlock the file before downloading.')
            }

            const hasChunkCount = Number.isInteger(metadata?.chunk_count) && metadata.chunk_count > 0
            const hasChunkSizes = metadata?.chunk_count === 1 || Array.isArray(metadata?.chunk_sizes)
            const hasFileName = typeof metadata?.original_name === 'string' && metadata.original_name.length > 0

            if (!metadata || !hasChunkCount || !hasChunkSizes || !hasFileName) {
                throw new Error('File metadata is incomplete. Refresh the page or unlock the file again.')
            }

            const authorizeResponse = await fetch(`/api/files/${identifier}/authorize-download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: passwordInput })
            })

            if (!authorizeResponse.ok) {
                let message = `Request failed with status ${authorizeResponse.status}`
                try {
                    const data = await authorizeResponse.json()
                    message = data.message || message
                    if (authorizeResponse.status === 410 && data.message === 'Download limit reached') {
                        setMetadata(prev => prev ? {
                            ...prev,
                            download_count: prev.max_downloads ?? prev.download_count ?? 0,
                            remaining_downloads: 0
                        } : prev)
                    }
                } catch {
                    // Ignore non-JSON error payloads
                }
                throw new Error(message)
            }

            const authorization = await authorizeResponse.json()
            setMetadata(prev => prev ? {
                ...prev,
                download_count: authorization.downloadCount,
                max_downloads: authorization.maxDownloads,
                remaining_downloads: authorization.remainingDownloads
            } : prev)
            trackEvent('download_authorized', {
                category: 'engagement',
                label: authorization.maxDownloads == null ? 'unlimited' : 'limited',
            })

            await downloadAndDecryptStreaming(
                authorization.presignedUrl,
                metadata.chunk_count || 1,
                metadata.chunk_sizes || null,
                keyHex,
                ivHex,
                metadata.original_name,
                (progress, statusText) => {
                    setDownloadProgress(progress)
                    setDownloadStatus(statusText)
                }
            )

            deferSingleFileSuccess = true
            setTimeout(() => {
                setDownloading(false)
                setDownloadComplete(true)
                setDownloadProgress(0)
            }, 1500)

        } catch (err) {
            console.error('Download error:', err)
            if (err.message !== 'Download cancelled') {
                setShareActionError(`Download failed: ${err.message}`)
            }
            setDownloadProgress(0)
        } finally {
            if (!deferSingleFileSuccess) {
                setDownloading(false)
            }
            setCollectionLoading(false)
            terminateWorkerPool()
        }
    }

    async function handleDownloadAll() {
        if (!collectionManifest?.files?.length || !collectionSessionToken || collectionInteractionLocked) {
            return
        }

        try {
            setShareActionError('')
            setCollectionDownloadAll(true)
            setDownloading(true)
            setDownloadStatus('Preparing collection download...')

            for (const item of collectionManifest.files) {
                await handleCollectionItemDownload(item, collectionSessionToken)
            }

            setDownloadComplete(true)
            setDownloadStatus('Collection download complete')
        } catch (err) {
            console.error('Collection download error:', err)
            setShareActionError(`Download failed: ${err.message}`)
        } finally {
            setCollectionDownloadAll(false)
            setActiveCollectionItemId('')
            setDownloading(false)
            setDownloadProgress(0)
            terminateWorkerPool()
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-mf-bg text-mf-ink">
                <ShareHelmet
                    title={`Loading Secure Share | ${SITE_NAME}`}
                    description="Preparing a private encrypted file share."
                    url={sharePageUrl}
                />
                <MfNav badge="Secure Download" />
                <div className="flex items-center justify-center px-4 py-24">
                    <motion.div {...fadeUpProps(prefersReducedMotion, 16, 0)}>
                        <MfCornerCard className="p-12 text-center">
                            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-mf-border border-t-mf-accent" />
                            <p className="font-mono text-sm text-mf-ink-muted">Loading file…</p>
                        </MfCornerCard>
                    </motion.div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen bg-mf-bg text-mf-ink">
                <ShareHelmet
                    title={`Secure Share Unavailable | ${SITE_NAME}`}
                    description="This private encrypted file share is unavailable or has expired."
                    url={sharePageUrl}
                />
                <MfNav badge="Secure Download" />
                <div className="mx-auto flex max-w-md justify-center px-4 py-16">
                    <motion.div className="w-full" {...fadeUpProps(prefersReducedMotion, 18, 0)}>
                        <MfCornerCard className="w-full p-10 text-center">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-mf-danger/15 text-mf-danger">
                                <span className="material-symbols-outlined text-3xl">error</span>
                            </div>
                            <h2 className="mb-2 text-xl font-bold text-mf-ink">File not found</h2>
                            <p className="mb-6 font-mono text-sm text-mf-ink-muted">{error}</p>
                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="w-full bg-mf-ink py-3.5 text-sm font-bold uppercase tracking-wider text-mf-bg transition-colors hover:bg-mf-accent"
                            >
                                Upload a file
                            </button>
                        </MfCornerCard>
                    </motion.div>
                </div>
                <MfFooter showSendLink />
            </div>
        )
    }

    const shareUrl = window.location.href
    const passwordShareExpired =
        requiresPassword &&
        Boolean(metadata?.expires_at) &&
        new Date(metadata.expires_at) <= new Date()
    const passwordShareLimitOnly = requiresPassword && limitReached

    if (passwordShareExpired) {
        return (
            <div className="min-h-screen bg-mf-bg text-mf-ink">
                <ShareHelmet
                    title={`Share Expired | ${SITE_NAME}`}
                    description="This encrypted file share has expired."
                    url={sharePageUrl}
                />
                <MfNav badge="Secure Download" />
                <motion.main className="mx-auto max-w-lg px-4 py-12 md:py-16" {...fadeUpProps(prefersReducedMotion, 16, 0.06)}>
                    <MfCornerCard className="px-8 py-12 text-center md:px-12">
                        <span className="material-symbols-outlined mb-4 text-4xl text-mf-danger">error</span>
                        <h1 className="mb-2 text-lg font-bold text-mf-ink">This link has expired.</h1>
                        <p className="mx-auto mb-8 max-w-md font-mono text-[11px] leading-relaxed text-mf-ink-muted">
                            The transfer window has passed. Ask the sender to create a new link.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            className="w-full bg-mf-ink py-3.5 text-sm font-bold uppercase tracking-wider text-mf-bg transition-colors hover:bg-mf-accent"
                        >
                            Send a new file
                        </button>
                    </MfCornerCard>
                </motion.main>
                <MfFooter showSendLink />
            </div>
        )
    }

    if (passwordShareLimitOnly) {
        return (
            <div className="min-h-screen bg-mf-bg text-mf-ink">
                <ShareHelmet
                    title={`Download Limit | ${SITE_NAME}`}
                    description="This share has no downloads remaining."
                    url={sharePageUrl}
                />
                <MfNav badge="Secure Download" />
                <motion.main className="mx-auto max-w-lg px-4 py-12 md:py-16" {...fadeUpProps(prefersReducedMotion, 16, 0.06)}>
                    <MfCornerCard className="px-8 py-12 text-center md:px-12">
                        <span className="material-symbols-outlined mb-4 text-4xl text-mf-danger">block</span>
                        <h1 className="mb-2 text-lg font-bold text-mf-ink">Download limit reached</h1>
                        <p className="mx-auto mb-8 max-w-md font-mono text-[11px] leading-relaxed text-mf-ink-muted">
                            No downloads remain for this link. Ask the sender to share again.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            className="w-full bg-mf-ink py-3.5 text-sm font-bold uppercase tracking-wider text-mf-bg transition-colors hover:bg-mf-accent"
                        >
                            Upload a file
                        </button>
                    </MfCornerCard>
                </motion.main>
                <MfFooter showSendLink />
            </div>
        )
    }

    if (requiresPassword) {
        return (
            <div className="min-h-screen bg-mf-bg text-mf-ink">
                <ShareHelmet
                    title={`Protected Share | ${SITE_NAME}`}
                    description="Password-protected encrypted file share."
                    url={sharePageUrl}
                />
                <MfNav badge="Secure Download" />
                <motion.main className="mx-auto max-w-lg px-4 py-12 md:py-16" {...fadeUpProps(prefersReducedMotion, 16, 0.06)}>
                    <MfCornerCard className="px-8 py-10 text-center md:px-12">
                        <div className="mb-4 text-mf-ink-muted">
                            <svg className="mx-auto h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </div>
                        <h1 className="mb-2 text-lg font-bold tracking-tight text-mf-ink">Protected Share Link</h1>
                        <p className="mb-6 font-mono text-[11px] leading-relaxed text-mf-ink-muted">
                            Enter the password to reveal file details and authorize the secure download.
                        </p>

                        {timeLeft !== null ? (
                            <div
                                className={`mb-6 inline-flex items-center gap-2 border px-3 py-2 font-mono text-xs ${
                                    timeLeft <= 0
                                        ? 'border-mf-danger/40 bg-mf-danger/10 text-mf-danger'
                                        : timeLeft < 3600000
                                            ? 'border-mf-warn/40 bg-mf-warn/10 text-mf-warn'
                                            : 'border-mf-border bg-mf-bg-panel text-mf-ink-muted'
                                }`}
                            >
                                <span className="material-symbols-outlined text-sm">schedule</span>
                                {formatTimeLeft(timeLeft)}
                            </div>
                        ) : null}

                        <form onSubmit={handleUnlock} className="space-y-4 text-left">
                            <div className="flex max-w-md mx-auto gap-0 border border-mf-border">
                                <input
                                    type="password"
                                    autoComplete="current-password"
                                    value={passwordInput}
                                    onChange={(event) => setPasswordInput(event.target.value)}
                                    placeholder="Enter password"
                                    className="min-w-0 flex-1 border-r border-mf-border bg-mf-bg px-4 py-3 font-mono text-sm text-mf-ink outline-none placeholder:text-mf-ink-muted focus:border-mf-accent"
                                />
                                <button
                                    type="submit"
                                    disabled={unlocking}
                                    className="shrink-0 bg-mf-ink px-5 py-3 font-sans text-sm font-semibold text-mf-bg transition-colors hover:bg-mf-accent disabled:opacity-50"
                                >
                                    {unlocking ? 'Unlocking…' : 'Unlock File'}
                                </button>
                            </div>

                            {unlockError ? <p className="text-center font-mono text-[10.5px] text-mf-danger">{unlockError}</p> : null}
                        </form>

                        <p className="mt-8 font-mono text-[10px] text-mf-ink-muted">
                            File details stay hidden until the correct password unlocks this share.
                        </p>
                    </MfCornerCard>
                </motion.main>
                <MfFooter showSendLink />
            </div>
        )
    }

    if (isCollection) {
        const expiryFillPct =
            timeLeft != null && expiryBaselineMs
                ? Math.min(100, Math.max(0, (timeLeft / expiryBaselineMs) * 100))
                : 100
        const collectionExpired = timeLeft !== null && timeLeft <= 0
        const collectionDownloadsLeftLabel =
            maxDownloads == null ? 'Unlimited' : `${remainingDownloads} download${remainingDownloads === 1 ? '' : 's'} left`

        return (
            <div className="min-h-screen bg-mf-bg text-mf-ink">
                <ShareHelmet
                    title={`Secure Collection | ${SITE_NAME}`}
                    description="Private encrypted file collection. Search engines should not index this page."
                    url={sharePageUrl}
                />
                <MfNav badge="Secure Download" />

                <motion.main className="mx-auto max-w-[860px] px-6 pb-16 pt-10 md:px-12 md:pt-[4.5rem]" {...fadeUpProps(prefersReducedMotion, 14, 0.04)}>
                    <div className="mb-5 flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mf-ink-muted">
                        <span className="h-px w-[22px] bg-mf-accent" />
                        Incoming transfer
                    </div>
                    <h1 className="mb-10 text-[clamp(2rem,5vw,2.625rem)] font-extrabold leading-[1.05] tracking-tight md:mb-11">
                        Someone sent
                        <br />
                        you a <span className="text-mf-accent">collection.</span>
                    </h1>

                    <MfCornerCard className="overflow-hidden">
                        <ShareDownloadErrorBanner message={shareActionError} onDismiss={() => setShareActionError('')} />
                        <div className="grid grid-cols-1 border-b border-mf-border md:grid-cols-[90px_1fr_auto] md:items-stretch">
                            <div className="flex flex-col items-center justify-center gap-1.5 bg-mf-accent py-8 md:py-0">
                                <span className="material-symbols-outlined text-[28px] text-white/90 icon-filled" aria-hidden>
                                    folder
                                </span>
                                <span className="px-1 text-center font-mono text-[10px] font-medium uppercase leading-tight tracking-[0.12em] text-white">
                                    {metadata.file_count} file{metadata.file_count === 1 ? '' : 's'}
                                </span>
                            </div>
                            <div className="min-w-0 border-b border-mf-border px-6 py-6 md:border-b-0 md:border-r">
                                <p className="text-xl font-bold tracking-tight text-mf-ink md:text-[22px]">
                                    Encrypted collection
                                </p>
                                <p className="mt-1 font-mono text-xs text-mf-ink-muted">
                                    Reveal the file list, then download each item with end-to-end decryption in your browser.
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="inline-flex items-center gap-1.5 border border-mf-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                        <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden>
                                            download
                                        </span>
                                        {formatFileSize(metadata.total_size || 0)}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 border border-mf-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                        <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden>
                                            schedule
                                        </span>
                                        {timeLeft !== null ? formatTimeLeft(timeLeft) : '—'}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 border border-mf-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                        <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden>
                                            visibility
                                        </span>
                                        {collectionDownloadsLeftLabel}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-col justify-center gap-2 px-6 py-5 md:min-w-[180px]">
                                <button
                                    type="button"
                                    onClick={() => navigate('/')}
                                    className="inline-flex items-center justify-center gap-2 border border-mf-border py-2 font-mono text-[10.5px] uppercase tracking-wider text-mf-ink-muted transition-colors hover:border-mf-ink hover:text-mf-ink"
                                >
                                    <span className="material-symbols-outlined text-sm" aria-hidden>
                                        upload
                                    </span>
                                    Send a file
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 divide-y divide-mf-border border-b border-mf-border md:grid-cols-3 md:divide-x md:divide-y-0">
                            <div className="px-5 py-4">
                                <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-mf-ink-muted">
                                    <span className="material-symbols-outlined text-[12px] leading-none" aria-hidden>
                                        lock
                                    </span>
                                    Encryption
                                </p>
                                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-mf-ink">
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mf-success" aria-hidden />
                                    AES-256-GCM
                                </p>
                            </div>
                            <div className="px-5 py-4">
                                <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-mf-ink-muted">
                                    <span className="material-symbols-outlined text-[12px] leading-none" aria-hidden>
                                        vpn_key
                                    </span>
                                    Key location
                                </p>
                                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-mf-ink">
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mf-success" aria-hidden />
                                    URL fragment only
                                </p>
                            </div>
                            <div className="px-5 py-4">
                                <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-mf-ink-muted">
                                    <span className="material-symbols-outlined text-[12px] leading-none" aria-hidden>
                                        cloud
                                    </span>
                                    Server sees
                                </p>
                                <p className="mt-1 flex items-center gap-2 text-sm font-bold text-mf-ink">
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mf-success" aria-hidden />
                                    Ciphertext only
                                </p>
                            </div>
                        </div>

                        {!collectionExpired ? (
                            <div className="border-b border-mf-border px-6 py-5">
                                <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[13px] leading-none" aria-hidden>
                                            schedule
                                        </span>
                                        Link expires in
                                    </span>
                                    <span className={timeLeft !== null && timeLeft < 3600000 ? 'text-mf-warn' : 'text-mf-ink'}>
                                        {timeLeft !== null ? formatCountdownHMS(timeLeft) : '—'}
                                    </span>
                                </div>
                                <div className="relative h-0.5 bg-mf-border">
                                    <div
                                        className="absolute left-0 top-0 h-full bg-gradient-to-r from-mf-success to-mf-warn transition-all duration-500"
                                        style={{ width: `${expiryFillPct}%` }}
                                    />
                                    {expiryFillPct > 0 && expiryFillPct < 100 ? (
                                        <div
                                            className="pointer-events-none absolute top-1/2 z-[1] h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-mf-ink"
                                            style={{ left: `${expiryFillPct}%` }}
                                            aria-hidden
                                        />
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        {collectionExpired ? (
                            <div className="border-t border-mf-border px-8 py-12 text-center">
                                <span className="material-symbols-outlined mb-4 text-4xl text-mf-danger">error</span>
                                <p className="text-lg font-bold text-mf-ink">This link has expired.</p>
                                <p className="mx-auto mt-2 max-w-md font-mono text-[11px] leading-relaxed text-mf-ink-muted">
                                    The transfer window has passed. Ask the sender to create a new link.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => navigate('/')}
                                    className="mx-auto mt-8 flex w-full max-w-[280px] items-center justify-center gap-2 bg-mf-ink py-3.5 text-sm font-bold uppercase tracking-wider text-mf-bg hover:bg-mf-accent"
                                >
                                    Send a new file
                                </button>
                            </div>
                        ) : limitReached && !downloading && !downloadComplete && !collectionManifest ? (
                            <div className="border-t border-mf-border px-8 py-9">
                                <button
                                    type="button"
                                    disabled
                                    className="flex w-full cursor-not-allowed items-center justify-center gap-2 bg-mf-danger/15 py-4 text-sm font-bold uppercase tracking-wider text-mf-danger"
                                >
                                    <span className="material-symbols-outlined text-xl">block</span>
                                    Download limit reached
                                </button>
                                <p className="mt-4 text-center font-mono text-[11px] text-mf-ink-muted">
                                    No downloads remain. Ask the sender to share again.
                                </p>
                            </div>
                        ) : (
                            <div className="px-8 py-9">
                                {!collectionManifest ? (
                                    <>
                                        {downloading ? (
                                            <div className="mb-4">
                                                <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                                    <span>Decrypting manifest</span>
                                                    <span>{Math.round(downloadProgress)}%</span>
                                                </div>
                                                <div className="h-0.5 bg-mf-border">
                                                    <div className="mf-progress-fill" style={{ width: `${downloadProgress}%` }} />
                                                </div>
                                            </div>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={!limitReached ? handleDownload : undefined}
                                            disabled={downloading || limitReached}
                                            className={`flex w-full items-center justify-center gap-2 py-4 text-sm font-bold uppercase tracking-wider transition-opacity ${
                                                limitReached
                                                    ? 'cursor-not-allowed bg-mf-danger/20 text-mf-danger'
                                                    : 'bg-mf-ink text-mf-bg hover:bg-mf-accent'
                                            }`}
                                        >
                                            {collectionLoading ? (
                                                <>
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-mf-bg border-t-transparent" />
                                                    {downloadStatus || 'Revealing collection...'}
                                                </>
                                            ) : limitReached ? (
                                                <>
                                                    <span className="material-symbols-outlined text-xl">block</span>
                                                    Download limit reached
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined icon-filled text-lg" aria-hidden>
                                                        folder_open
                                                    </span>
                                                    Reveal files
                                                </>
                                            )}
                                        </button>
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-mf-ink">Collection contents</p>
                                                <p className="font-mono text-xs text-mf-ink-muted">
                                                    Download individual files or take the full set sequentially.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleDownloadAll}
                                                disabled={collectionInteractionLocked}
                                                className="shrink-0 border border-mf-accent bg-mf-accent px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-wider text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                            >
                                                {collectionDownloadAll ? 'Downloading…' : 'Download all'}
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {collectionManifest.files.map((item, index) => (
                                                <motion.div
                                                    key={item.itemId}
                                                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{
                                                        ...transitionSec(0.34),
                                                        delay: prefersReducedMotion ? 0 : index * 0.05,
                                                    }}
                                                >
                                                    <CollectionListItem
                                                        item={item}
                                                        displayName={duplicateNameLabels[item.itemId] || item.name}
                                                        downloading={activeCollectionItemId === item.itemId}
                                                        disabled={collectionInteractionLocked}
                                                        onDownload={async () => {
                                                            if (collectionInteractionLocked) {
                                                                return
                                                            }
                                                            try {
                                                                setShareActionError('')
                                                                setDownloading(true)
                                                                await handleCollectionItemDownload(item)
                                                                setDownloadComplete(true)
                                                            } catch (err) {
                                                                console.error('Item download error:', err)
                                                                setShareActionError(`Download failed: ${err.message}`)
                                                            } finally {
                                                                setDownloading(false)
                                                                setDownloadProgress(0)
                                                                setActiveCollectionItemId('')
                                                                terminateWorkerPool()
                                                            }
                                                        }}
                                                    />
                                                </motion.div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-mf-border bg-mf-bg px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                            <span className="flex items-center gap-2">Client-side decryption</span>
                            <span className="flex items-center gap-1.5 text-mf-success">
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                                Key never sent to server
                            </span>
                        </div>
                    </MfCornerCard>

                    <div className="mt-6 flex items-start gap-3.5 border border-mf-border bg-mf-card p-4 md:p-5">
                        <span className="material-symbols-outlined shrink-0 text-mf-warn text-lg">info</span>
                        <p className="font-mono text-[10.5px] leading-relaxed text-mf-ink-muted">
                            <strong className="font-medium text-mf-ink">How decryption works:</strong> Your browser fetches encrypted data from our servers.
                            The decryption key lives only in the <code className="bg-mf-border/60 px-1">#fragment</code> of this URL. File names stay hidden
                            until you reveal the list with the transfer key. Decryption runs entirely client-side.
                        </p>
                    </div>

                    <div className="mt-8 flex flex-col items-center gap-4">
                        <button
                            type="button"
                            onClick={() => setShowQR(!showQR)}
                            className="inline-flex items-center gap-2 border border-mf-border bg-mf-card px-5 py-2.5 font-mono text-xs text-mf-ink-muted transition-colors hover:border-mf-accent hover:text-mf-accent"
                        >
                            <span className="material-symbols-outlined text-lg">qr_code_2</span>
                            {showQR ? 'Hide QR code' : 'Show QR code'}
                        </button>
                        {showQR ? (
                            <div className="w-full border border-mf-border bg-mf-bg-panel p-6">
                                <QRCode url={shareUrl} />
                            </div>
                        ) : null}
                    </div>
                </motion.main>
                <MfFooter showSendLink />
            </div>
        )
    }

    const fileSize = formatFileSize(metadata.file_size)
    const fileExt = metadata.original_name.split('.').pop()?.toUpperCase() || 'FILE'
    const expired = timeLeft !== null && timeLeft <= 0
    const singleExpiryFillPct =
        timeLeft != null && expiryBaselineMs
            ? Math.min(100, Math.max(0, (timeLeft / expiryBaselineMs) * 100))
            : 100

    const downloadsLeftLabel =
        maxDownloads == null ? 'Unlimited' : `${remainingDownloads} download${remainingDownloads === 1 ? '' : 's'} left`

    return (
        <div className="min-h-screen bg-mf-bg text-mf-ink">
            <ShareHelmet
                title={`${metadata.original_name} | ${SITE_NAME}`}
                description="Private encrypted file share. Search engines should not index this page."
                url={sharePageUrl}
            />
            <MfNav badge="Secure Download" />

            <motion.main className="mx-auto max-w-[860px] px-6 pb-16 pt-10 md:px-12 md:pt-[4.5rem]" {...fadeUpProps(prefersReducedMotion, 14, 0.04)}>
                <div className="mb-5 flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mf-ink-muted">
                    <span className="h-px w-[22px] bg-mf-accent" />
                    Incoming transfer
                </div>
                <h1 className="mb-10 text-[clamp(2rem,5vw,2.625rem)] font-extrabold leading-[1.05] tracking-tight md:mb-11">
                    Someone sent
                    <br />
                    you a <span className="text-mf-accent">file.</span>
                </h1>

                <MfCornerCard className="overflow-hidden">
                    <ShareDownloadErrorBanner message={shareActionError} onDismiss={() => setShareActionError('')} />
                    <div className="grid grid-cols-1 border-b border-mf-border md:grid-cols-[90px_1fr_auto] md:items-stretch">
                        <div className="flex flex-col items-center justify-center gap-1.5 bg-mf-accent py-8 md:py-0">
                            <svg className="text-white/90" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                                <polyline points="13 2 13 9 20 9" />
                            </svg>
                            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-white">{fileExt}</span>
                        </div>
                        <div className="min-w-0 border-b border-mf-border px-6 py-6 md:border-b-0 md:border-r">
                            <p className="break-words text-xl font-bold tracking-tight text-mf-ink md:text-[22px]">{metadata.original_name}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <span className="inline-flex items-center gap-1.5 border border-mf-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                    <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden>
                                        download
                                    </span>
                                    {fileSize}
                                </span>
                                <span className="inline-flex items-center gap-1.5 border border-mf-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                    <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden>
                                        schedule
                                    </span>
                                    {timeLeft !== null ? formatTimeLeft(timeLeft) : '—'}
                                </span>
                                <span className="inline-flex items-center gap-1.5 border border-mf-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                    <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden>
                                        visibility
                                    </span>
                                    {downloadsLeftLabel}
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-col justify-center gap-2 px-6 py-5 md:min-w-[180px]">
                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="inline-flex items-center justify-center gap-2 border border-mf-border py-2 font-mono text-[10.5px] uppercase tracking-wider text-mf-ink-muted transition-colors hover:border-mf-ink hover:text-mf-ink"
                            >
                                <span className="material-symbols-outlined text-sm" aria-hidden>
                                    upload
                                </span>
                                Send a file
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 divide-y divide-mf-border border-b border-mf-border md:grid-cols-3 md:divide-x md:divide-y-0">
                        <div className="px-5 py-4">
                            <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-mf-ink-muted">
                                <span className="material-symbols-outlined text-[12px] leading-none" aria-hidden>
                                    lock
                                </span>
                                Encryption
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-sm font-bold text-mf-ink">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mf-success" aria-hidden />
                                AES-256-GCM
                            </p>
                        </div>
                        <div className="px-5 py-4">
                            <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-mf-ink-muted">
                                <span className="material-symbols-outlined text-[12px] leading-none" aria-hidden>
                                    vpn_key
                                </span>
                                Key location
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-sm font-bold text-mf-ink">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mf-success" aria-hidden />
                                URL fragment only
                            </p>
                        </div>
                        <div className="px-5 py-4">
                            <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-mf-ink-muted">
                                <span className="material-symbols-outlined text-[12px] leading-none" aria-hidden>
                                    cloud
                                </span>
                                Server sees
                            </p>
                            <p className="mt-1 flex items-center gap-2 text-sm font-bold text-mf-ink">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mf-success" aria-hidden />
                                Ciphertext only
                            </p>
                        </div>
                    </div>

                    {!expired ? (
                        <div className="border-b border-mf-border px-6 py-5">
                            <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[13px] leading-none" aria-hidden>
                                        schedule
                                    </span>
                                    Link expires in
                                </span>
                                <span className={timeLeft !== null && timeLeft < 3600000 ? 'text-mf-warn' : 'text-mf-ink'}>
                                    {timeLeft !== null ? formatCountdownHMS(timeLeft) : '—'}
                                </span>
                            </div>
                            <div className="relative h-0.5 bg-mf-border">
                                <div
                                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-mf-success to-mf-warn transition-all duration-500"
                                    style={{ width: `${singleExpiryFillPct}%` }}
                                />
                                {singleExpiryFillPct > 0 && singleExpiryFillPct < 100 ? (
                                    <div
                                        className="pointer-events-none absolute top-1/2 z-[1] h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-mf-ink"
                                        style={{ left: `${singleExpiryFillPct}%` }}
                                        aria-hidden
                                    />
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {expired ? (
                        <div className="border-t border-mf-border px-8 py-12 text-center">
                            <span className="material-symbols-outlined mb-4 text-4xl text-mf-danger">error</span>
                            <p className="text-lg font-bold text-mf-ink">This link has expired.</p>
                            <p className="mx-auto mt-2 max-w-md font-mono text-[11px] leading-relaxed text-mf-ink-muted">
                                The transfer window has passed. Ask the sender to create a new link.
                            </p>
                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="mx-auto mt-8 flex w-full max-w-[280px] items-center justify-center gap-2 bg-mf-ink py-3.5 text-sm font-bold uppercase tracking-wider text-mf-bg hover:bg-mf-accent"
                            >
                                Send a new file
                            </button>
                        </div>
                    ) : limitReached && !downloading && !downloadComplete ? (
                        <div className="border-t border-mf-border px-8 py-9">
                            <button
                                type="button"
                                disabled
                                className="flex w-full cursor-not-allowed items-center justify-center gap-2 bg-mf-danger/15 py-4 text-sm font-bold uppercase tracking-wider text-mf-danger"
                            >
                                <span className="material-symbols-outlined text-xl">block</span>
                                Download limit reached
                            </button>
                            <p className="mt-4 text-center font-mono text-[11px] text-mf-ink-muted">
                                No downloads remain. Ask the sender to share again.
                            </p>
                        </div>
                    ) : (
                        <div className="px-8 py-9">
                            {downloading ? (
                                <div className="mb-4">
                                    <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                        <span>Decrypting &amp; downloading</span>
                                        <span>{Math.round(downloadProgress)}%</span>
                                    </div>
                                    <div className="h-0.5 bg-mf-border">
                                        <div className="mf-progress-fill" style={{ width: `${downloadProgress}%` }} />
                                    </div>
                                </div>
                            ) : null}

                            {!downloadComplete ? (
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    disabled={downloading}
                                    className="flex w-full items-center justify-center gap-2 bg-mf-ink py-4 text-sm font-bold uppercase tracking-wider text-mf-bg transition-colors hover:bg-mf-accent disabled:opacity-45"
                                >
                                    {downloading ? (
                                        <>
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-mf-bg border-t-transparent" />
                                            {downloadStatus || 'Working…'}
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined icon-filled text-lg" aria-hidden>
                                                download
                                            </span>
                                            Decrypt &amp; Download
                                        </>
                                    )}
                                </button>
                            ) : (
                                <div className="text-center">
                                    <div className="mb-3 text-mf-success">
                                        <span className="material-symbols-outlined text-4xl">check_circle</span>
                                    </div>
                                    <p className="text-base font-bold text-mf-ink">File downloaded &amp; decrypted.</p>
                                    <p className="mt-2 font-mono text-[10.5px] text-mf-ink-muted">
                                        Decryption ran locally in your browser.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleDownload}
                                        className="mt-6 w-full border border-mf-border py-3 font-mono text-xs uppercase tracking-wider text-mf-ink-muted transition-colors hover:border-mf-ink hover:text-mf-ink"
                                    >
                                        Download again
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-mf-border bg-mf-bg px-6 py-4 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                        <span className="flex items-center gap-2">
                            Client-side decryption
                        </span>
                        <span className="flex items-center gap-1.5 text-mf-success">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Key never sent to server
                        </span>
                    </div>
                </MfCornerCard>

                <div className="mt-6 flex items-start gap-3.5 border border-mf-border bg-mf-card p-4 md:p-5">
                    <span className="material-symbols-outlined shrink-0 text-mf-warn text-lg">info</span>
                    <p className="font-mono text-[10.5px] leading-relaxed text-mf-ink-muted">
                        <strong className="font-medium text-mf-ink">How decryption works:</strong> Your browser fetches encrypted data from our servers.
                        The decryption key lives only in the <code className="bg-mf-border/60 px-1">#fragment</code> of this URL. Decryption runs entirely
                        client-side.
                    </p>
                </div>

                <div className="mt-8 flex flex-col items-center gap-4">
                    <button
                        type="button"
                        onClick={() => setShowQR(!showQR)}
                        className="inline-flex items-center gap-2 border border-mf-border bg-mf-card px-5 py-2.5 font-mono text-xs text-mf-ink-muted transition-colors hover:border-mf-accent hover:text-mf-accent"
                    >
                        <span className="material-symbols-outlined text-lg">qr_code_2</span>
                        {showQR ? 'Hide QR code' : 'Show QR code'}
                    </button>
                    {showQR ? (
                        <div className="w-full border border-mf-border bg-mf-bg-panel p-6">
                            <QRCode url={shareUrl} />
                        </div>
                    ) : null}
                </div>
            </motion.main>

            <MfFooter showSendLink />
        </div>
    )
}
