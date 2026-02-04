import { useState } from 'react'
import DragDropZone from '../components/FileUpload/DragDropZone'
import UploadProgress from '../components/FileUpload/UploadProgress'
import ExpirySelector, { EXPIRY_OPTIONS } from '../components/FileUpload/ExpirySelector'
import FilePreviewModal from '../components/FileUpload/FilePreviewModal'
import QRCode from '../components/SharePage/QRCode'
import { Shield, Lock, Zap, Globe, Check, Copy, Eye, QrCode as QrCodeIcon } from 'lucide-react'
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
    const [selectedExpiry, setSelectedExpiry] = useState(EXPIRY_OPTIONS[2]) // Default 24 hours

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

            // Phase 1: Streaming encryption (0-50%)
            setUploadStatus('Encrypting file in your browser...')
            setUploadStage('encrypting')

            const encryptionResult = await encryptFileStreaming(
                selectedFile,
                (progress, stage, completed, total) => {
                    setUploadProgress(progress * 0.5) // 0-50%
                    setUploadStatus(`Encrypting: chunk ${completed}/${total}`)
                }
            )

            // Phase 2: Upload to R2 (50-95%)
            setUploadStatus('Uploading encrypted file...')
            setUploadStage('uploading')

            const uploadResult = await uploadToR2(
                encryptionResult.encryptedChunks,
                encryptionResult.authTags,
                fileId,
                (progress, stage) => {
                    setUploadProgress(50 + progress * 0.45) // 50-95%
                    if (stage === 'initiating') {
                        setUploadStatus('Starting upload...')
                    } else if (stage === 'uploading') {
                        setUploadStatus('Uploading encrypted chunks...')
                    } else if (stage === 'finalizing') {
                        setUploadStatus('Finalizing upload...')
                    }
                }
            )

            // Phase 3: Save metadata (95-100%)
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

            // Generate share URL with keys in fragment (zero-knowledge!)
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
        <div className="container mx-auto px-6 py-12">
            {/* Hero Section */}
            <div className="text-center mb-12">
                <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
                    Share Files Securely
                    <br />
                    <span className="text-primary-600 dark:text-primary-400">Zero-Knowledge Encryption</span>
                </h1>
                <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                    Upload files up to 5GB with end-to-end encryption. Your files, your keys, your privacy.
                </p>
            </div>

            {/* File Upload */}
            <div className="mb-16 max-w-2xl mx-auto">
                {!uploading && !shareUrl && (
                    <>
                        <DragDropZone onFileSelect={handleFileSelect} />

                        {selectedFile && (
                            <>
                                <div className="mt-6">
                                    <ExpirySelector
                                        selected={selectedExpiry}
                                        onChange={setSelectedExpiry}
                                    />
                                </div>

                                <div className="mt-6 flex gap-3 justify-center">
                                    <button
                                        onClick={() => setShowPreview(true)}
                                        className="px-6 py-3 rounded-lg font-medium bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                                    >
                                        <Eye className="w-5 h-5" />
                                        Preview File
                                    </button>

                                    <button
                                        onClick={handleUpload}
                                        className="btn-primary flex items-center gap-2"
                                    >
                                        <Shield className="w-5 h-5" />
                                        Encrypt & Upload
                                    </button>
                                </div>
                            </>
                        )}
                    </>
                )}

                {uploading && (
                    <UploadProgress
                        progress={uploadProgress}
                        fileName={selectedFile?.name}
                        status={uploadStatus}
                        encryptionNote={uploadStage === 'encrypting'}
                    />
                )}

                {shareUrl && (
                    <div className="glass-card p-8 rounded-2xl text-center">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                        </div>

                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            File Uploaded Successfully!
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                            Share this link to let others download your file
                        </p>

                        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-4 break-all text-sm font-mono text-gray-900 dark:text-white">
                            {shareUrl}
                        </div>

                        <div className="flex gap-3 justify-center mb-6">
                            <button
                                onClick={handleCopy}
                                className="btn-primary flex items-center gap-2"
                            >
                                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                {copied ? 'Copied!' : 'Copy Link'}
                            </button>

                            <button
                                onClick={() => setShowQR(!showQR)}
                                className="px-6 py-3 rounded-lg font-medium bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                            >
                                <QrCodeIcon className="w-5 h-5" />
                                {showQR ? 'Hide QR' : 'Show QR Code'}
                            </button>

                            <button
                                onClick={() => {
                                    setShareUrl(null)
                                    setSelectedFile(null)
                                    setShowQR(false)
                                }}
                                className="px-6 py-3 rounded-lg font-medium bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Upload Another
                            </button>
                        </div>

                        {showQR && (
                            <div className="mt-6">
                                <QRCode url={shareUrl} />
                            </div>
                        )}

                        <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                            <Shield className="w-4 h-4 inline mr-1" />
                            Zero-Knowledge: Encryption keys are only in the URL
                        </div>
                    </div>
                )}
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
                <FeatureCard
                    icon={<Shield className="w-8 h-8" />}
                    title="Zero-Knowledge"
                    description="Files encrypted in your browser. We never see your data."
                />
                <FeatureCard
                    icon={<Lock className="w-8 h-8" />}
                    title="AES-256 Encryption"
                    description="Military-grade encryption for maximum security."
                />
                <FeatureCard
                    icon={<Zap className="w-8 h-8" />}
                    title="Up to 5GB"
                    description="Share large files with intelligent routing."
                />
                <FeatureCard
                    icon={<Globe className="w-8 h-8" />}
                    title="Auto-Delete"
                    description="Files expire automatically for privacy."
                />
            </div>

            {/* File Preview Modal */}
            {showPreview && (
                <FilePreviewModal
                    file={selectedFile}
                    onClose={() => setShowPreview(false)}
                />
            )}
        </div>
    )
}

function FeatureCard({ icon, title, description }) {
    return (
        <div className="glass-card p-6 rounded-xl glass-hover group">
            <div className="text-primary-600 dark:text-primary-400 mb-3 group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <h3 className="text-gray-900 dark:text-white font-semibold text-lg mb-2">{title}</h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm">{description}</p>
        </div>
    )
}
