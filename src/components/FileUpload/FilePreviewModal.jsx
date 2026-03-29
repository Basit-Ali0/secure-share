import { useState, useEffect, useCallback } from 'react'
import { formatFileSize } from '../../utils/fileUtils'

export default function FilePreviewModal({ file, files, onClose }) {
    const [previewUrl, setPreviewUrl] = useState(null)
    const [fileType, setFileType] = useState(null)

    const isCollection = Array.isArray(files) && files.length > 0

    // Escape key handler
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape') onClose()
    }, [onClose])

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    useEffect(() => {
        if (!file || isCollection) return

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
    }, [file, isCollection])

    if (!file && !isCollection) return null

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={isCollection ? 'Collection preview' : 'File preview'}
        >
            <div
                className="bg-surface-container border border-outline-variant rounded-[28px] max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-purple-glow-lg flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 flex flex-col h-full overflow-hidden">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="text-xl font-medium text-white">
                                {isCollection ? 'Collection Preview' : 'File Preview'}
                            </h3>
                            <p className="text-sm text-on-surface-variant mt-1">
                                {isCollection 
                                    ? `${files.length} file${files.length === 1 ? '' : 's'} selected for secure sharing`
                                    : file.name
                                }
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-on-surface-variant transition-colors"
                            aria-label="Close preview"
                        >
                            <span className="material-symbols-outlined font-light">close</span>
                        </button>
                    </div>

                    {/* Preview Area */}
                    <div className="bg-surface-container-high rounded-2xl flex-1 overflow-auto border border-outline-variant min-h-[300px]">
                        {isCollection ? (
                            <div className="p-2 divide-y divide-outline-variant/30">
                                {files.map((f, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 hover:bg-white/[0.02] transition-colors rounded-xl">
                                        <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-primary-200/70 border border-outline-variant/50">
                                            <span className="material-symbols-outlined text-[20px]">description</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-white truncate">{f.name}</p>
                                            <p className="text-[11px] text-on-surface-variant mt-0.5">{formatFileSize(f.size)} • {f.type || 'Unknown type'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full p-4 min-h-[400px]">
                                {fileType === 'image' && (
                                    <img
                                        src={previewUrl}
                                        alt={file.name}
                                        className="max-w-full max-h-[600px] object-contain rounded-lg"
                                    />
                                )}

                                {fileType === 'pdf' && (
                                    <iframe
                                        src={previewUrl}
                                        className="w-full h-full min-h-[600px] rounded-lg bg-white"
                                        title="PDF Preview"
                                    />
                                )}

                                {fileType === 'video' && (
                                    <video
                                        src={previewUrl}
                                        controls
                                        className="max-w-full max-h-[600px] rounded-lg"
                                    >
                                        Your browser does not support video preview.
                                    </video>
                                )}

                                {fileType === 'audio' && (
                                    <div className="flex flex-col items-center gap-4">
                                        <span className="material-symbols-outlined text-6xl text-on-surface-variant font-light">volume_up</span>
                                        <audio src={previewUrl} controls className="w-full max-w-md" />
                                    </div>
                                )}

                                {fileType === 'unsupported' && (
                                    <div className="text-center text-on-surface-variant">
                                        <span className="material-symbols-outlined text-6xl mb-3 font-light">description</span>
                                        <p>Preview not available for this file type</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div className="mt-6 flex justify-end">
                         <button
                            onClick={onClose}
                            className="h-11 px-6 rounded-full bg-surface-container-highest text-white text-sm font-medium hover:bg-white/10 transition-colors border border-outline-variant"
                        >
                            Back to composer
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
