const EXPIRY_OPTIONS = [
    { label: '1 Hour', value: 1, unit: 'hours' },
    { label: '24 Hours', value: 24, unit: 'hours' },
    { label: '7 Days', value: 7, unit: 'days' },
]

export default function ExpirySelector({ selected, onChange }) {
    return (
        <div className="flex flex-col gap-2.5">
            <span className="text-sm text-on-surface-variant font-medium">Expiration</span>
            <div className="flex w-full rounded-full border border-outline overflow-hidden h-10">
                {EXPIRY_OPTIONS.map((option, index) => (
                    <button
                        key={`${option.unit}-${option.value}`}
                        onClick={() => onChange(option)}
                        className={`
                            flex-1 text-sm font-medium transition-colors relative
                            ${index < EXPIRY_OPTIONS.length - 1 ? 'border-r border-outline' : ''}
                            ${selected?.value === option.value && selected?.unit === option.unit
                                ? 'bg-primary-700 text-primary-100 hover:bg-primary-600'
                                : 'hover:bg-white/5 text-on-surface-variant'
                            }
                        `}
                    >
                        {selected?.value === option.value && selected?.unit === option.unit && (
                            <span className="material-symbols-outlined text-[16px] absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 icon-filled">
                                check
                            </span>
                        )}
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    )
}

export { EXPIRY_OPTIONS }
