import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { formatFileSize, getFileIcon } from '../utils/fileUtils'
import { downloadAndDecryptStreaming, terminateWorkerPool } from '../utils/streamingEncryption'
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

            const hash = window.location.hash.substring(1)
            const params = new URLSearchParams(hash)
            const keyHex = params.get('key')
            const ivHex = params.get('iv')

            if (!keyHex || !ivHex) {
                throw new Error('Encryption keys missing from URL. Invalid share link.')
            }

            await downloadAndDecryptStreaming(
                metadata.storage_path,
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
                setDownloadProgress(0)
                loadFileMetadata()
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

    const fileSize = formatFileSize(metadata.file_size)
    const fileExt = metadata.original_name.split('.').pop()?.toUpperCase() || 'FILE'
    const shareUrl = window.location.href

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
            <main className="relative z-10 flex flex-col items-center justify-center px-4 py-8 md:py-16">
                {/* Download Card */}
                <div className="w-full max-w-[400px] glass-card p-6 flex flex-col items-center gap-6 card-hover">
                    {/* File Icon with Encrypted Badge */}
                    <div className="relative w-full flex justify-center pt-2 pb-1">
                        <div className="w-16 h-16 rounded-2xl bg-primary-container flex items-center justify-center text-primary-200 shadow-inner border border-outline/20">
                            <span className="material-symbols-outlined text-[32px]">description</span>
                        </div>
                        <div className="absolute -bottom-3 bg-primary-900 text-primary-200 text-[11px] font-medium px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 border border-primary/20">
                            <span className="material-symbols-outlined text-[14px] icon-filled">lock</span>
                            Encrypted
                        </div>
                    </div>

                    {/* File Info */}
                    <div className="text-center w-full space-y-2 mt-2">
                        <h1 className="text-[22px] leading-7 font-normal text-white break-words">
                            {metadata.original_name}
                        </h1>
                        <div className="flex items-center justify-center gap-3 text-sm text-on-surface-variant font-normal tracking-wide">
                            <span className="bg-surface-variant/50 border border-outline-variant px-2 py-0.5 rounded-md text-gray-300">
                                {fileSize}
                            </span>
                            <span className="bg-surface-variant/50 border border-outline-variant px-2 py-0.5 rounded-md text-gray-300">
                                {fileExt}
                            </span>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="w-full h-px bg-outline-variant/50" />

                    {/* Decryption Key Display (Note) */}
                    <div className="w-full relative">
                        <div className="flex items-center gap-3 px-4 py-3 rounded border border-outline text-on-surface-variant text-sm">
                            <span className="material-symbols-outlined text-primary">key</span>
                            <span>Decryption key embedded in URL</span>
                            <span className="material-symbols-outlined text-primary ml-auto">check_circle</span>
                        </div>
                    </div>

                    {/* Download Button */}
                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="w-full h-12 bg-primary hover:bg-primary-400 hover:shadow-purple-glow-button active:scale-[0.98] text-black rounded-full flex items-center justify-center gap-2 transition-all duration-200 font-medium tracking-wide text-[14px] border border-white/5"
                    >
                        {downloading ? (
                            <>
                                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                {downloadStatus} ({Math.round(downloadProgress)}%)
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[20px]">download</span>
                                Decrypt & Download
                            </>
                        )}
                    </button>

                    {/* Progress Bar */}
                    {downloading && (
                        <div className="w-full h-1 bg-surface-variant rounded-full overflow-hidden">
                            <div
                                className="progress-bar transition-all duration-300"
                                style={{ width: `${downloadProgress}%` }}
                            />
                        </div>
                    )}

                    {/* Security Note */}
                    <div className="text-center px-4">
                        <p className="text-[12px] leading-5 text-on-surface-variant">
                            Zero-knowledge encryption ensures your data remains private.{' '}
                            <a className="text-primary hover:text-primary-400 hover:underline" href="#">
                                Learn more
                            </a>
                        </p>
                    </div>
                </div>

                {/* Security Badge */}
                <div className="flex items-center justify-center gap-2 text-on-surface-variant/70 mt-6">
                    <span className="material-symbols-outlined text-[16px]">verified_user</span>
                    <span className="text-[12px] font-medium tracking-wide">Secure Browser Decryption</span>
                </div>

                {/* QR Code Toggle */}
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
