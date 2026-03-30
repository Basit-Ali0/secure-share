import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { popInProps, transitionSec } from '../../lib/motionPresets.js'

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'a[href]:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'audio',
    'video',
    'iframe',
    '[tabindex]:not([tabindex="-1"])',
].join(',')

function listTabbableElements(container) {
    return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
        (el) => el.getAttribute('aria-hidden') !== 'true'
    )
}

export default function FilePreviewModal({ file, onClose }) {
    const prefersReducedMotion = useReducedMotion()
    const [preview, setPreview] = useState({ url: null, type: null })
    const closeButtonRef = useRef(null)
    const previousFocusRef = useRef(null)
    const restoreTargetCapturedRef = useRef(false)
    const overlayRef = useRef(null)

    useLayoutEffect(() => {
        if (!file) return undefined

        const type = file.type.startsWith('image/')
            ? 'image'
            : file.type === 'application/pdf'
              ? 'pdf'
              : file.type.startsWith('video/')
                ? 'video'
                : file.type.startsWith('audio/')
                  ? 'audio'
                  : 'unsupported'

        let objectUrl = null
        if (type !== 'unsupported') {
            objectUrl = URL.createObjectURL(file)
        }
        setPreview({ url: objectUrl, type })

        return () => {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl)
            }
        }
    }, [file])

    useLayoutEffect(() => {
        if (!file) return undefined
        if (!restoreTargetCapturedRef.current) {
            previousFocusRef.current = document.activeElement
            restoreTargetCapturedRef.current = true
        }
        const id = requestAnimationFrame(() => {
            closeButtonRef.current?.focus()
        })
        return () => cancelAnimationFrame(id)
    }, [file])

    useEffect(() => {
        return () => {
            const el = previousFocusRef.current
            if (el && typeof el.focus === 'function') {
                try {
                    el.focus()
                } catch {
                    // Element may no longer be focusable
                }
            }
        }
    }, [])

    useEffect(() => {
        if (!file) return undefined

        const onDocKeyDown = (e) => {
            const root = overlayRef.current
            if (!root) return

            if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
                return
            }

            if (e.key !== 'Tab') return

            const active = document.activeElement
            if (!root.contains(active)) return

            const focusables = listTabbableElements(root)
            if (focusables.length === 0) return

            const first = focusables[0]
            const last = focusables[focusables.length - 1]
            const idx = focusables.indexOf(active)

            if (idx === -1) {
                e.preventDefault()
                first.focus()
                return
            }

            if (e.shiftKey) {
                if (active === first) {
                    e.preventDefault()
                    last.focus()
                }
            } else if (active === last) {
                e.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', onDocKeyDown, true)
        return () => document.removeEventListener('keydown', onDocKeyDown, true)
    }, [file, onClose])

    if (!file) return null

    const panelMotion = { ...popInProps(prefersReducedMotion) }
    delete panelMotion.exit

    const { url: previewUrl, type: fileType } = preview

    return (
        <motion.div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-mf-ink/80 p-4 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-preview-title"
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={transitionSec(0.22)}
        >
            <motion.div
                className="max-h-[90vh] w-full max-w-4xl overflow-auto border border-mf-border bg-mf-card"
                onClick={(e) => e.stopPropagation()}
                {...panelMotion}
            >
                <div className="p-6">
                    <div className="mb-4 flex items-start justify-between">
                        <h3 id="file-preview-title" className="text-xl font-bold text-mf-ink" tabIndex={-1}>
                            Preview
                        </h3>
                        <button
                            ref={closeButtonRef}
                            type="button"
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
                        {fileType == null ? (
                            <p className="font-mono text-sm text-mf-ink-muted">Loading preview…</p>
                        ) : null}

                        {fileType === 'image' && previewUrl && (
                            <img
                                src={previewUrl}
                                alt={file.name}
                                className="max-h-[600px] max-w-full rounded object-contain"
                            />
                        )}

                        {fileType === 'pdf' && previewUrl && (
                            <iframe
                                src={previewUrl}
                                className="h-[600px] w-full rounded bg-white"
                                title="PDF Preview"
                            />
                        )}

                        {fileType === 'video' && previewUrl && (
                            <video src={previewUrl} controls className="max-h-[600px] max-w-full rounded">
                                Your browser does not support video preview.
                            </video>
                        )}

                        {fileType === 'audio' && previewUrl && (
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
            </motion.div>
        </motion.div>
    )
}
