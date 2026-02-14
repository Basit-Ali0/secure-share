import { useState, useEffect } from 'react'
import QRCodeLib from 'qrcode'

export default function QRCode({ url }) {
    const [qrDataUrl, setQrDataUrl] = useState('')

    useEffect(() => {
        let cancelled = false

        if (url) {
            QRCodeLib.toDataURL(url, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#BB86FC', // primary purple
                    light: '#000000' // black background
                }
            })
                .then((dataUrl) => {
                    if (!cancelled) setQrDataUrl(dataUrl)
                })
                .catch((err) => console.error('QR code generation failed:', err))
        }

        return () => { cancelled = true }
    }, [url])

    if (!qrDataUrl) return null

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="bg-black p-4 rounded-xl border border-outline-variant shadow-purple-glow">
                <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="w-48 h-48 sm:w-64 sm:h-64"
                />
            </div>
            <p className="text-sm text-on-surface-variant">
                Scan to download on mobile
            </p>
        </div>
    )
}
