import { Clock } from 'lucide-react'

const EXPIRY_OPTIONS = [
    { label: '1 Hour', value: 1, unit: 'hours' },
    { label: '6 Hours', value: 6, unit: 'hours' },
    { label: '24 Hours', value: 24, unit: 'hours' },
    { label: '7 Days', value: 7, unit: 'days' },
    { label: '30 Days', value: 30, unit: 'days' },
]

export default function ExpirySelector({ selected, onChange }) {
    return (
        <div className="glass-card p-6 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">
                    File Expiry Time
                </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {EXPIRY_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        onClick={() => onChange(option)}
                        className={`
              px-4 py-3 rounded-lg font-medium text-sm transition-all
              ${selected?.value === option.value
                                ? 'bg-primary-600 text-white shadow-lg'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }
            `}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                File will be automatically deleted after the selected time period
            </p>
        </div>
    )
}

export { EXPIRY_OPTIONS }
