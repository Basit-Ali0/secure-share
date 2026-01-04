import { useState, useEffect } from 'react'
import QRCodeLib from 'qrcode'

export default function QRCode({ url }) {
    const [qrDataUrl, setQrDataUrl] = useState('')

    useEffect(() => {
        if (url) {
            QRCodeLib.toDataURL(url, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#1e40af', // primary-700
                    light: '#ffffff'
                }
            }).then(setQrDataUrl)
        }
    }, [url])

    if (!qrDataUrl) return null

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-4 rounded-lg shadow-lg">
                <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="w-64 h-64"
                />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Scan to download on mobile
            </p>
        </div>
    )
}
