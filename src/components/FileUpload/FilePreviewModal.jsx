import { useState, useEffect } from 'react'

export default function FilePreviewModal({ file, onClose }) {
    const [previewUrl, setPreviewUrl] = useState(null)
    const [fileType, setFileType] = useState(null)

    useEffect(() => {
        if (!file) return

        let objectUrl = null

        if (file.type.startsWith('image/')) {
            setFileType('image')
            objectUrl = URL.createObjectURL(file)
            setPreviewUrl(objectUrl)
        } else if (file.type === 'application/pdf') {
            setFileType('pdf')
            objectUrl = URL.createObjectURL(file)
            setPreviewUrl(objectUrl)
        } else if (file.type.startsWith('video/')) {
            setFileType('video')
            objectUrl = URL.createObjectURL(file)
            setPreviewUrl(objectUrl)
        } else if (file.type.startsWith('audio/')) {
            setFileType('audio')
            objectUrl = URL.createObjectURL(file)
            setPreviewUrl(objectUrl)
        } else {
            setFileType('unsupported')
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
