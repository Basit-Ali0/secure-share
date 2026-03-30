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
import {
    fadeUpProps,
    getNestedStaggerGrid,
    getStaggerContainer,
    getStaggerItem,
    popInProps,
    tapProps,
    transitionSec,
} from '../lib/motionPresets.js'

function MfToggle({ on, onToggle, disabled = false, ariaLabel }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={onToggle}
            className={`relative h-[21px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-mf-accent' : 'bg-mf-border'}`}
        >
            <span
                className={`absolute left-[3px] top-[3px] h-[15px] w-[15px] rounded-full bg-mf-card shadow-sm transition-transform ${on ? 'translate-x-[17px]' : ''}`}
            />
        </button>
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

function HowItWorks({ reducedMotion }) {
    const container = getStaggerContainer(reducedMotion, 0.12, 0.06)
    const item = getStaggerItem(reducedMotion, 14)
    const gridStagger = getNestedStaggerGrid(reducedMotion, 0.09)
    const steps = [
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
    ]

    return (
        <motion.section className="mt-16" {...container}>
            <motion.div
                className="mb-9 flex items-center gap-3.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mf-ink-muted"
                variants={item.variants}
            >
                <span>How it works</span>
                <span className="h-px flex-1 bg-mf-border" />
            </motion.div>
            <motion.div
                className="grid grid-cols-1 gap-px bg-mf-border md:grid-cols-3"
                variants={gridStagger.variants}
            >
                {steps.map((step) => (
                    <motion.div key={step.n} className="bg-mf-bg px-6 py-7 md:py-9" variants={item.variants}>
                        <div className="mb-3.5 text-[42px] font-extrabold leading-none tracking-tight text-mf-border">{step.n}</div>
                        <h3 className="mb-2 text-sm font-bold tracking-tight text-mf-ink">{step.t}</h3>
                        <p className="font-mono text-[10.5px] leading-relaxed tracking-wide text-mf-ink-muted">{step.d}</p>
                    </motion.div>
                ))}
            </motion.div>
        </motion.section>
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
    const [passwordProtectOn, setPasswordProtectOn] = useState(false)
    const [selectedExpiry, setSelectedExpiry] = useState(EXPIRY_OPTIONS[2])
    const [maxDownloadsInput, setMaxDownloadsInput] = useState('')
    const [passwordInput, setPasswordInput] = useState('')
    const [confirmPasswordInput, setConfirmPasswordInput] = useState('')

    const resetUploadSettings = () => {
        setSelectedExpiry(EXPIRY_OPTIONS[2])
        setMaxDownloadsInput('')
        setPasswordInput('')
        setConfirmPasswordInput('')
        setPasswordProtectOn(false)
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
        setPasswordProtectOn(false)
        setPasswordInput('')
        setConfirmPasswordInput('')
    }

    const clearSelectedFile = () => {
        setSelectedEntries([])
        setPasswordProtectOn(false)
        setShowPreview(false)
        setPasswordInput('')
        setConfirmPasswordInput('')
    }

    const removeSelectedEntryAt = (index) => {
        setSelectedEntries((prev) => prev.filter((_, i) => i !== index))
        setShareUrl(null)
        setCopied(false)
        setShowQR(false)
        setPasswordInput('')
        setConfirmPasswordInput('')
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

    function parsePositiveDownloadCount(value) {
        if (value == null || String(value).trim() === '') return 0
        const n = parseInt(String(value).trim(), 10)
        return Number.isFinite(n) && n > 0 ? n : 0
    }

    const downloadStepperValue = parsePositiveDownloadCount(maxDownloadsInput)

    function handlePasswordProtectToggle() {
        setPasswordProtectOn((prev) => {
            if (prev) {
                setPasswordInput('')
                setConfirmPasswordInput('')
            }
            return !prev
        })
    }

    function adjustDownloadLimit(delta) {
        const cur = parsePositiveDownloadCount(maxDownloadsInput)
        if (delta < 0) {
            if (cur <= 1) setMaxDownloadsInput('')
            else setMaxDownloadsInput(String(cur - 1))
        } else if (cur === 0) {
            setMaxDownloadsInput('1')
        } else {
            setMaxDownloadsInput(String(Math.min(cur + 1, 99)))
        }
    }

    const handleUpload = async () => {
        if (selectedEntries.length === 0) return

        try {
            const trimmedMaxDownloads = maxDownloadsInput.trim()
            const hasDownloadLimit = trimmedMaxDownloads.length > 0
            const maxDownloads = hasDownloadLimit ? Number(trimmedMaxDownloads) : null
            const normalizedPassword = passwordProtectOn ? passwordInput.trim() : ''
            const normalizedConfirmPassword = passwordProtectOn ? confirmPasswordInput.trim() : ''

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
                <motion.div className="mb-10 text-center md:mb-14" {...getStaggerContainer(prefersReducedMotion, 0.09, 0.04)}>
                    <motion.div
                        className="mb-5 inline-flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-mf-ink-muted"
                        variants={getStaggerItem(prefersReducedMotion, 10).variants}
                    >
                        <span className="h-px w-[22px] bg-mf-accent" />
                        Secure File Transfer
                        <span className="h-px w-[22px] bg-mf-accent" />
                    </motion.div>
                    <motion.h1
                        className="mb-4 text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold leading-[1.02] tracking-tight"
                        variants={getStaggerItem(prefersReducedMotion, 18).variants}
                    >
                        Masked
                        <br />
                        <span className="text-mf-accent">Transfer.</span>
                    </motion.h1>
                    <motion.p
                        className="mx-auto mb-7 max-w-md font-mono text-xs leading-relaxed tracking-wide text-mf-ink-muted"
                        variants={getStaggerItem(prefersReducedMotion, 12).variants}
                    >
                        Client-side encrypted. Zero-knowledge architecture.
                        <br />
                        Your files never touch our servers in plaintext.
                    </motion.p>
                    <motion.div
                        className="inline-flex flex-wrap items-center justify-center gap-2.5 border border-mf-border bg-mf-card px-4 py-2.5 font-mono text-[10px] tracking-wide text-mf-ink"
                        variants={getStaggerItem(prefersReducedMotion, 10).variants}
                    >
                        <span className="relative flex h-2 w-2 shrink-0 rounded-full bg-mf-success">
                            <span className="absolute inset-0 animate-ping rounded-full bg-mf-success/40" />
                        </span>
                        <span>AES-256 ACTIVE</span>
                        <span className="h-3 w-px bg-mf-border" />
                        <span>END-TO-END</span>
                        <span className="h-3 w-px bg-mf-border" />
                        <span>ZERO-KNOWLEDGE</span>
                    </motion.div>
                </motion.div>

                <motion.div
                    layout
                    transition={shellTransition}
                    className="w-full"
                >
                    {!uploading && !shareUrl && (
                        <motion.div {...fadeUpProps(prefersReducedMotion, 14, 0.18)}>
                            <MfCornerCard className="overflow-hidden">
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
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={clearSelectedFile}
                                                className="shrink-0 font-mono text-xs text-mf-ink-muted transition-colors hover:text-mf-danger"
                                                aria-label={isCollection ? 'Remove all files' : 'Remove file'}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                                                    <line x1="18" y1="6" x2="6" y2="18" />
                                                    <line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                            </button>
                                        </div>

                                        {isCollection ? (
                                            <div className="border-b border-mf-border bg-mf-bg-panel px-4 py-4 sm:px-5">
                                                <div className="mb-3 flex items-center justify-between gap-2">
                                                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-mf-ink-muted">
                                                        Files in this transfer
                                                    </p>
                                                    <span className="font-mono text-[10px] text-mf-ink-muted">
                                                        {selectedEntries.length} total
                                                    </span>
                                                </div>
                                                <ul className="max-h-[min(280px,45vh)] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                                                    {selectedEntries.map((entry, index) => {
                                                        const showPath =
                                                            entry.relativePath && entry.relativePath !== entry.file.name
                                                        return (
                                                            <li
                                                                key={`${entry.relativePath}-${entry.file.name}-${entry.file.size}-${index}`}
                                                                className="flex items-start gap-3 border border-mf-border bg-mf-card px-3 py-3"
                                                            >
                                                                <span
                                                                    className="material-symbols-outlined mt-0.5 shrink-0 text-[20px] text-mf-accent/90"
                                                                    aria-hidden
                                                                >
                                                                    description
                                                                </span>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                                                        <p
                                                                            className="min-w-0 max-w-full break-words text-sm font-semibold leading-snug text-mf-ink sm:break-normal"
                                                                            title={entry.file.name}
                                                                        >
                                                                            {entry.file.name}
                                                                        </p>
                                                                        <span className="shrink-0 font-mono text-[10px] text-mf-ink-muted">
                                                                            {formatFileSize(entry.file.size)}
                                                                        </span>
                                                                    </div>
                                                                    {showPath ? (
                                                                        <p
                                                                            className="mt-1 break-all font-mono text-[10px] leading-relaxed text-mf-ink-muted sm:break-words"
                                                                            title={entry.relativePath}
                                                                        >
                                                                            {entry.relativePath}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeSelectedEntryAt(index)}
                                                                    className="shrink-0 rounded border border-transparent p-1 font-mono text-mf-ink-muted transition-colors hover:border-mf-border hover:text-mf-danger"
                                                                    aria-label={`Remove ${entry.file.name} from selection`}
                                                                >
                                                                    <svg
                                                                        width="14"
                                                                        height="14"
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        strokeWidth="2.2"
                                                                        strokeLinecap="round"
                                                                        aria-hidden
                                                                    >
                                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                                    </svg>
                                                                </button>
                                                            </li>
                                                        )
                                                    })}
                                                </ul>
                                            </div>
                                        ) : null}

                                        <div className="grid grid-cols-1 gap-px border-b border-mf-border bg-mf-border md:grid-cols-2">
                                            <div className="flex items-center justify-between gap-3 bg-mf-card px-4 py-4">
                                                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mf-ink-muted">Password protect</span>
                                                <MfToggle
                                                    on={passwordProtectOn}
                                                    onToggle={handlePasswordProtectToggle}
                                                    ariaLabel="Password protect"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-3 bg-mf-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-mf-ink-muted">Expires after</span>
                                                <ExpirySelector selected={selectedExpiry} onChange={setSelectedExpiry} />
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-3 bg-mf-card px-4 py-4 md:col-span-2">
                                                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-mf-ink-muted">Max downloads</span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => adjustDownloadLimit(-1)}
                                                        className="flex h-[22px] w-[22px] items-center justify-center border border-mf-border bg-mf-card font-mono text-sm text-mf-ink-muted transition-colors hover:border-mf-ink hover:text-mf-ink"
                                                        aria-label="Decrease download limit"
                                                    >
                                                        −
                                                    </button>
                                                    <span className="min-w-[1.25rem] text-center font-mono text-[13px] font-medium text-mf-ink">
                                                        {downloadStepperValue === 0 ? '—' : String(downloadStepperValue)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => adjustDownloadLimit(1)}
                                                        className="flex h-[22px] w-[22px] items-center justify-center border border-mf-border bg-mf-card font-mono text-sm text-mf-ink-muted transition-colors hover:border-mf-ink hover:text-mf-ink"
                                                        aria-label="Increase download limit"
                                                    >
                                                        +
                                                    </button>
                                                    <label className="sr-only" htmlFor="download-limit-input">
                                                        Download limit
                                                    </label>
                                                    <input
                                                        id="download-limit-input"
                                                        data-testid="download-limit-input"
                                                        type="text"
                                                        inputMode="numeric"
                                                        placeholder="Unlimited"
                                                        value={maxDownloadsInput}
                                                        onChange={(event) => setMaxDownloadsInput(event.target.value)}
                                                        className="sr-only"
                                                        tabIndex={-1}
                                                    />
                                                </div>
                                            </div>
                                            <div className="bg-mf-card px-4 py-4 md:col-span-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPreview(true)}
                                                    disabled={isCollection}
                                                    className="flex h-10 w-full items-center justify-center gap-2 border border-mf-border font-mono text-xs uppercase tracking-wider text-mf-ink-muted transition-colors hover:border-mf-ink hover:text-mf-ink disabled:opacity-50"
                                                >
                                                    <span className="material-symbols-outlined text-lg">visibility</span>
                                                    {isCollection ? 'Preview unavailable for collections' : 'Preview before sending'}
                                                </button>
                                            </div>
                                        </div>

                                        {passwordProtectOn ? (
                                            <div className="space-y-3 border-b border-mf-border bg-mf-bg-panel px-4 py-4 sm:px-5">
                                                <input
                                                    type="password"
                                                    autoComplete="new-password"
                                                    value={passwordInput}
                                                    onChange={(event) => setPasswordInput(event.target.value)}
                                                    placeholder="Leave blank for no password"
                                                    className="w-full border border-mf-border bg-mf-card px-3 py-2.5 font-mono text-sm text-mf-ink outline-none placeholder:text-mf-ink-muted focus:border-mf-accent"
                                                />
                                                <input
                                                    type="password"
                                                    autoComplete="new-password"
                                                    value={confirmPasswordInput}
                                                    onChange={(event) => setConfirmPasswordInput(event.target.value)}
                                                    placeholder="Repeat password"
                                                    className="w-full border border-mf-border bg-mf-card px-3 py-2.5 font-mono text-sm text-mf-ink outline-none placeholder:text-mf-ink-muted focus:border-mf-accent"
                                                />
                                                <p className="font-mono text-[10px] text-mf-ink-muted">
                                                    Server-side gate before anyone can fetch ciphertext. Leave both empty if you disable password protect above.
                                                </p>
                                            </div>
                                        ) : null}

                                        <div className="p-4 sm:p-5">
                                            <motion.button
                                                type="button"
                                                onClick={handleUpload}
                                                className="flex w-full items-center justify-center gap-2 bg-mf-accent py-4 text-sm font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                                                {...tapProps(prefersReducedMotion)}
                                            >
                                                <span className="material-symbols-outlined icon-filled text-lg">rocket_launch</span>
                                                Secure &amp; Send
                                            </motion.button>
                                            <div className="mt-4">
                                                <TrustStrip icon="verified_user" text="Encrypted in your browser before anything leaves your device." />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            </MfCornerCard>
                        </motion.div>
                    )}

                    {uploading && (
                        <motion.div {...fadeUpProps(prefersReducedMotion, 12, 0)}>
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
                        </motion.div>
                    )}

                    <AnimatePresence mode="wait">
                        {shareUrl ? (
                            <motion.div key="share-ready" {...popInProps(prefersReducedMotion)}>
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
                                    <motion.button
                                        type="button"
                                        onClick={handleCopy}
                                        className="shrink-0 bg-mf-accent px-4 py-2 font-mono text-[10px] font-medium uppercase tracking-wider text-white transition-opacity hover:opacity-90"
                                        {...tapProps(prefersReducedMotion)}
                                        animate={copied && !prefersReducedMotion ? { scale: [1, 1.04, 1] } : {}}
                                        transition={{ duration: 0.35 }}
                                    >
                                        {copied ? 'Copied ✓' : 'Copy'}
                                    </motion.button>
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
                                <motion.button
                                    type="button"
                                    onClick={() => setShowQR((v) => !v)}
                                    className="flex flex-1 items-center justify-center gap-2 border border-mf-border bg-mf-bg-panel py-3 font-mono text-sm text-mf-ink transition-colors hover:border-mf-ink"
                                    {...tapProps(prefersReducedMotion)}
                                >
                                    <span className="material-symbols-outlined text-lg">qr_code_2</span>
                                    {showQR ? 'Hide QR' : 'Show QR'}
                                </motion.button>
                                <motion.button
                                    type="button"
                                    onClick={handleUploadAnother}
                                    className="flex flex-1 items-center justify-center gap-2 border border-mf-border bg-mf-bg-panel py-3 font-mono text-sm text-mf-ink transition-colors hover:border-mf-ink"
                                    {...tapProps(prefersReducedMotion)}
                                >
                                    Upload another
                                </motion.button>
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
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </motion.div>

                {!uploading && !shareUrl ? <HowItWorks reducedMotion={prefersReducedMotion} /> : null}
            </main>

            <MfFooter />

            <AnimatePresence>
                {showPreview && selectedFile && !isCollection ? (
                    <FilePreviewModal
                        key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}`}
                        file={selectedFile}
                        onClose={() => setShowPreview(false)}
                    />
                ) : null}
            </AnimatePresence>
        </div>
    )
}
