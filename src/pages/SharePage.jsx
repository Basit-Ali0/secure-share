import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Download, Lock, AlertCircle, Loader, Shield } from 'lucide-react'
import { formatFileSize, getFileIcon } from '../utils/fileUtils'
import { downloadFromR2 } from '../utils/r2Upload'
import { decryptFileStreaming, terminateWorkerPool } from '../utils/streamingEncryption'
import QRCode from '../components/SharePage/QRCode'

export default function SharePage() {
    const { fileId } = useParams()
    const navigate = useNavigate()

    const [metadata, setMetadata] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [downloading, setDownloading] = useState(false)
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [downloadStatus, setDownloadStatus] = useState('')
    const [showQR, setShowQR] = useState(false)

    useEffect(() => {
        loadFileMetadata()
    }, [fileId])

    async function loadFileMetadata() {
        try {
            setLoading(true)

            const response = await fetch(`/api/files/${fileId}`)

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.message || 'File not found')
            }

            const data = await response.json()
            setMetadata(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleDownload() {
        try {
            setDownloading(true)
            setDownloadProgress(0)

            // Extract keys from URL fragment (zero-knowledge!)
            const hash = window.location.hash.substring(1)
            const params = new URLSearchParams(hash)

            const keyHex = params.get('key')
            const ivHex = params.get('iv')

            if (!keyHex || !ivHex) {
                throw new Error('Encryption keys missing from URL. Invalid share link.')
            }

            // Phase 1: Download encrypted chunks from R2 (0-40%)
            setDownloadStatus('Downloading encrypted file...')

            const { encryptedChunks, authTags } = await downloadFromR2(
                metadata.storage_path,
                metadata.chunk_count || 1,
                (progress) => {
                    setDownloadProgress(progress * 0.4)
                }
            )

            // Phase 2: Decrypt chunks in browser (40-90%)
            setDownloadStatus('Decrypting in your browser...')

            const decryptedBlob = await decryptFileStreaming(
                encryptedChunks,
                authTags,
                keyHex,
                ivHex,
                (progress) => {
                    setDownloadProgress(40 + progress * 0.5)
                }
            )

            // Phase 3: Trigger download (90-100%)
            setDownloadProgress(95)
            setDownloadStatus('Preparing download...')

            triggerDownload(decryptedBlob, metadata.original_name)

            setDownloadProgress(100)
            setDownloadStatus('Complete!')

            setTimeout(() => {
                setDownloading(false)
                setDownloadProgress(0)
                loadFileMetadata() // Refresh to show updated download count
            }, 1000)

        } catch (err) {
            console.error('Download error:', err)
            alert(`Download failed: ${err.message}`)
            setDownloading(false)
            setDownloadProgress(0)
        } finally {
            terminateWorkerPool()
        }
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    if (loading) {
        return (
            <div className="container mx-auto px-6 py-12">
                <div className="max-w-2xl mx-auto glass-card p-12 rounded-2xl text-center">
                    <Loader className="w-12 h-12 text-primary-600 dark:text-primary-400 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Loading file...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="container mx-auto px-6 py-12">
                <div className="max-w-2xl mx-auto glass-card p-12 rounded-2xl text-center">
                    <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        File Not Found
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        {error}
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="btn-primary"
                    >
                        Upload a File
                    </button>
                </div>
            </div>
        )
    }

    const FileIcon = getFileIcon(metadata.file_type)
    const fileSize = formatFileSize(metadata.file_size)
    const createdDate = new Date(metadata.created_at).toLocaleDateString()
    const expiresDate = new Date(metadata.expires_at).toLocaleString()
    const shareUrl = window.location.href

    return (
        <div className="container mx-auto px-6 py-12">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* File Info Card */}
                <div className="glass-card p-8 rounded-2xl">
                    <div className="flex items-start gap-6 mb-8">
                        <div className="p-6 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                            <FileIcon className="w-16 h-16 text-primary-600 dark:text-primary-400" />
                        </div>

                        <div className="flex-1">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                {metadata.original_name}
                            </h1>
                            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                                <p>Size: {fileSize}</p>
                                <p>Uploaded: {createdDate}</p>
                                <p>Expires: {expiresDate}</p>
                                {metadata.download_count > 0 && (
                                    <p>Downloads: {metadata.download_count}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Security Notice */}
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
                        <div className="flex items-start gap-3">
                            <Shield className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-semibold text-green-900 dark:text-green-300 mb-1">
                                    Zero-Knowledge Encryption
                                </p>
                                <p className="text-green-800 dark:text-green-400">
                                    This file is encrypted with AES-256-GCM. Decryption happens entirely in your browser.
                                    The server never sees your data or encryption keys.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Download Button */}
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="w-full btn-primary flex items-center justify-center gap-2 text-lg py-4"
                    >
                        {downloading ? (
                            <>
                                <Loader className="w-6 h-6 animate-spin" />
                                {downloadStatus} ({Math.round(downloadProgress)}%)
                            </>
                        ) : (
                            <>
                                <Download className="w-6 h-6" />
                                Download File
                            </>
                        )}
                    </button>

                    {downloading && (
                        <div className="mt-4">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div
                                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${downloadProgress}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* QR Code Card */}
                <div className="glass-card p-8 rounded-2xl">
                    <button
                        onClick={() => setShowQR(!showQR)}
                        className="w-full flex items-center justify-between text-left"
                    >
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Share via QR Code
                        </h3>
                        <svg
                            className={`w-6 h-6 text-gray-600 dark:text-gray-400 transition-transform ${showQR ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {showQR && (
                        <div className="mt-6 flex justify-center">
                            <QRCode url={shareUrl} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
