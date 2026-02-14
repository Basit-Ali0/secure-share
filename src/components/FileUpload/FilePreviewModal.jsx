import { useState, useEffect, useCallback } from 'react'

export default function FilePreviewModal({ file, onClose }) {
    const [previewUrl, setPreviewUrl] = useState(null)
    const [fileType, setFileType] = useState(null)

    // Escape key handler
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') onClose()
    }, [onClose])

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    useEffect(() => {
        if (!file) return

        // Determine file type and create preview URL in one pass
        const type = file.type.startsWith('image/') ? 'image'
            : file.type === 'application/pdf' ? 'pdf'
                : file.type.startsWith('video/') ? 'video'
                    : file.type.startsWith('audio/') ? 'audio'
                        : 'unsupported'

        setFileType(type)

        let objectUrl = null
        if (type !== 'unsupported') {
            objectUrl = URL.createObjectURL(file)
            setPreviewUrl(objectUrl)
        }

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl)
            }
        }
    }, [file])

    if (!file) return null

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="File preview"
        >
            <div
                className="bg-surface-container border border-outline-variant rounded-m3 max-w-4xl w-full max-h-[90vh] overflow-auto shadow-purple-glow-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                        <h3 className="text-xl font-medium text-white">Preview</h3>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-on-surface-variant transition-colors"
                            aria-label="Close preview"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* File Name */}
                    <div className="mb-4">
                        <p className="text-sm text-on-surface-variant truncate">{file.name}</p>
                    </div>

                    {/* Preview Area */}
                    <div className="bg-surface-container-high rounded-xl p-4 flex items-center justify-center min-h-[400px] border border-outline-variant">
                        {fileType === 'image' && (
                            <img
                                src={previewUrl}
                                alt={file.name}
                                className="max-w-full max-h-[600px] object-contain rounded"
                            />
                        )}

                        {fileType === 'pdf' && (
                            <iframe
                                src={previewUrl}
                                className="w-full h-[600px] rounded bg-white"
                                title="PDF Preview"
                            />
                        )}

                        {fileType === 'video' && (
                            <video
                                src={previewUrl}
                                controls
                                className="max-w-full max-h-[600px] rounded"
                            >
                                Your browser does not support video preview.
                            </video>
                        )}

                        {fileType === 'audio' && (
                            <div className="flex flex-col items-center gap-4">
                                <span className="material-symbols-outlined text-6xl text-on-surface-variant">volume_up</span>
                                <audio src={previewUrl} controls className="w-full max-w-md" />
                            </div>
                        )}

                        {fileType === 'unsupported' && (
                            <div className="text-center text-on-surface-variant">
                                <span className="material-symbols-outlined text-6xl mb-3">description</span>
                                <p>Preview not available for this file type</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
