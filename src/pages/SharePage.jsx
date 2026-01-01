import { useParams } from 'react-router-dom'

export default function SharePage() {
    const { fileId } = useParams()

    return (
        <div className="container mx-auto px-6 py-12">
            <div className="max-w-2xl mx-auto">
                <div className="glass-card p-8 rounded-2xl text-center">
                    <h1 className="text-3xl font-bold text-white mb-4">
                        File Share Page
                    </h1>
                    <p className="text-white/70">
                        File ID: {fileId}
                    </p>
                    <p className="text-white/50 mt-4">
                        This page will show file download, QR code, and countdown timer in future phases.
                    </p>
                </div>
            </div>
        </div>
    )
}
