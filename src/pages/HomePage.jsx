import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import DragDropZone from '../components/FileUpload/DragDropZone'
import UploadProgress from '../components/FileUpload/UploadProgress'
import ExpirySelector, { EXPIRY_OPTIONS } from '../components/FileUpload/ExpirySelector'
import FilePreviewModal from '../components/FileUpload/FilePreviewModal'
import QRCode from '../components/SharePage/QRCode'
import MfNav from '../components/layout/MfNav'
import MfFooter from '../components/layout/MfFooter'
import MfCornerCard from '../components/layout/MfCornerCard'
import {
    encryptAndUploadCollection,
    encryptAndUploadStreaming,
    rollbackUploadedObjects,
    terminateWorkerPool
} from '../utils/streamingEncryption'
import { formatFileSize } from '../utils/fileUtils'
import { buildCanonicalUrl, DEFAULT_DESCRIPTION, DEFAULT_TITLE, OG_IMAGE_URL, SITE_NAME } from '../lib/siteConfig'
import { trackEvent } from '../lib/analytics'

function SurfaceLabel({ icon, title, description, trailing }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-mf-accent">{icon}</span>
                <div>
                    <p className="text-sm font-bold text-mf-ink">{title}</p>
                    {description ? <p className="text-xs text-mf-ink-muted">{description}</p> : null}
                </div>
            </div>
            {trailing}
        </div>
    )
}

function SummaryItem({ label, value, accent = 'text-mf-ink' }) {
    return (
        <div className="border border-mf-border bg-mf-bg-panel px-4 py-3 text-left">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mf-ink-muted">{label}</p>
            <p className={`mt-2 text-sm font-semibold ${accent}`}>{value}</p>
        </div>
    )
}

function TrustStrip({ icon, text }) {
    return (
        <div className="flex items-center justify-center gap-2 border border-mf-border bg-mf-bg px-4 py-3 font-mono text-xs text-mf-ink-muted">
            <span className="material-symbols-outlined text-[16px] text-mf-accent">{icon}</span>
            <span>{text}</span>
        </div>
    )
}

function fileTypeLabel(file) {
    const extension = file?.name?.split('.').pop()?.trim()
    if (extension) {
        return extension.toUpperCase()
    }

    return file?.type?.split('/').pop()?.toUpperCase() || 'FILE'
}

function formatDownloadLimitSummary(maxDownloads) {
    if (maxDownloads == null) {
        return 'Unlimited'
    }

    return `${maxDownloads} download${maxDownloads === 1 ? '' : 's'}`
}

function getStageFromStatus(statusText) {
    const normalized = statusText.toLowerCase()

    if (normalized.includes('encrypt')) return 'encrypting'
    if (normalized.includes('upload')) return 'uploading'
    if (normalized.includes('metadata') || normalized.includes('save')) return 'saving'
    return 'preparing'
}

function flattenSelection(entries) {
    return entries.map((entry) => entry.file)
}

function formatCollectionCount(count) {
    return `${count} file${count === 1 ? '' : 's'}`
}

function HowItWorks() {
    return (
        <section className="mf-fade-up mt-16" style={{ animationDelay: '0.15s' }}>
            <div className="mb-9 flex items-center gap-3.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mf-ink-muted">
                <span>How it works</span>
                <span className="h-px flex-1 bg-mf-border" />
            </div>
            <div className="grid grid-cols-1 gap-px bg-mf-border md:grid-cols-3">
                {[
                    {
                        n: '01',
                        t: 'Select & Configure',
                        d: 'Drop your file and set expiry rules, password protection, and download limits — all before anything leaves your device.',
                    },
                    {
                        n: '02',
                        t: 'Client-Side Encrypt',
                        d: 'AES-256 encryption runs entirely in your browser. The decryption key never leaves your machine — we only receive ciphertext.',
                    },
                    {
                        n: '03',
                        t: 'Share the Link',
                        d: 'Send the generated link to your recipient. The key travels in the URL fragment — structurally invisible to servers and logs.',
                    },
                ].map((step) => (
                    <div key={step.n} className="bg-mf-bg px-6 py-7 md:py-9">
                        <div className="mb-3.5 text-[42px] font-extrabold leading-none tracking-tight text-mf-border">{step.n}</div>
                        <h3 className="mb-2 text-sm font-bold tracking-tight text-mf-ink">{step.t}</h3>
                        <p className="font-mono text-[10.5px] leading-relaxed tracking-wide text-mf-ink-muted">{step.d}</p>
                    </div>
                ))}
            </div>
        </section>
    )
}

