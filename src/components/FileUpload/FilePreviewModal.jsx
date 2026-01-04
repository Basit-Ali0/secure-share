import { useState, useEffect } from 'react'
import { FileText, Film, FileImage, Volume2 } from 'lucide-react'

export default function FilePreviewModal({ file, onClose }) {
    const [previewUrl, setPreviewUrl] = useState(null)
    const [fileType, setFileType] = useState(null)

    useEffect(() => {
        if (!file) return

        // Determine file type
        if (file.type.startsWith('image/')) {
            setFileType('image')
            setPreviewUrl(URL.createObjectURL(file))
        } else if (file.type === 'application/pdf') {
            setFileType('pdf')
            setPreviewUrl(URL.createObjectURL(file))
        } else if (file.type.startsWith('video/')) {
            setFileType('video')
            setPreviewUrl(URL.createObjectURL(file))
        } else if (file.type.startsWith('audio/')) {
            setFileType('audio')
            setPreviewUrl(URL.createObjectURL(file))
        } else {
            setFileType('unsupported')
        }

        // Cleanup
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl)
            }
        }
    }, [file])

    if (!file) return null

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                            Preview
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="mb-4">
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {file.name}
                        </p>
                    </div>

                    <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 flex items-center justify-center min-h-[400px]">
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
                                className="w-full h-[600px] rounded"
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
                                <Volume2 className="w-16 h-16 text-gray-400" />
                                <audio src={previewUrl} controls className="w-full max-w-md" />
                            </div>
                        )}

                        {fileType === 'unsupported' && (
                            <div className="text-center text-gray-500 dark:text-gray-400">
                                <FileText className="w-16 h-16 mx-auto mb-3" />
                                <p>Preview not available for this file type</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
