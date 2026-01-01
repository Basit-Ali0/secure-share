import { useState } from 'react'
import DragDropZone from '../components/FileUpload/DragDropZone'
import { Shield, Lock, Zap, Globe } from 'lucide-react'

export default function HomePage() {
    const [selectedFile, setSelectedFile] = useState(null)

    const handleFileSelect = (file) => {
        setSelectedFile(file)
    }

    return (
        <div className="container mx-auto px-6 py-12">
            {/* Hero Section */}
            <div className="text-center mb-12">
                <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
                    Share Files Securely
                    <br />
                    <span className="text-primary-400">Zero-Knowledge Encryption</span>
                </h1>
                <p className="text-xl text-white/80 max-w-2xl mx-auto">
                    Upload files up to 5GB with end-to-end encryption. Your files, your keys, your privacy.
                </p>
            </div>

            {/* File Upload */}
            <div className="mb-16">
                <DragDropZone onFileSelect={handleFileSelect} />
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
                <FeatureCard
                    icon={<Shield className="w-8 h-8" />}
                    title="Zero-Knowledge"
                    description="Files encrypted in your browser. We never see your data."
                />
                <FeatureCard
                    icon={<Lock className="w-8 h-8" />}
                    title="AES-256 Encryption"
                    description="Military-grade encryption for maximum security."
                />
                <FeatureCard
                    icon={<Zap className="w-8 h-8" />}
                    title="Up to 5GB"
                    description="Share large files with intelligent routing."
                />
                <FeatureCard
                    icon={<Globe className="w-8 h-8" />}
                    title="Auto-Delete"
                    description="Files expire automatically for privacy."
                />
            </div>
        </div>
    )
}

function FeatureCard({ icon, title, description }) {
    return (
        <div className="glass-card p-6 rounded-xl hover:bg-white/20 transition-all duration-300 group">
            <div className="text-primary-400 mb-3 group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
            <p className="text-white/70 text-sm">{description}</p>
        </div>
    )
}
