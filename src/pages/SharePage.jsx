import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { formatFileSize } from '../utils/fileUtils'
import { downloadAndDecryptStreaming, terminateWorkerPool } from '../utils/streamingEncryption'
import QRCode from '../components/SharePage/QRCode'
import { OG_IMAGE_URL, SITE_NAME } from '../lib/siteConfig'
import { trackEvent } from '../lib/analytics'

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

function ShareStat({ label, value, accent = 'text-white' }) {
    return (
        <div className="flex flex-col items-center justify-center gap-1 px-3 py-4 text-center">
            <p className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{label}</p>
            <p className={`text-base font-medium ${accent}`}>{value}</p>
        </div>
    )
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

    const downloadCount = metadata?.download_count || 0
    const maxDownloads = metadata?.max_downloads ?? null
    const remainingDownloads = maxDownloads == null
        ? null
        : Math.max((metadata?.remaining_downloads ?? (maxDownloads - downloadCount)), 0)
    const limitReached = maxDownloads != null && remainingDownloads <= 0
    const requiresPassword = Boolean(metadata?.is_password_protected) && !isUnlocked

    useEffect(() => {
        loadFileMetadata()
    }, [identifier])

    // Live expiry countdown
    useEffect(() => {
        if (!metadata?.expires_at) return

        function updateCountdown() {
            const diff = new Date(metadata.expires_at) - new Date()
            setTimeLeft(diff > 0 ? diff : 0)
        }

        updateCountdown()
        const interval = setInterval(updateCountdown, 60000)
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

    async function handleDownload() {
        try {
            setDownloading(true)
            setDownloadProgress(0)
            setDownloadStatus('Authorizing...')
            setDownloadComplete(false)

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

            setTimeout(() => {
                setDownloading(false)
                setDownloadComplete(true)
                setDownloadProgress(0)
            }, 1500)

        } catch (err) {
            console.error('Download error:', err)
            if (err.message !== 'Download cancelled') {
                alert(`Download failed: ${err.message}`)
            }
            setDownloading(false)
            setDownloadProgress(0)
        } finally {
            terminateWorkerPool()
        }
    }

    // Loading State
    if (loading) {
        return (
            <div className="min-h-screen bg-surface flex items-center justify-center relative overflow-hidden">
                <ShareHelmet
                    title={`Loading Secure Share | ${SITE_NAME}`}
                    description="Preparing a private encrypted file share."
                    url={sharePageUrl}
                />
                <div className="ambient-glow" />
                <div className="relative z-10 glass-card p-12 text-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-on-surface-variant">Loading file...</p>
                </div>
            </div>
        )
    }

    // Error State
    if (error) {
        return (
            <div className="min-h-screen bg-surface flex items-center justify-center relative overflow-hidden">
                <ShareHelmet
                    title={`Secure Share Unavailable | ${SITE_NAME}`}
                    description="This private encrypted file share is unavailable or has expired."
                    url={sharePageUrl}
                />
                <div className="ambient-glow" />
                <div className="relative z-10 glass-card p-12 text-center max-w-md mx-4">
                    <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-3xl text-red-400">error</span>
                    </div>
                    <h2 className="text-xl font-medium text-white mb-2">File Not Found</h2>
                    <p className="text-on-surface-variant mb-6">{error}</p>
                    <button onClick={() => navigate('/')} className="btn-primary">
                        Upload a File
                    </button>
                </div>
            </div>
        )
    }

    const shareUrl = window.location.href

    if (requiresPassword) {
        return (
            <div className="min-h-screen bg-surface relative overflow-hidden">
                <ShareHelmet
                    title={`Protected Share | ${SITE_NAME}`}
                    description="Password-protected encrypted file share."
                    url={sharePageUrl}
                />
                <div className="ambient-glow" />
                <header className="relative z-20 flex items-center gap-3 px-4 py-4 md:px-6">
                    <span className="material-symbols-outlined text-primary text-3xl icon-filled">shield_lock</span>
                    <span className="text-xl font-normal tracking-tight text-white">MaskedFile</span>
                </header>
                <main className="relative z-10 flex flex-col items-center justify-center px-4 py-8 md:py-16">
                    <div className="w-full max-w-[420px] glass-card p-6 md:p-8 text-center space-y-6">
                        <div className="w-16 h-16 bg-primary-container rounded-full flex items-center justify-center mx-auto">
                            <span className="material-symbols-outlined text-3xl text-primary icon-filled">lock</span>
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-medium text-white">Protected Share Link</h1>
                            <p className="text-sm text-on-surface-variant">
                                Enter the password to reveal file details and authorize the secure download.
                            </p>
                        </div>

                        {timeLeft !== null && (
                            <div className={`inline-flex items-center gap-1.5 border px-3 py-1.5 rounded-lg ${timeLeft <= 0
                                ? 'bg-red-900/20 border-red-500/30'
                                : timeLeft < 3600000
                                    ? 'bg-amber-900/20 border-amber-500/30'
                                    : 'bg-surface-variant/30 border-outline-variant/50'
                                }`}>
                                <span className={`material-symbols-outlined text-[14px] ${timeLeft <= 0 ? 'text-red-400' : timeLeft < 3600000 ? 'text-amber-400' : 'text-primary'
                                    }`}>schedule</span>
                                <span className={timeLeft <= 0 ? 'text-red-400' : timeLeft < 3600000 ? 'text-amber-400' : 'text-gray-300'}>
                                    {formatTimeLeft(timeLeft)}
                                </span>
                            </div>
                        )}

                        <form onSubmit={handleUnlock} className="space-y-4">
                            <div className="rounded-2xl border border-outline-variant bg-surface-container-high px-4 py-3 text-left">
                                <label className="block text-xs uppercase tracking-wide text-on-surface-variant mb-2">
                                    Password
                                </label>
                                <input
                                    type="password"
                                    autoComplete="current-password"
                                    value={passwordInput}
                                    onChange={(event) => setPasswordInput(event.target.value)}
                                    placeholder="Enter password"
                                    className="w-full bg-transparent text-white placeholder:text-on-surface-variant/60 outline-none text-sm"
                                />
                            </div>

                            {unlockError && (
                                <div className="text-sm text-red-400">
                                    {unlockError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={unlocking}
                                className="w-full h-12 rounded-full flex items-center justify-center gap-2 transition-all duration-300 font-medium tracking-wide text-[14px] border border-white/5 bg-primary hover:bg-primary-400 hover:shadow-purple-glow-button active:scale-[0.98] text-black disabled:opacity-70"
                            >
                                {unlocking ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        Unlocking...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[20px]">lock_open</span>
                                        Unlock File
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="rounded-2xl border border-outline-variant bg-surface-container-high/70 px-4 py-3 text-xs text-on-surface-variant">
                            File details stay hidden until the correct password unlocks this share.
                        </div>
                    </div>
                </main>
            </div>
        )
    }

    const fileSize = formatFileSize(metadata.file_size)
    const fileExt = metadata.original_name.split('.').pop()?.toUpperCase() || 'FILE'

    return (
        <div className="min-h-screen bg-surface relative overflow-hidden">
            <ShareHelmet
                title={`${metadata.original_name} | ${SITE_NAME}`}
                description="Private encrypted file share. Search engines should not index this page."
                url={sharePageUrl}
            />
            {/* Ambient background glow */}
            <div className="ambient-glow" />

            {/* Header */}
            <header className="relative z-20 flex items-center gap-3 px-4 py-4 md:px-6">
                <span className="material-symbols-outlined text-primary text-3xl icon-filled">shield_lock</span>
                <span className="text-xl font-normal tracking-tight text-white">MaskedFile</span>
            </header>

            {/* Main Content */}
            <main className="relative z-10 flex flex-col items-center justify-center px-4 py-8 md:py-16">
                <div className="w-full max-w-[420px] glass-card p-6 flex flex-col gap-6 card-hover">
                    <div className="relative flex justify-center pt-2">
                        <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center text-primary-200 shadow-inner border border-outline/20">
                            <span className="material-symbols-outlined text-[32px]">description</span>
                        </div>
                        <div className="absolute -bottom-3 bg-primary-900 text-primary-200 text-[11px] font-medium px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 border border-primary/20">
                            <span className="material-symbols-outlined text-[14px] icon-filled">lock</span>
                            Encrypted
                        </div>
                    </div>

                    <div className="text-center space-y-2 pt-2">
                        <h1 className="text-[22px] leading-7 font-normal text-white break-words">
                            {metadata.original_name}
                        </h1>
                        <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
                            <span className="rounded-full border border-outline px-3 py-1">{fileSize}</span>
                            <span className="rounded-full border border-outline px-3 py-1">{fileExt}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 divide-x divide-outline-variant rounded-[24px] border border-outline-variant bg-surface-container-high">
                        <ShareStat label="Downloads" value={downloadCount} />
                        <ShareStat
                            label="Views left"
                            value={maxDownloads == null ? 'Unlimited' : `${remainingDownloads} / ${maxDownloads}`}
                            accent={limitReached ? 'text-red-400' : 'text-primary-200'}
                        />
                        <ShareStat
                            label="Expires in"
                            value={timeLeft !== null ? formatTimeLeft(timeLeft) : 'Unknown'}
                            accent={timeLeft !== null && timeLeft <= 0 ? 'text-red-400' : timeLeft !== null && timeLeft < 3600000 ? 'text-amber-400' : 'text-amber-300'}
                        />
                    </div>

                    <div className="rounded-2xl border border-outline-variant bg-surface-container-high/70 px-4 py-3 text-sm text-on-surface-variant flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">key</span>
                        <span>Key embedded in URL</span>
                        <span className="text-on-surface-variant/60">-</span>
                        <span>Zero-knowledge decryption</span>
                        <span className="material-symbols-outlined text-primary ml-auto">check_circle</span>
                    </div>

                    <button
                        onClick={!limitReached ? handleDownload : undefined}
                        disabled={downloading || limitReached}
                        className={`w-full h-12 rounded-full flex items-center justify-center gap-2 transition-all duration-300 font-medium tracking-wide text-[14px] border border-white/5 ${limitReached
                                ? 'bg-red-900/40 text-red-300 cursor-not-allowed'
                                : downloadComplete
                                    ? 'bg-green-600 text-white'
                                    : 'bg-primary hover:bg-primary-400 hover:shadow-purple-glow-button active:scale-[0.98] text-black'
                            }`}
                    >
                        {downloading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                {downloadStatus} ({Math.round(downloadProgress)}%)
                            </>
                        ) : limitReached ? (
                            <>
                                <span className="material-symbols-outlined text-[20px]">block</span>
                                Download Limit Reached
                            </>
                        ) : downloadComplete ? (
                            <>
                                <span className="material-symbols-outlined text-[20px]">download</span>
                                Download Again
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[20px]">download</span>
                                Decrypt & Download
                            </>
                        )}
                    </button>

                    {downloading && (
                        <div className="w-full h-1 bg-surface-variant rounded-full overflow-hidden">
                            <div
                                className="progress-bar transition-all duration-300"
                                style={{ width: `${downloadProgress}%` }}
                            />
                        </div>
                    )}

                    <div className="rounded-2xl border border-outline-variant bg-surface-container-high/70 px-4 py-3 text-center">
                        <p className="text-[12px] leading-5 text-on-surface-variant">
                            Decrypted only in your browser. Secure, private, and never exposed to the server.
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-on-surface-variant/70 mt-6">
                    <span className="material-symbols-outlined text-[16px]">verified_user</span>
                    <span className="text-[12px] font-medium tracking-wide">Secure Browser Decryption</span>
                </div>

                <button
                    onClick={() => setShowQR(!showQR)}
                    className="mt-6 btn-secondary text-sm flex items-center gap-2"
                >
                    <span className="material-symbols-outlined text-lg">qr_code_2</span>
                    {showQR ? 'Hide QR Code' : 'Show QR Code'}
                </button>

                {showQR && (
                    <div className="mt-6 glass-card p-6">
                        <QRCode url={shareUrl} />
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="relative z-10 text-center py-6 text-on-surface-variant/30 text-[10px] font-medium tracking-widest uppercase flex items-center justify-center gap-2">
                <span>Made with</span>
                <span className="text-red-500 text-sm">❤️</span>
                <span>by Basit</span>
            </footer>
        </div>
    )
}
