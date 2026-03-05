import { useState } from 'react'
import DragDropZone from '../components/FileUpload/DragDropZone'
import UploadProgress from '../components/FileUpload/UploadProgress'
import ExpirySelector, { EXPIRY_OPTIONS } from '../components/FileUpload/ExpirySelector'
import FilePreviewModal from '../components/FileUpload/FilePreviewModal'
import QRCode from '../components/SharePage/QRCode'
import { encryptAndUploadStreaming, terminateWorkerPool } from '../utils/streamingEncryption'
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

            setUploadStatus('Encrypting & uploading...')
            setUploadStage('uploading')

            const uploadResult = await encryptAndUploadStreaming(
                selectedFile,
                fileId,
                (progress, statusText) => {
                    setUploadProgress(progress * 0.95) // Reserve 5% for metadata save
                    setUploadStatus(statusText)
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

            const metadataResponse = await fetch('/api/files/metadata', {
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

            if (!metadataResponse.ok) {
                const errData = await metadataResponse.json().catch(() => ({}))
                throw new Error(errData.message || 'Failed to save file metadata')
            }

            setUploadStatus('Complete!')
            setUploadProgress(100)

            const baseUrl = window.location.origin
            const url = `${baseUrl}/share/${fileId}#key=${uploadResult.keyHex}&iv=${uploadResult.ivHex}`
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
            try {
                await navigator.clipboard.writeText(shareUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
            } catch {
                // Clipboard API may fail in insecure context or denied permissions
                prompt('Copy this link:', shareUrl)
            }
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
            <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-2 md:pt-4 pb-8">
                {/* Hero Text */}
                <div className="text-center mb-6 md:mb-8">
                    <h1 className="text-2xl sm:text-3xl font-normal text-white mb-1">Masked Transfer</h1>
                    <p className="text-on-surface-variant text-sm">Client-side encrypted. Zero-knowledge.</p>
                </div>

                {/* Main Card */}
                <div className={`w-full transition-all duration-500 ${selectedFile ? 'max-w-[760px]' : 'max-w-sm'}`}>
                    {!uploading && !shareUrl && (
                        <div className={`glass-card p-4 sm:p-6 grid grid-cols-1 ${selectedFile ? 'md:grid-cols-2' : ''} gap-6 md:gap-8 items-start card-hover transition-all duration-500`}>
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
                            {selectedFile && (
                                <div className="flex flex-col gap-6 h-full justify-between fade-in-up">
                                    <div className="space-y-6">
                                        {/* Section Header */}
                                        <div className="flex items-center gap-2 text-white pb-2 border-b border-outline-variant">
                                            <span className="material-symbols-outlined text-primary">tune</span>
                                            <h3 className="text-base font-medium">Security Options</h3>
                                        </div>

                                        {/* Expiry Selector */}
                                        <ExpirySelector selected={selectedExpiry} onChange={setSelectedExpiry} />

                                        {/* Preview Button */}
                                        <button
                                            onClick={() => setShowPreview(true)}
                                            className="w-full h-10 rounded-full border border-outline text-on-surface-variant text-sm font-medium hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-lg">visibility</span>
                                            Preview File
                                        </button>
                                    </div>

                                    {/* Upload Button */}
                                    <div className="pt-4 space-y-4">
                                        <button
                                            onClick={handleUpload}
                                            className="w-full h-12 rounded-full font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-primary text-black hover:shadow-purple-glow-button hover:bg-primary-400"
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
                            )}
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
                <div className="mt-8 flex items-center justify-between w-full max-w-sm text-xs text-on-surface-variant font-medium">
                    <div className="flex gap-2 items-center">
                        <span>Made with</span>
                        <span className="text-red-500 text-sm">❤️</span>
                        <span>by Basit</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <a
                            href="https://github.com/Basit-Ali0"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-on-surface-variant hover:text-white transition-colors"
                            title="GitHub"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                            </svg>
                        </a>
                        <a
                            href="https://x.com/BasitAli"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-on-surface-variant hover:text-white transition-colors"
                            title="X (Twitter)"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                            </svg>
                        </a>
                    </div>
                </div>
            </main>

            {/* Fixed Social Links - Right Edge, Stacked Vertically */}
            <div className="fixed right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-4">
                <a
                    href="https://github.com/Basit-Ali0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                    title="GitHub"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                    </svg>
                </a>
                <div className="w-px h-6 bg-outline-variant/50" />
                <a
                    href="https://x.com/BasitAli"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-on-surface-variant hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                    title="X (Twitter)"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                </a>
            </div>

            {/* Page Footer */}
            <footer className="relative z-10 w-full text-center pb-4 text-[11px] text-on-surface-variant/50 flex items-center justify-center gap-1.5">
                <span>Made with</span>
                <span className="text-red-500">❤️</span>
                <span>by Basit</span>
            </footer>
            {showPreview && (
                <FilePreviewModal file={selectedFile} onClose={() => setShowPreview(false)} />
            )}
        </div>
    )
}
