import { useState } from 'react'
import DragDropZone from '../components/FileUpload/DragDropZone'
import UploadProgress from '../components/FileUpload/UploadProgress'
import ExpirySelector, { EXPIRY_OPTIONS } from '../components/FileUpload/ExpirySelector'
import FilePreviewModal from '../components/FileUpload/FilePreviewModal'
import QRCode from '../components/SharePage/QRCode'
import { Shield, Lock, Zap, Globe, Check, Copy, Eye, QrCode as QrCodeIcon } from 'lucide-react'
import { encryptFile } from '../utils/encryption'
import { uploadEncryptedFile, saveFileMetadata } from '../utils/supabase'

export default function HomePage() {
    const [selectedFile, setSelectedFile] = useState(null)
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [uploadStatus, setUploadStatus] = useState('')
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

            // Step 1: Encrypt file in browser
            setUploadStatus('Encrypting file in your browser...')
            setUploadProgress(5)

            const encrypted = await encryptFile(selectedFile)

            setUploadProgress(40) // Encryption complete
            const fileId = crypto.randomUUID()

            // Step 2: Upload encrypted blob to Supabase
            setUploadStatus('Uploading encrypted file...')
            setUploadProgress(50)

            const { path } = await uploadEncryptedFile(encrypted.encryptedBlob, fileId)

            // Step 3: Save metadata with custom expiry
            setUploadStatus('Saving metadata...')
            setUploadProgress(80)

            const expiresAt = new Date()
            if (selectedExpiry.unit === 'hours') {
                expiresAt.setHours(expiresAt.getHours() + selectedExpiry.value)
            } else {
                expiresAt.setDate(expiresAt.getDate() + selectedExpiry.value)
            }

            await saveFileMetadata({
                fileId,
                originalName: encrypted.originalName,
                fileType: encrypted.originalType,
                fileSize: encrypted.originalSize,
                storagePath: path,
                expiresAt: expiresAt.toISOString()
            })

            // Step 4: Generate share URL with keys in fragment
            setUploadStatus('Complete!')
            setUploadProgress(100)

            const baseUrl = window.location.origin
            const url = `${baseUrl}/share/${fileId}#key=${encrypted.key}&iv=${encrypted.iv}`

            setShareUrl(url)

        } catch (error) {
            console.error('Upload error:', error)
            alert(`Upload failed: ${error.message}`)
        } finally {
            setUploading(false)
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
                        encryptionNote={uploadProgress < 40}
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
