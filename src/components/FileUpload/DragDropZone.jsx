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
                            ? 'border-primary-400 bg-primary-500/20 scale-105'
                            : 'border-white/30 hover:border-primary-400 hover:bg-white/20'
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
                                <File className="w-12 h-12 text-primary-400" />
                            ) : (
                                <Upload className="w-12 h-12 text-white" />
                            )}
                        </div>

                        <div>
                            <h3 className="text-2xl font-bold text-white mb-2">
                                {isDragging ? 'Drop your file here' : 'Upload a file'}
                            </h3>
                            <p className="text-white/70">
                                Drag and drop or click to browse
                            </p>
                            <p className="text-white/50 text-sm mt-2">
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