export default function HomePage() {
    const prefersReducedMotion = useReducedMotion()
    const shellTransition = prefersReducedMotion
        ? { duration: 0 }
        : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }
    const [selectedEntries, setSelectedEntries] = useState([])
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadStatus, setUploadStatus] = useState('')
    const [uploadStage, setUploadStage] = useState('')
    const [uploadContextLabel, setUploadContextLabel] = useState('')
    const [uploadDisplayName, setUploadDisplayName] = useState('')
    const [uploadDisplayMeta, setUploadDisplayMeta] = useState('')
    const [shareUrl, setShareUrl] = useState(null)
    const [shareSummary, setShareSummary] = useState(null)
    const [copied, setCopied] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    const [showQR, setShowQR] = useState(false)
    const [showAdvancedProtection, setShowAdvancedProtection] = useState(false)
    const [selectedExpiry, setSelectedExpiry] = useState(EXPIRY_OPTIONS[2])
    const [maxDownloadsInput, setMaxDownloadsInput] = useState('')
    const [passwordInput, setPasswordInput] = useState('')
    const [confirmPasswordInput, setConfirmPasswordInput] = useState('')

    const resetUploadSettings = () => {
        setSelectedExpiry(EXPIRY_OPTIONS[2])
        setMaxDownloadsInput('')
        setPasswordInput('')
        setConfirmPasswordInput('')
        setShowAdvancedProtection(false)
        setShowPreview(false)
        setUploadStage('')
        setUploadStatus('')
        setUploadProgress(0)
        setUploadContextLabel('')
        setUploadDisplayName('')
        setUploadDisplayMeta('')
        setShareSummary(null)
    }

    const handleFileSelect = (entries) => {
        setSelectedEntries(entries)
        setShareUrl(null)
        setCopied(false)
        setShowQR(false)
        setShowPreview(false)
        setShowAdvancedProtection(false)
    }

    const clearSelectedFile = () => {
        setSelectedEntries([])
        setShowAdvancedProtection(false)
        setShowPreview(false)
    }

    const handleUploadAnother = () => {
        setShareUrl(null)
        setShowQR(false)
        setCopied(false)
        setSelectedEntries([])
        resetUploadSettings()
    }

    const selectedFiles = flattenSelection(selectedEntries)
    const selectedFile = selectedFiles.length === 1 ? selectedFiles[0] : null
    const isCollection = selectedEntries.length > 1
    const totalSelectedSize = selectedEntries.reduce((sum, entry) => sum + entry.file.size, 0)
    const selectionTitle = isCollection
        ? `${formatCollectionCount(selectedEntries.length)} selected`
        : selectedFile?.name || ''
    const selectionChips = isCollection
        ? [formatCollectionCount(selectedEntries.length), formatFileSize(totalSelectedSize)]
        : selectedFile
            ? [formatFileSize(selectedFile.size), fileTypeLabel(selectedFile)]
            : []

    const handleUpload = async () => {
        if (selectedEntries.length === 0) return

        try {
            const trimmedMaxDownloads = maxDownloadsInput.trim()
            const hasDownloadLimit = trimmedMaxDownloads.length > 0
            const maxDownloads = hasDownloadLimit ? Number(trimmedMaxDownloads) : null
            const normalizedPassword = passwordInput.trim()
            const normalizedConfirmPassword = confirmPasswordInput.trim()

            if (hasDownloadLimit && !/^[1-9]\d*$/.test(trimmedMaxDownloads)) {
                throw new Error('Download limit must be a whole number greater than 0')
            }

            if (normalizedPassword && normalizedPassword.length < 4) {
                throw new Error('Password must be at least 4 characters long')
            }

            if (normalizedPassword !== normalizedConfirmPassword) {
                throw new Error('Password confirmation does not match')
            }

            setUploading(true)
            setUploadProgress(0)
            setUploadStage('preparing')
            setUploadStatus('Preparing secure upload...')
            setUploadContextLabel(isCollection ? `Collection of ${formatCollectionCount(selectedEntries.length)}` : '')
            setUploadDisplayName(selectionTitle)
            setUploadDisplayMeta(isCollection ? formatFileSize(totalSelectedSize) : `${formatFileSize(selectedFile.size)} - ${fileTypeLabel(selectedFile)}`)
            setShowQR(false)
            trackEvent('upload_started', {
                category: 'engagement',
                label: isCollection ? 'multi' : (selectedFile.type || 'unknown'),
            })

            const fileId = crypto.randomUUID()
            let sharePath
            let shareKind = 'single'
            let keyFragment = ''
            let metadataPayload
            let uploadedObjects = []

            if (isCollection) {
                setUploadStage('encrypting')
                setUploadStatus('Encrypting collection locally...')

                const uploadResult = await encryptAndUploadCollection(
                    selectedEntries,
                    fileId,
                    ({ progress, statusText, completedFilesCount, activeFilesCount, totalFiles, currentFileName, stage }) => {
                        setUploadStatus(statusText)
                        if (stage === 'manifest') {
                            setUploadProgress(95 + progress * 0.05)
                            setUploadStage('saving')
                        } else {
                            setUploadProgress(progress * 0.95)
                            setUploadStage('encrypting')
                        }
                        setUploadDisplayName(stage === 'manifest' ? 'Share manifest' : selectionTitle)

                        if (stage === 'manifest') {
                            setUploadDisplayMeta(`${formatCollectionCount(selectedEntries.length)} - ${formatFileSize(totalSelectedSize)}`)
                            setUploadContextLabel('Encrypting share manifest')
                        } else {
                            setUploadDisplayMeta(formatFileSize(totalSelectedSize))
                            setUploadContextLabel(
                                `${completedFilesCount || 0} of ${totalFiles} completed (${activeFilesCount || 0} active)`
                            )
                        }
                    }
                )

                shareKind = 'multi'
                keyFragment = `#key=${uploadResult.transferKeyHex}`
                uploadedObjects = uploadResult.uploadedObjects || []
                metadataPayload = {
                    fileId,
                    shareKind,
                    fileCount: uploadResult.fileCount,
                    totalSize: uploadResult.totalSize,
                    collectionItemIds: uploadResult.items.map((item) => item.itemId),
                    manifestStoragePath: uploadResult.manifestUpload.objectKey,
                    manifestChunkCount: uploadResult.manifestUpload.totalChunks,
                    manifestChunkSizes: uploadResult.manifestUpload.chunkSizes || null,
                    expiresAt: new Date().toISOString(),
                    maxDownloads,
                    password: normalizedPassword || null
                }
            } else {
                setUploadStage('encrypting')
                setUploadStatus('Encrypting locally...')

                const uploadResult = await encryptAndUploadStreaming(
                    selectedFile,
                    fileId,
                    (progress, statusText) => {
                        setUploadProgress(progress * 0.95)
                        setUploadStatus(statusText)
                        setUploadStage(getStageFromStatus(statusText))
                    }
                )

                keyFragment = `#key=${uploadResult.keyHex}&iv=${uploadResult.ivHex}`
                uploadedObjects = [{
                    objectKey: uploadResult.objectKey,
                    rollbackToken: uploadResult.rollbackToken
                }]
                metadataPayload = {
                    fileId,
                    originalName: selectedFile.name,
                    fileType: selectedFile.type,
                    fileSize: selectedFile.size,
                    storagePath: uploadResult.objectKey,
                    storageBackend: 'r2',
                    chunkCount: uploadResult.totalChunks,
                    chunkSizes: uploadResult.chunkSizes || null,
                    expiresAt: new Date().toISOString(),
                    maxDownloads,
                    password: normalizedPassword || null
                }
            }

            setUploadStage('saving')
            setUploadStatus('Saving share metadata...')
            setUploadProgress(95)

            const expiresAt = new Date()
            if (selectedExpiry.unit === 'hours') {
                expiresAt.setHours(expiresAt.getHours() + selectedExpiry.value)
            } else {
                expiresAt.setDate(expiresAt.getDate() + selectedExpiry.value)
            }
            metadataPayload.expiresAt = expiresAt.toISOString()

            const metadataResponse = await fetch('/api/files/metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metadataPayload)
            })

            if (!metadataResponse.ok) {
                const errData = await metadataResponse.json().catch(() => ({}))
                await rollbackUploadedObjects(uploadedObjects)
                throw new Error(errData.message || 'Failed to save file metadata')
            }

            const metadataResult = await metadataResponse.json()

            setUploadStatus('Secure share ready')
            setUploadProgress(100)
            setUploadStage('complete')

            const baseUrl = window.location.origin
            sharePath = metadataResult.shortId ? `/s/${metadataResult.shortId}` : `/share/${fileId}`
            const url = `${baseUrl}${sharePath}${keyFragment}`
            setShareSummary({
                shareKind,
                fileCount: selectedEntries.length,
                totalSize: totalSelectedSize,
                expiryLabel: selectedExpiry.label,
                downloadLimitLabel: formatDownloadLimitSummary(maxDownloads),
                passwordProtected: Boolean(normalizedPassword),
            })
            setShareUrl(url)
            trackEvent('upload_completed', {
                category: 'engagement',
                label: isCollection ? 'multi' : (selectedFile.type || 'unknown'),
            })
        } catch (error) {
            console.error('Upload error:', error)
            alert(`Upload failed: ${error.message}`)
        } finally {
            setUploading(false)
            terminateWorkerPool()
        }
    }

    const handleCopy = async () => {
        if (!shareUrl) return

        try {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            prompt('Copy this link:', shareUrl)
        }
    }

    const wideCard = selectedEntries.length > 0 || uploading || shareUrl

    return (
        <div className="min-h-screen bg-mf-bg text-mf-ink">
            <Helmet>
                <title>{DEFAULT_TITLE}</title>
                <meta name="description" content={DEFAULT_DESCRIPTION} />
                <link rel="canonical" href={buildCanonicalUrl('/')} />
                <meta property="og:site_name" content={SITE_NAME} />
                <meta property="og:type" content="website" />
                <meta property="og:title" content={DEFAULT_TITLE} />
                <meta property="og:description" content={DEFAULT_DESCRIPTION} />
                <meta property="og:url" content={buildCanonicalUrl('/')} />
                <meta property="og:image" content={OG_IMAGE_URL} />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={DEFAULT_TITLE} />
                <meta name="twitter:description" content={DEFAULT_DESCRIPTION} />
                <meta name="twitter:image" content={OG_IMAGE_URL} />
            </Helmet>

            <MfNav />

            <main className={`mx-auto px-4 pb-12 pt-10 md:px-8 ${wideCard ? 'max-w-2xl' : 'max-w-[680px]'}`}>
                <div className="mf-fade-up mb-10 text-center md:mb-14">
                    <div className="mb-5 inline-flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mf-ink-muted">
                        <span className="h-px w-[22px] bg-mf-accent" />
                        Secure File Transfer
                        <span className="h-px w-[22px] bg-mf-accent" />
                    </div>
                    <h1 className="mb-4 text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold leading-[1.02] tracking-tight">
                        Masked
                        <br />
                        <span className="text-mf-accent">Transfer.</span>
                    </h1>
                    <p className="mx-auto mb-7 max-w-md font-mono text-xs leading-relaxed tracking-wide text-mf-ink-muted">
                        Client-side encrypted. Zero-knowledge architecture.
                        <br />
                        Your files never touch our servers in plaintext.
                    </p>
                    <div className="inline-flex flex-wrap items-center justify-center gap-2.5 border border-mf-border bg-mf-card px-4 py-2.5 font-mono text-[10px] tracking-wide text-mf-ink">
                        <span className="relative flex h-2 w-2 shrink-0 rounded-full bg-mf-success">
                            <span className="absolute inset-0 animate-ping rounded-full bg-mf-success/40" />
                        </span>
                        <span>AES-256 ACTIVE</span>
                        <span className="h-3 w-px bg-mf-border" />
                        <span>END-TO-END</span>
                        <span className="h-3 w-px bg-mf-border" />
                        <span>ZERO-KNOWLEDGE</span>
                    </div>
                </div>

                <motion.div
                    layout
                    transition={shellTransition}
                    className="w-full"
                >
                    {!uploading && !shareUrl && (
                        <MfCornerCard className="mf-fade-up overflow-hidden" style={{ animationDelay: '0.08s' }}>
                            <AnimatePresence initial={false} mode="wait">
                                {selectedEntries.length === 0 ? (
                                    <motion.div
                                        key="dropzone"
                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                                        transition={shellTransition}
                                    >
                                        <DragDropZone onFileSelect={handleFileSelect} />
                                        <div className="border-t border-mf-border px-4 py-4">
                                            <TrustStrip icon="lock" text="Files are encrypted in your browser before upload." />
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="composer"
                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                                        transition={shellTransition}
                                    >
                                        <div className="flex items-center justify-between gap-3 border-b border-mf-border bg-mf-bg-panel px-4 py-4 sm:px-5">
                                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-mf-accent/10 text-mf-accent">
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                                                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                                                        <polyline points="13 2 13 9 20 9" />
                                                    </svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-mf-ink">{selectionTitle}</p>
                                                    <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10.5px] text-mf-ink-muted">
                                                        {selectionChips.map((chip) => (
                                                            <span key={chip}>{chip}</span>
                                                        ))}
                                                    </div>
                                                    {isCollection ? (
                                                        <div className="mt-2 space-y-0.5 font-mono text-[10px] text-mf-ink-muted">
                                                            {selectedEntries.slice(0, 3).map((entry) => (
                                                                <p key={entry.relativePath} className="truncate">{entry.relativePath}</p>
                                                            ))}
                                                            {selectedEntries.length > 3 ? (
                                                                <p className="text-mf-accent">and {selectedEntries.length - 3} more…</p>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={clearSelectedFile}
                                                className="shrink-0 font-mono text-xs text-mf-ink-muted transition-colors hover:text-mf-danger"
                                                aria-label="Remove file"
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                                                    <line x1="18" y1="6" x2="6" y2="18" />
                                                    <line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                            </button>
                                        </div>

                                        <div className="grid border-b border-mf-border md:grid-cols-2">
                                            <div className="flex items-center justify-between gap-3 border-b border-mf-border px-4 py-4 md:border-b-0 md:border-r">
                                                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mf-ink-muted">Expires after</span>
                                                <ExpirySelector selected={selectedExpiry} onChange={setSelectedExpiry} />
                                            </div>
                                            <div className="flex items-center px-4 py-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAdvancedProtection((v) => !v)}
                                                    className="flex w-full items-center justify-between gap-2 text-left"
                                                    aria-expanded={showAdvancedProtection}
                                                >
                                                    <SurfaceLabel
                                                        icon="tune"
                                                        title="Advanced protection"
                                                        description="Optional limits, password, preview."
                                                        trailing={
                                                            <span className="border border-mf-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted">
                                                                Optional
                                                            </span>
                                                        }
                                                    />
                                                    <span className={`material-symbols-outlined text-mf-ink-muted transition-transform ${showAdvancedProtection ? 'rotate-180' : ''}`}>
                                                        expand_more
                                                    </span>
                                                </button>
                                            </div>
                                        </div>

                                        <AnimatePresence initial={false}>
                                            {showAdvancedProtection && (
                                                <motion.div
                                                    key="advanced-protection"
                                                    initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                                    transition={shellTransition}
                                                    className="overflow-hidden border-b border-mf-border bg-mf-bg-panel"
                                                >
                                                    <div className="space-y-4 px-4 py-4 sm:px-5">
                                                        <div className="border border-mf-border bg-mf-card px-4 py-3">
                                                            <label className="mb-2 block font-mono text-[10px] uppercase tracking-wide text-mf-ink-muted">Download limit</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                step="1"
                                                                inputMode="numeric"
                                                                value={maxDownloadsInput}
                                                                onChange={(event) => setMaxDownloadsInput(event.target.value)}
                                                                placeholder="Unlimited"
                                                                className="w-full bg-transparent font-mono text-sm text-mf-ink outline-none placeholder:text-mf-ink-muted/60"
                                                            />
                                                            <p className="mt-2 font-mono text-[10px] text-mf-ink-muted">
                                                                Each authorized download consumes one remaining view.
                                                            </p>
                                                        </div>

                                                        <div className="space-y-3 border border-mf-border bg-mf-card px-4 py-3">
                                                            <div>
                                                                <label className="mb-2 block font-mono text-[10px] uppercase tracking-wide text-mf-ink-muted">Password</label>
                                                                <input
                                                                    type="password"
                                                                    autoComplete="new-password"
                                                                    value={passwordInput}
                                                                    onChange={(event) => setPasswordInput(event.target.value)}
                                                                    placeholder="Leave blank for no password"
                                                                    className="w-full bg-transparent font-mono text-sm text-mf-ink outline-none placeholder:text-mf-ink-muted/60"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="mb-2 block font-mono text-[10px] uppercase tracking-wide text-mf-ink-muted">Confirm password</label>
                                                                <input
                                                                    type="password"
                                                                    autoComplete="new-password"
                                                                    value={confirmPasswordInput}
                                                                    onChange={(event) => setConfirmPasswordInput(event.target.value)}
                                                                    placeholder="Repeat password"
                                                                    className="w-full bg-transparent font-mono text-sm text-mf-ink outline-none placeholder:text-mf-ink-muted/60"
                                                                />
                                                            </div>
                                                            <p className="font-mono text-[10px] text-mf-ink-muted">
                                                                Adds a server-side gate before anyone can fetch the encrypted file.
                                                            </p>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => setShowPreview(true)}
                                                            disabled={isCollection}
                                                            className="flex h-10 w-full items-center justify-center gap-2 border border-mf-border font-mono text-sm text-mf-ink-muted transition-colors hover:border-mf-ink hover:text-mf-ink disabled:opacity-50"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">visibility</span>
                                                            {isCollection ? 'Preview unavailable for collections' : 'Preview before sending'}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        <div className="p-4 sm:p-5">
                                            <button
                                                type="button"
                                                onClick={handleUpload}
                                                className="flex w-full items-center justify-center gap-2 bg-mf-accent py-4 text-sm font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                                            >
                                                <span className="material-symbols-outlined icon-filled text-lg">rocket_launch</span>
                                                Secure &amp; Send
                                            </button>
                                            <div className="mt-4">
                                                <TrustStrip icon="verified_user" text="Encrypted in your browser before anything leaves your device." />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </MfCornerCard>
                    )}

                    {uploading && (
                        <MfCornerCard>
                            <UploadProgress
                                progress={uploadProgress}
                                fileName={uploadDisplayName || selectionTitle}
                                fileMeta={uploadDisplayMeta}
                                status={uploadStatus}
                                stage={uploadStage}
                                contextLabel={uploadContextLabel}
                            />
                        </MfCornerCard>
                    )}

                    {shareUrl && (
                        <MfCornerCard className="space-y-5 p-5 sm:p-6">
                            <div className="space-y-3 text-center">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mf-success/15 text-mf-success">
                                    <span className="material-symbols-outlined text-3xl icon-filled">check_circle</span>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-mf-ink">Secure share ready</h2>
                                    <p className="mt-1 font-mono text-sm text-mf-ink-muted">
                                        Copy the link below. Recipients decrypt the file directly in their browser.
                                    </p>
                                </div>
                            </div>

                            <div className="border border-mf-accent/25 bg-mf-accent/10 px-4 py-4">
                                <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-mf-accent">Secure link ready</p>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <p className="flex-1 break-all font-mono text-xs text-mf-ink">{shareUrl}</p>
                                    <button
                                        type="button"
                                        onClick={handleCopy}
                                        className="shrink-0 bg-mf-accent px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                                    >
                                        {copied ? 'Copied ✓' : 'Copy'}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <SummaryItem
                                    label={shareSummary?.shareKind === 'multi' ? 'Collection' : 'File'}
                                    value={shareSummary?.shareKind === 'multi'
                                        ? `${formatCollectionCount(shareSummary?.fileCount || 0)} - ${formatFileSize(shareSummary?.totalSize || 0)}`
                                        : selectedFile?.name || 'Secure file'}
                                />
                                <SummaryItem label="Expires" value={shareSummary?.expiryLabel || selectedExpiry.label} />
                                <SummaryItem label="Downloads" value={shareSummary?.downloadLimitLabel || 'Unlimited'} />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <SummaryItem
                                    label="Password"
                                    value={shareSummary?.passwordProtected ? 'Protected' : 'Not required'}
                                    accent={shareSummary?.passwordProtected ? 'text-mf-accent' : 'text-mf-ink'}
                                />
                                <SummaryItem
                                    label="Recipient view"
                                    value={shareSummary?.shareKind === 'multi' ? 'Collection list' : 'Single secure file'}
                                />
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => setShowQR((v) => !v)}
                                    className="flex flex-1 items-center justify-center gap-2 border border-mf-border bg-mf-bg-panel py-3 font-mono text-sm text-mf-ink transition-colors hover:border-mf-ink"
                                >
                                    <span className="material-symbols-outlined text-lg">qr_code_2</span>
                                    {showQR ? 'Hide QR' : 'Show QR'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleUploadAnother}
                                    className="flex flex-1 items-center justify-center gap-2 border border-mf-border bg-mf-bg-panel py-3 font-mono text-sm text-mf-ink transition-colors hover:border-mf-ink"
                                >
                                    Upload another
                                </button>
                            </div>

                            <AnimatePresence initial={false}>
                                {showQR && (
                                    <motion.div
                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                                        transition={shellTransition}
                                        className="border border-mf-border bg-mf-bg-panel p-5"
                                    >
                                        <QRCode url={shareUrl} />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <TrustStrip icon="key" text="Zero-knowledge: the decryption key remains inside the shared URL." />
                        </MfCornerCard>
                    )}
                </motion.div>

                {!uploading && !shareUrl ? <HowItWorks /> : null}
            </main>

            <MfFooter />

            {showPreview && selectedFile && !isCollection ? (
                <FilePreviewModal file={selectedFile} onClose={() => setShowPreview(false)} />
            ) : null}
        </div>
    )
}
