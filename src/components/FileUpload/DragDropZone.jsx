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
            className={`cursor-pointer border-b border-mf-border px-6 py-12 text-center transition-colors sm:px-10 ${
                isDragging ? 'bg-mf-accent/10' : 'hover:bg-mf-accent/10'
            }`}
        >
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

            <div className={`mb-4 flex justify-center text-mf-ink-muted transition-colors ${isDragging ? 'text-mf-accent' : 'group-hover:text-mf-accent'}`}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="16 16 12 12 8 16" />
                    <line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                </svg>
            </div>

            <p className="text-lg font-bold tracking-tight text-mf-ink">
                {isDragging ? 'Drop your file here' : 'Drop your file here'}
            </p>
            <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-mf-ink-muted">
                or browse your device · max 5 gb · folder supported
            </p>

            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    handleClick()
                }}
                className="mt-6 inline-flex items-center gap-2 bg-mf-ink px-6 py-2.5 text-xs font-semibold text-mf-bg transition-colors hover:bg-mf-accent"
            >
                Choose Files
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                </svg>
            </button>
            <button
                type="button"
                onClick={handleFolderClick}
                className="mt-3 block w-full font-mono text-[10px] uppercase tracking-wider text-mf-ink-muted underline-offset-2 hover:text-mf-accent hover:underline"
            >
                Choose folder
            </button>
        </div>
    )
}
