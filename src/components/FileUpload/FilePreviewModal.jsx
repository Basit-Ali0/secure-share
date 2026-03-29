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
            className="fixed inset-0 z-50 flex items-center justify-center bg-mf-ink/80 p-4 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="File preview"
        >
            <div
                className="max-h-[90vh] w-full max-w-4xl overflow-auto border border-mf-border bg-mf-card"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="mb-4 flex items-start justify-between">
                        <h3 className="text-xl font-bold text-mf-ink">Preview</h3>
                        <button
                            onClick={onClose}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-mf-ink-muted transition-colors hover:bg-mf-bg-panel"
                            aria-label="Close preview"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div className="mb-4">
                        <p className="truncate font-mono text-sm text-mf-ink-muted">{file.name}</p>
                    </div>

                    <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-mf-border bg-mf-bg-panel p-4">
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
                                <span className="material-symbols-outlined text-6xl text-mf-ink-muted">volume_up</span>
                                <audio src={previewUrl} controls className="w-full max-w-md" />
                            </div>
                        )}

                        {fileType === 'unsupported' && (
                            <div className="text-center text-mf-ink-muted">
                                <span className="material-symbols-outlined mb-3 text-6xl">description</span>
                                <p>Preview not available for this file type</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
