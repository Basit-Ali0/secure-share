const EXPIRY_OPTIONS = [
    { label: '1 Hour', shortLabel: '1H', value: 1, unit: 'hours' },
    { label: '24 Hours', shortLabel: '24H', value: 24, unit: 'hours' },
    { label: '7 Days', shortLabel: '7D', value: 7, unit: 'days' },
]

export default function ExpirySelector({ selected, onChange }) {
    return (
        <div className="flex flex-wrap gap-1">
            {EXPIRY_OPTIONS.map((option) => {
                const isOn = selected?.value === option.value && selected?.unit === option.unit
                return (
                    <button
                        key={`${option.unit}-${option.value}`}
                        type="button"
                        onClick={() => onChange(option)}
                        className={`border px-2.5 py-1.5 font-mono text-[10px] tracking-wide transition-colors ${
                            isOn
                                ? 'border-mf-ink bg-mf-ink text-mf-bg'
                                : 'border-mf-border bg-transparent text-mf-ink-muted hover:border-mf-ink hover:text-mf-ink'
                        }`}
                    >
                        {option.shortLabel}
                    </button>
                )
            })}
        </div>
    )
}

export { EXPIRY_OPTIONS }
