import { useState } from 'react'
import DragDropZone from '../components/FileUpload/DragDropZone'
import UploadProgress from '../components/FileUpload/UploadProgress'
import ExpirySelector, { EXPIRY_OPTIONS } from '../components/FileUpload/ExpirySelector'
import FilePreviewModal from '../components/FileUpload/FilePreviewModal'
import QRCode from '../components/SharePage/QRCode'
import { encryptFileStreaming, terminateWorkerPool } from '../utils/streamingEncryption'
import { uploadToR2 } from '../utils/r2Upload'
import { formatFileSize } from '../utils/fileUtils'

export default function HomePage() {
    const [selectedFile, setSelectedFile] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadStatus, setUploadStatus] = useState('')
    const [uploadStage, setUploadStage] = useState('')
    const [shareUrl, setShareUrl] = useState(null)
    const [copied, setCopied] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    const [showQR, setShowQR] = useState(false)
    const [selectedExpiry, setSelectedExpiry] = useState(EXPIRY_OPTIONS[2])

    const handleFileSelect = (file) => {
        setSelectedFile(file)
        setShareUrl(null)
        setCopied(false)
    }

    const handleUpload = async () => {
        if (!selectedFile) return

        try {
            setUploading(true)
            setUploadProgress(0)
            setUploadStage('preparing')

            const fileId = crypto.randomUUID()

            setUploadStatus('Encrypting file in your browser...')
            setUploadStage('encrypting')

            const encryptionResult = await encryptFileStreaming(
                selectedFile,
                (progress, stage, completed, total) => {
                    setUploadProgress(progress * 0.5)
                    setUploadStatus(`Encrypting: chunk ${completed}/${total}`)
                }
            )

            setUploadStatus('Uploading encrypted file...')
            setUploadStage('uploading')

            const uploadResult = await uploadToR2(
                encryptionResult.encryptedChunks,
                encryptionResult.authTags,
                fileId,
                (progress, stage) => {
                    setUploadProgress(50 + progress * 0.45)
                    if (stage === 'initiating') {
                        setUploadStatus('Starting upload...')
                    } else if (stage === 'uploading') {
                        setUploadStatus('Uploading encrypted chunks...')
                    } else if (stage === 'finalizing') {
                        setUploadStatus('Finalizing upload...')
                    }
                }
            )

            setUploadStatus('Saving metadata...')
            setUploadProgress(95)

            const expiresAt = new Date()
            if (selectedExpiry.unit === 'hours') {
                expiresAt.setHours(expiresAt.getHours() + selectedExpiry.value)
            } else {
                expiresAt.setDate(expiresAt.getDate() + selectedExpiry.value)
            }

            await fetch('/api/files/metadata', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileId,
                    originalName: selectedFile.name,
                    fileType: selectedFile.type,
                    fileSize: selectedFile.size,
                    storagePath: uploadResult.objectKey,
                    storageBackend: 'r2',
                    chunkCount: uploadResult.totalChunks,
                    chunkSizes: uploadResult.chunkSizes || null,
                    expiresAt: expiresAt.toISOString()
                })
            })

            setUploadStatus('Complete!')
            setUploadProgress(100)

            const baseUrl = window.location.origin
            const url = `${baseUrl}/share/${fileId}#key=${encryptionResult.keyHex}&iv=${encryptionResult.ivHex}`
            setShareUrl(url)

        } catch (error) {
            console.error('Upload error:', error)
            alert(`Upload failed: ${error.message}`)
        } finally {
            setUploading(false)
            terminateWorkerPool()
        }
    }

    const handleCopy = async () => {
        if (shareUrl) {
            await navigator.clipboard.writeText(shareUrl)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <div className="min-h-screen bg-surface relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="ambient-glow" />

            {/* Header */}
            <header className="relative z-20 flex items-center gap-3 px-4 py-4 md:px-6">
                <span className="material-symbols-outlined text-primary text-3xl icon-filled">shield_lock</span>
                <span className="text-xl font-normal tracking-tight text-white">MaskedFile</span>
            </header>

            {/* Main Content */}
            <main className="relative z-10 flex flex-col items-center justify-center px-4 py-8 md:py-12">
                {/* Hero Text */}
                <div className="text-center mb-6 md:mb-8">
                    <h1 className="text-2xl sm:text-3xl font-normal text-white mb-1">Masked Transfer</h1>
                    <p className="text-on-surface-variant text-sm">Server-side encrypted. Zero-knowledge.</p>
                </div>

                {/* Main Card */}
                <div className="w-full max-w-[900px]">
                    {!uploading && !shareUrl && (
                        <div className="glass-card p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 lg:gap-12 items-start card-hover">
                            {/* Left: Upload Zone */}
                            <div className="flex flex-col gap-4">
                                <DragDropZone onFileSelect={handleFileSelect} selectedFile={selectedFile} />

                                {/* Selected File Preview */}
                                {selectedFile && (
                                    <div className="bg-surface-container-high rounded-xl p-3 flex items-center gap-3 border border-outline-variant">
                                        <div className="w-10 h-10 rounded-full bg-primary-container text-primary-200 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-xl icon-filled">description</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium text-white truncate block">{selectedFile.name}</span>
                                            <span className="text-xs text-on-surface-variant">{formatFileSize(selectedFile.size)}</span>
                                        </div>
                                        <button
                                            onClick={() => setSelectedFile(null)}
                                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-on-surface-variant shrink-0"
                                        >
                                            <span className="material-symbols-outlined text-xl">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Right: Security Options */}
                            <div className="flex flex-col gap-6 h-full justify-between">
                                <div className="space-y-6">
                                    {/* Section Header */}
                                    <div className="flex items-center gap-2 text-white pb-2 border-b border-outline-variant">
                                        <span className="material-symbols-outlined text-primary">tune</span>
                                        <h3 className="text-base font-medium">Security Options</h3>
                                    </div>

                                    {/* Expiry Selector */}
                                    <ExpirySelector selected={selectedExpiry} onChange={setSelectedExpiry} />

                                    {/* Preview Button */}
                                    {selectedFile && (
                                        <button
                                            onClick={() => setShowPreview(true)}
                                            className="w-full h-10 rounded-full border border-outline text-on-surface-variant text-sm font-medium hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-lg">visibility</span>
                                            Preview File
                                        </button>
                                    )}
                                </div>

                                {/* Upload Button */}
                                <div className="pt-4 space-y-4">
                                    <button
                                        onClick={handleUpload}
                                        disabled={!selectedFile}
                                        className={`w-full h-12 rounded-full font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${selectedFile
                                            ? 'bg-primary text-black hover:shadow-purple-glow-button hover:bg-primary-400'
                                            : 'bg-surface-variant text-on-surface-variant cursor-not-allowed'
                                            }`}
                                    >
                                        <span className="material-symbols-outlined icon-filled">rocket_launch</span>
                                        Secure & Send
                                    </button>
                                    <div className="flex items-center justify-center gap-1.5 text-primary text-[11px] font-medium opacity-80">
                                        <span className="material-symbols-outlined text-[14px] icon-filled">lock</span>
                                        <span>Files encrypted before leaving device</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Uploading State */}
                    {uploading && (
                        <div className="glass-card p-6 md:p-8">
                            <UploadProgress
                                progress={uploadProgress}
                                fileName={selectedFile?.name}
                                status={uploadStatus}
                                encryptionNote={uploadStage === 'encrypting'}
                            />
                        </div>
                    )}

                    {/* Success State */}
                    {shareUrl && (
                        <div className="glass-card p-6 md:p-8 text-center card-hover">
                            <div className="w-16 h-16 bg-primary-container rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-3xl text-primary icon-filled">check_circle</span>
                            </div>

                            <h3 className="text-xl font-medium text-white mb-2">File Uploaded Successfully!</h3>
                            <p className="text-on-surface-variant text-sm mb-6">Share this link to let others download your file</p>

                            <div className="bg-surface-container-high rounded-lg p-4 mb-6 break-all text-sm font-mono text-on-surface-variant border border-outline-variant">
                                {shareUrl}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
                                <button onClick={handleCopy} className="btn-primary flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg">{copied ? 'check' : 'content_copy'}</span>
                                    {copied ? 'Copied!' : 'Copy Link'}
                                </button>

                                <button
                                    onClick={() => setShowQR(!showQR)}
                                    className="btn-secondary flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-lg">qr_code_2</span>
                                    {showQR ? 'Hide QR' : 'Show QR'}
                                </button>

                                <button
                                    onClick={() => {
                                        setShareUrl(null)
                                        setSelectedFile(null)
                                        setShowQR(false)
                                    }}
                                    className="btn-secondary"
                                >
                                    Upload Another
                                </button>
                            </div>

                            {showQR && (
                                <div className="mt-6">
                                    <QRCode url={shareUrl} />
                                </div>
                            )}

                            <div className="mt-4 text-[11px] text-on-surface-variant flex items-center justify-center gap-1">
                                <span className="material-symbols-outlined text-[14px] icon-filled">verified_user</span>
                                Zero-Knowledge: Encryption keys are only in the URL
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Links */}
                <div className="mt-8 flex gap-2 text-xs text-on-surface-variant font-medium items-center">
                    <span>Made with</span>
                    <span className="text-red-500 text-sm">❤️</span>
                    <span>by Basit</span>
                </div>
            </main>

            {/* File Preview Modal */}
            {showPreview && (
                <FilePreviewModal file={selectedFile} onClose={() => setShowPreview(false)} />
            )}
        </div>
    )
}
