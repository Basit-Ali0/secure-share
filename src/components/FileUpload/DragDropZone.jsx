import { useState, useRef } from 'react'

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB

function normalizeEntries(fileList) {
    return Array.from(fileList).map((file) => ({
        file,
        relativePath: file.webkitRelativePath || file.name
    }))
}

export default function DragDropZone({ onFileSelect }) {
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef(null)
    const folderInputRef = useRef(null)
    const dragCounter = useRef(0)

    const handleDragEnter = (e) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current++
        setIsDragging(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current--
        if (dragCounter.current <= 0) {
            dragCounter.current = 0
            setIsDragging(false)
        }
    }

    const handleDragOver = (e) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        dragCounter.current = 0
        setIsDragging(false)

        const files = e.dataTransfer.files
        if (files && files.length > 0) {
            handleFileSelection(normalizeEntries(files))
        }
    }

    const handleFileInput = (e) => {
        const files = e.target.files
        if (files && files.length > 0) {
            handleFileSelection(normalizeEntries(files))
        }
        // Reset input so re-selecting the same file triggers onChange
        e.target.value = ''
    }

    const handleFileSelection = (entries) => {
        const oversizeFile = entries.find((entry) => entry.file.size > MAX_FILE_SIZE)
        if (oversizeFile) {
            alert('File is too large. Maximum size is 5GB.')
            return
        }
        if (onFileSelect) {
            onFileSelect(entries)
        }
    }

    const handleClick = () => {
        fileInputRef.current?.click()
    }

    const handleFolderClick = (event) => {
        event.stopPropagation()
        folderInputRef.current?.click()
    }

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            className={`
                upload-zone aspect-square w-full group cursor-pointer relative transition-transform duration-150 ease-out
                ${isDragging ? 'border-primary bg-surface-variant scale-[1.02]' : ''}
            `}
        >
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />

            <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
                accept="*"
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                webkitdirectory=""
                directory=""
                onChange={handleFileInput}
                className="hidden"
            />

            <span className={`
                material-symbols-outlined text-4xl mb-3 transition-colors
                ${isDragging ? 'text-primary icon-filled' : 'text-outline group-hover:text-primary'}
            `}>
                cloud_upload
            </span>

            <p className="text-white text-base font-medium z-10">
                {isDragging ? 'Drop your file here' : 'Drag & Drop files'}
            </p>
            <p className="text-on-surface-variant text-xs mt-1 z-10">
                or browse your device (Max 5GB)
            </p>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    handleClick()
                }}
                className="mt-4 px-6 py-2.5 rounded-full bg-surface-variant text-primary border border-primary/30 text-sm font-medium shadow-sm hover:shadow-md hover:bg-primary/10 transition-all z-10"
            >
                Choose Files
            </button>
            <button
                type="button"
                onClick={handleFolderClick}
                className="mt-2 px-6 py-2 rounded-full text-xs font-medium text-on-surface-variant border border-outline/60 hover:border-primary/30 hover:text-white hover:bg-white/5 transition-all z-10"
            >
                Choose Folder
            </button>
        </div>
    )
}
