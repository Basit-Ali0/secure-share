import { useState, useEffect } from 'react'
import QRCodeLib from 'qrcode'
import { useTheme } from '../../context/ThemeContext.jsx'

export default function QRCode({ url }) {
    const [qrDataUrl, setQrDataUrl] = useState('')
    const { theme } = useTheme()

    useEffect(() => {
        let cancelled = false

        if (url) {
            const isDark = theme === 'dark'
            QRCodeLib.toDataURL(url, {
                width: 256,
                margin: 2,
                color: {
                    dark: isDark ? '#f5f3ee' : '#0a0909',
                    light: isDark ? '#181816' : '#ffffff',
                },
            })
                .then((dataUrl) => {
                    if (!cancelled) setQrDataUrl(dataUrl)
                })
                .catch((err) => console.error('QR code generation failed:', err))
        }

        return () => {
            cancelled = true
        }
    }, [url, theme])

    if (!qrDataUrl) return null

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border border-mf-border bg-mf-card p-4">
                <img src={qrDataUrl} alt="QR Code" className="h-48 w-48 sm:h-64 sm:w-64" />
            </div>
            <p className="font-mono text-sm text-mf-ink-muted">Scan to download on mobile</p>
        </div>
    )
}
