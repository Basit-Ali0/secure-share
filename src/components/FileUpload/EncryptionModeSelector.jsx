import { Shield, Zap } from 'lucide-react'

const ENCRYPTION_MODES = [
    {
        id: 'hybrid',
        name: 'Standard',
        label: 'Hybrid Encryption',
        icon: Zap,
        description: 'Fast & Secure - Balanced speed and privacy',
        details: 'File encrypted on server with your unique key. 2-3x faster than Zero-Knowledge.',
        speed: 'Fast',
        security: 'High',
        recommended: true
    },
    {
        id: 'zero-knowledge',
        name: 'Maximum Privacy',
        label: 'Zero-Knowledge',
        icon: Shield,
        description: 'Maximum Privacy - Server never sees your data',
        details: 'File encrypted in your browser. Server cannot access your files. Slower for large files.',
        speed: 'Slower',
        security: 'Maximum',
        recommended: false
    }
]

export default function EncryptionModeSelector({ selected, onChange }) {
    return (
        <div className="glass-card p-6 rounded-2xl mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Security Mode
            </h3>

            <div className="grid md:grid-cols-2 gap-4">
                {ENCRYPTION_MODES.map((mode) => {
                    const Icon = mode.icon
                    const isSelected = selected === mode.id

                    return (
                        <button
                            key={mode.id}
                            onClick={() => onChange(mode.id)}
                            className={`
                relative text-left p-4 rounded-xl border-2 transition-all
                ${isSelected
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                                }
              `}
                        >
                            {/* Recommended badge */}
                            {mode.recommended && (
                                <div className="absolute -top-2 -right-2 px-2 py-1 bg-primary-600 text-white text-xs font-semibold rounded-full">
                                    Recommended
                                </div>
                            )}

                            <div className="flex items-start gap-3 mb-3">
                                <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary-100 dark:bg-primary-800' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                    <Icon className={`w-5 h-5 ${isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'}`} />
                                </div>

                                <div className="flex-1">
                                    <div className="font-semibold text-gray-900 dark:text-white">
                                        {mode.name}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                        {mode.description}
                                    </div>
                                </div>

                                {/* Radio indicator */}
                                <div className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center
                  ${isSelected ? 'border-primary-500' : 'border-gray-300 dark:border-gray-600'}
                `}>
                                    {isSelected && (
                                        <div className="w-3 h-3 rounded-full bg-primary-500" />
                                    )}
                                </div>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                {mode.details}
                            </p>

                            <div className="flex gap-3 text-xs">
                                <span className={`px-2 py-1 rounded ${mode.speed === 'Fast'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                    }`}>
                                    {mode.speed}
                                </span>
                                <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                    {mode.security} Security
                                </span>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export { ENCRYPTION_MODES }
