import { X } from 'lucide-react'
import { getFileIcon, getFileType, formatFileSize } from '../../utils/fileUtils'
import TierBadge from './TierBadge'

export default function FilePreview({ file, onRemove }) {
    const fileType = getFileType(file.type)
    const FileIcon = getFileIcon(file.type)
    const fileSize = formatFileSize(file.size)

    return (
        <div className="glass-card p-6 rounded-2xl">
            <div className="flex items-start justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Selected File</h3>
                <button
                    onClick={onRemove}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Remove file"
                >
                    <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                </button>
            </div>

            <div className="flex items-center gap-4">
                {/* File Icon */}
                <div className="p-4 rounded-xl glass-card">
                    <FileIcon className="w-10 h-10 text-primary-600 dark:text-primary-400" />
                </div>

                {/* File Info */}
                <div className="flex-1">
                    <p className="text-gray-900 dark:text-white font-medium truncate max-w-md">
                        {file.name}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                        {fileType} • {fileSize}
                    </p>
                </div>

                {/* Tier Badge */}
                <TierBadge fileSize={file.size} />
            </div>
        </div>
    )
}
