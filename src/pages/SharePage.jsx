import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Download, Lock, AlertCircle, Loader } from 'lucide-react'
import { getFileMetadata, downloadEncryptedFile, incrementDownloadCount } from '../utils/supabase'
import { decryptFile } from '../utils/encryption'
import { formatFileSize, getFileIcon } from '../utils/fileUtils'
import QRCode from '../components/SharePage/QRCode'

export default function SharePage() {
    const { fileId } = useParams()
    const navigate = useNavigate()

    const [metadata, setMetadata] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [downloading, setDownloading] = useState(false)
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [showQR, setShowQR] = useState(false)

    useEffect(() => {
        loadFileMetadata()
    }, [fileId])

    async function loadFileMetadata() {
        try {
            setLoading(true)
            const data = await getFileMetadata(fileId)
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
            setDownloadProgress(10)

            // Get encryption keys from URL fragment
            const hash = window.location.hash.substring(1)
            const params = new URLSearchParams(hash)
            const key = params.get('key')
            const iv = params.get('iv')

            if (!key || !iv) {
                throw new Error('Encryption keys missing from URL. Invalid share link.')
            }

            // Download encrypted file
            setDownloadProgress(30)
            const encryptedBlob = await downloadEncryptedFile(metadata.storage_path)

            // Decrypt file
            setDownloadProgress(60)
            const decryptedBlob = await decryptFile(encryptedBlob, key, iv)

            // Trigger download
            setDownloadProgress(90)
            const url = URL.createObjectURL(decryptedBlob)
            const a = document.createElement('a')
            a.href = url
            a.download = metadata.original_name
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            // Increment download count
            await incrementDownloadCount(fileId)

            setDownloadProgress(100)
            setTimeout(() => {
                setDownloading(false)
                setDownloadProgress(0)
                // Reload metadata to show updated download count
                loadFileMetadata()
            }, 1000)

        } catch (err) {
            console.error('Download error:', err)
            alert(`Download failed: ${err.message}`)
            setDownloading(false)
            setDownloadProgress(0)
        }
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
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                        <div className="flex items-start gap-3">
                            <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-semibold text-blue-900 dark:text-blue-300 mb-1">
                                    End-to-End Encrypted
                                </p>
                                <p className="text-blue-800 dark:text-blue-400">
                                    This file is encrypted with AES-256-GCM. Decryption happens in your browser using the key in the URL.
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
                                Downloading... {downloadProgress}%
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
