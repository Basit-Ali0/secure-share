import { useState, useRef } from 'react'
import { Upload, File } from 'lucide-react'
import FilePreview from './FilePreview'

export default function DragDropZone({ onFileSelect }) {
    const [isDragging, setIsDragging] = useState(false)
    const [selectedFile, setSelectedFile] = useState(null)
    const fileInputRef = useRef(null)

    const handleDragEnter = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            handleFileSelection(files[0])
        }
    }

    const handleFileInput = (e) => {
        const files = e.target.files
        if (files && files.length > 0) {
            handleFileSelection(files[0])
        }
    }

    const handleFileSelection = (file) => {
        setSelectedFile(file)
        if (onFileSelect) {
            onFileSelect(file)
        }
    }

    const handleClick = () => {
        fileInputRef.current?.click()
    }

    const handleRemoveFile = () => {
        setSelectedFile(null)
        if (onFileSelect) {
            onFileSelect(null)
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    return (
        <div className="w-full max-w-2xl mx-auto">
            {!selectedFile ? (
                <div
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={handleClick}
                    className={`
            relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
            transition-all duration-300 glass-card
            ${isDragging
                            ? 'border-primary-500 bg-primary-500/10 scale-105'
                            : 'border-gray-300 dark:border-gray-600 hover:border-primary-500 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
                        }
          `}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileInput}
                        className="hidden"
                        accept="*"
                    />

                    <div className="flex flex-col items-center gap-4">
                        <div className={`
              p-6 rounded-full glass-card transition-transform duration-300
              ${isDragging ? 'scale-110' : ''}
            `}>
                            {isDragging ? (
                                <File className="w-12 h-12 text-primary-600 dark:text-primary-400" />
                            ) : (
                                <Upload className="w-12 h-12 text-primary-600 dark:text-primary-400" />
                            )}
                        </div>

                        <div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                {isDragging ? 'Drop your file here' : 'Upload a file'}
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400">
                                Drag and drop or click to browse
                            </p>
                            <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
                                Maximum file size: 5GB
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <FilePreview file={selectedFile} onRemove={handleRemoveFile} />
            )}
        </div>
    )
}
