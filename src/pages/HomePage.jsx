import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import DragDropZone from '../components/FileUpload/DragDropZone'
import UploadProgress from '../components/FileUpload/UploadProgress'
import ExpirySelector, { EXPIRY_OPTIONS } from '../components/FileUpload/ExpirySelector'
import FilePreviewModal from '../components/FileUpload/FilePreviewModal'
import QRCode from '../components/SharePage/QRCode'
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
                <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
                <div>
                    <p className="text-sm font-medium text-white">{title}</p>
                    {description ? <p className="text-xs text-on-surface-variant">{description}</p> : null}
                </div>
            </div>
            {trailing}
        </div>
    )
}

function SummaryItem({ label, value, accent = 'text-white' }) {
    return (
        <div className="rounded-2xl border border-outline-variant bg-surface-container-high px-4 py-3 text-left">
            <p className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{label}</p>
            <p className={`mt-2 text-sm font-medium ${accent}`}>{value}</p>
        </div>
    )
}

function TrustStrip({ icon, text, accent = 'text-primary' }) {
    return (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-high/70 px-4 py-3 text-xs text-on-surface-variant">
            <span className={`material-symbols-outlined text-[16px] ${accent}`}>{icon}</span>
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
                        setUploadProgress(progress * 0.95)
                        setUploadStatus(statusText)
                        setUploadStage(stage === 'manifest' ? 'saving' : getStageFromStatus(statusText))
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
                    expiresAt: new Date().toISOString(), // placeholder, overwritten below
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
                    expiresAt: new Date().toISOString(), // placeholder, overwritten below
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

    return (
        <div className="min-h-screen bg-surface relative overflow-hidden">
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

            <div className="ambient-glow" />

            <header className="relative z-20 flex items-center gap-3 px-4 py-4 md:px-6">
                <span className="material-symbols-outlined text-primary text-3xl icon-filled">shield_lock</span>
                <span className="text-xl font-normal tracking-tight text-white">MaskedFile</span>
            </header>

            <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-2 md:pt-4 pb-8">
                <div className="text-center mb-6 md:mb-8">
                    <h1 className="text-2xl sm:text-3xl font-normal text-white mb-1">Masked Transfer</h1>
                    <p className="text-on-surface-variant text-sm">Client-side encrypted. Zero-knowledge.</p>
                </div>

                <motion.div
                    layout
                    transition={shellTransition}
                    className={`w-full ${selectedEntries.length > 0 || uploading || shareUrl ? 'max-w-[560px]' : 'max-w-[420px]'}`}
                >
                    {!uploading && !shareUrl && (
                        <motion.div
                            layout
                            transition={shellTransition}
                            className="glass-card card-hover overflow-hidden px-4 py-5 sm:px-6 sm:py-6"
                        >
                            <AnimatePresence initial={false} mode="wait">
                                {selectedEntries.length === 0 ? (
                                    <motion.div
                                        key="dropzone"
                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                                        transition={shellTransition}
                                        className="space-y-4"
                                    >
                                        <DragDropZone onFileSelect={handleFileSelect} />
                                        <TrustStrip icon="lock" text="Files are encrypted in your browser before upload." />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="composer"
                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                                        transition={shellTransition}
                                        className="space-y-5"
                                    >
                                        <motion.div
                                            layout
                                            transition={shellTransition}
                                            className="rounded-[28px] border border-outline-variant bg-surface-container-high px-4 py-4"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-primary-container text-primary-200">
                                                    <span className="material-symbols-outlined text-[24px] icon-filled">description</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-base font-medium text-white">{selectionTitle}</p>
                                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                                                                {selectionChips.map((chip) => (
                                                                    <span key={chip} className="rounded-full border border-outline px-2.5 py-1">{chip}</span>
                                                                ))}
                                                            </div>
                                                            {isCollection ? (
                                                                <div className="mt-3 space-y-1 text-xs text-on-surface-variant">
                                                                    {selectedEntries.slice(0, 3).map((entry) => (
                                                                        <p key={entry.relativePath} className="truncate">
                                                                            {entry.relativePath}
                                                                        </p>
                                                                    ))}
                                                                    {selectedEntries.length > 3 ? (
                                                                        <p className="text-primary-200">and {selectedEntries.length - 3} more…</p>
                                                                    ) : null}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={clearSelectedFile}
                                                            className="inline-flex items-center justify-center rounded-full px-2 py-1 text-sm text-on-surface-variant hover:bg-white/5 hover:text-white transition-colors"
                                                        >
                                                            Change
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>

                                        <motion.div layout transition={shellTransition} className="space-y-5">
                                            <div className="space-y-3">
                                                <SurfaceLabel
                                                    icon="schedule"
                                                    title="Expires after"
                                                    description="Choose when this secure link should expire."
                                                />
                                                <ExpirySelector selected={selectedExpiry} onChange={setSelectedExpiry} />
                                            </div>
                                            <motion.div
                                                layout
                                                transition={shellTransition}
                                                className="rounded-[28px] border border-outline-variant bg-surface-container-high overflow-hidden"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAdvancedProtection(value => !value)}
                                                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-white/[0.03] transition-colors"
                                                >
                                                    <SurfaceLabel
                                                        icon="tune"
                                                        title="Advanced protection"
                                                        description="Optional download limits, password, and preview."
                                                        trailing={
                                                            <span className="rounded-full border border-outline px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-on-surface-variant">
                                                                Optional
                                                            </span>
                                                        }
                                                    />
                                                    <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${showAdvancedProtection ? 'rotate-180' : ''}`}>
                                                        expand_more
                                                    </span>
                                                </button>

                                                <AnimatePresence initial={false}>
                                                    {showAdvancedProtection && (
                                                        <motion.div
                                                            key="advanced-protection"
                                                            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                                                            transition={shellTransition}
                                                            className="overflow-hidden border-t border-outline-variant/80"
                                                        >
                                                            <div className="space-y-4 px-4 py-4">
                                                                <div className="rounded-2xl border border-outline-variant bg-surface px-4 py-3">
                                                                    <label className="block text-xs uppercase tracking-wide text-on-surface-variant mb-2">
                                                                        Download limit
                                                                    </label>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        step="1"
                                                                        inputMode="numeric"
                                                                        value={maxDownloadsInput}
                                                                        onChange={(event) => setMaxDownloadsInput(event.target.value)}
                                                                        placeholder="Unlimited"
                                                                        className="w-full bg-transparent text-white placeholder:text-on-surface-variant/60 outline-none text-sm"
                                                                    />
                                                                    <p className="mt-2 text-[11px] text-on-surface-variant">
                                                                        Each authorized download consumes one remaining view.
                                                                    </p>
                                                                </div>

                                                                <div className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 space-y-3">
                                                                    <div>
                                                                        <label className="block text-xs uppercase tracking-wide text-on-surface-variant mb-2">
                                                                            Password
                                                                        </label>
                                                                        <input
                                                                            type="password"
                                                                            autoComplete="new-password"
                                                                            value={passwordInput}
                                                                            onChange={(event) => setPasswordInput(event.target.value)}
                                                                            placeholder="Leave blank for no password"
                                                                            className="w-full bg-transparent text-white placeholder:text-on-surface-variant/60 outline-none text-sm"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs uppercase tracking-wide text-on-surface-variant mb-2">
                                                                            Confirm password
                                                                        </label>
                                                                        <input
                                                                            type="password"
                                                                            autoComplete="new-password"
                                                                            value={confirmPasswordInput}
                                                                            onChange={(event) => setConfirmPasswordInput(event.target.value)}
                                                                            placeholder="Repeat password"
                                                                            className="w-full bg-transparent text-white placeholder:text-on-surface-variant/60 outline-none text-sm"
                                                                        />
                                                                    </div>
                                                                    <p className="text-[11px] text-on-surface-variant">
                                                                        Adds a server-side gate before anyone can fetch the encrypted file.
                                                                    </p>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowPreview(true)}
                                                                    disabled={isCollection}
                                                                    className="w-full h-10 rounded-full border border-outline text-on-surface-variant text-sm font-medium hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                                                                >
                                                                    <span className="material-symbols-outlined text-lg">visibility</span>
                                                                    {isCollection ? 'Preview unavailable for collections' : 'Preview before sending'}
                                                                </button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>

                                            <button
                                                type="button"
                                                onClick={handleUpload}
                                                className="w-full h-12 rounded-full font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-primary text-black hover:shadow-purple-glow-button hover:bg-primary-400"
                                            >
                                                <span className="material-symbols-outlined icon-filled">rocket_launch</span>
                                                Secure &amp; Send
                                            </button>

                                            <TrustStrip icon="verified_user" text="Encrypted in your browser before anything leaves your device." />
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}

                    {uploading && (
                        <motion.div
                            layout
                            transition={shellTransition}
                            className="glass-card px-4 py-5 sm:px-6 sm:py-6"
                        >
                            <UploadProgress
                                progress={uploadProgress}
                                fileName={uploadDisplayName || selectionTitle}
                                fileMeta={uploadDisplayMeta}
                                status={uploadStatus}
                                stage={uploadStage}
                                contextLabel={uploadContextLabel}
                            />
                        </motion.div>
                    )}
                    {shareUrl && (
                        <motion.div
                            layout
                            transition={shellTransition}
                            className="glass-card card-hover px-4 py-5 sm:px-6 sm:py-6 space-y-5"
                        >
                            <div className="text-center space-y-3">
                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-primary">
                                    <span className="material-symbols-outlined text-3xl icon-filled">check_circle</span>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-medium text-white">Secure share ready</h2>
                                    <p className="mt-1 text-sm text-on-surface-variant">
                                        Copy the link below. Recipients decrypt the file directly in their browser.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-[24px] border border-outline-variant bg-surface-container-high px-4 py-4">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-on-surface-variant mb-2">Share link</p>
                                <p className="break-all font-mono text-sm text-white/90">{shareUrl}</p>
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
                                    accent={shareSummary?.passwordProtected ? 'text-primary-200' : 'text-white'}
                                />
                                <SummaryItem
                                    label="Recipient view"
                                    value={shareSummary?.shareKind === 'multi' ? 'Collection list' : 'Single secure file'}
                                />
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button onClick={handleCopy} className="btn-primary flex-1 flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg">{copied ? 'check' : 'content_copy'}</span>
                                    {copied ? 'Copied!' : 'Copy Link'}
                                </button>

                                <button
                                    onClick={() => setShowQR(value => !value)}
                                    className="btn-secondary flex-1 flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-lg">qr_code_2</span>
                                    {showQR ? 'Hide QR' : 'Show QR'}
                                </button>

                                <button onClick={handleUploadAnother} className="btn-secondary flex-1">
                                    Upload Another
                                </button>
                            </div>

                            <AnimatePresence initial={false}>
                                {showQR && (
                                    <motion.div
                                        initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                                        transition={shellTransition}
                                        className="rounded-[24px] border border-outline-variant bg-surface-container-high p-5"
                                    >
                                        <QRCode url={shareUrl} />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <TrustStrip icon="key" text="Zero-knowledge: the decryption key remains inside the shared URL." />
                        </motion.div>
                    )}
                </motion.div>
            </main>

            <div className="fixed right-4 bottom-4 z-30 flex items-center gap-2 bg-surface/50 backdrop-blur-md px-3 py-2 rounded-full border border-outline-variant/30">
                <a
                    href="https://github.com/Basit-Ali0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-on-surface-variant hover:text-white transition-colors hover:scale-110"
                    title="GitHub"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                    </svg>
                </a>
                <div className="w-px h-3 bg-outline-variant/50 mx-1" />
                <a
                    href="https://x.com/BasitAli"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-on-surface-variant hover:text-white transition-colors hover:scale-110"
                    title="X (Twitter)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                </a>
            </div>

            <footer className="relative z-10 w-full text-center pb-4 text-[11px] text-on-surface-variant/50 flex items-center justify-center gap-1.5">
                <span>Made with</span>
                <span className="text-red-500">&hearts;</span>
                <span>by Basit</span>
            </footer>

            {showPreview && selectedFile && !isCollection ? (
                <FilePreviewModal file={selectedFile} onClose={() => setShowPreview(false)} />
            ) : null}
        </div>
    )
}
