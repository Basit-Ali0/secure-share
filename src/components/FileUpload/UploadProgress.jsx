const STAGES = [
    { key: 'preparing', label: 'Preparing share' },
    { key: 'encrypting', label: 'Encrypting locally' },
    { key: 'uploading', label: 'Uploading securely' },
    { key: 'saving', label: 'Saving metadata' },
]

function getStageIndex(stage) {
    const index = STAGES.findIndex((item) => item.key === stage)
    return index === -1 ? 0 : index
}

export default function UploadProgress({ progress, fileName, fileMeta, status, stage, contextLabel }) {
    const activeIndex = getStageIndex(stage)

    return (
        <div className="flex flex-col gap-5">
            <div className="rounded-[28px] border border-outline-variant bg-surface-container-high px-4 py-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-primary-container text-primary-200">
                        <span className="material-symbols-outlined text-[24px] icon-filled">description</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-base font-medium text-white">{fileName}</p>
                            <span className="text-xs font-medium text-primary">{Math.round(progress)}%</span>
                        </div>
                        {fileMeta ? <p className="mt-1 text-xs text-on-surface-variant">{fileMeta}</p> : null}
                        {contextLabel ? <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-on-surface-variant">{contextLabel}</p> : null}
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-variant">
                            <div className="progress-bar transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STAGES.map((item, index) => {
                    const completed = activeIndex > index || stage === 'complete'
                    const active = activeIndex === index && stage !== 'complete'

                    return (
                        <div
                            key={item.key}
                            className={`rounded-2xl border px-4 py-3 transition-colors ${
                                completed || active
                                    ? 'border-primary/40 bg-primary-container/20'
                                    : 'border-outline-variant bg-surface-container-high/70'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className={`material-symbols-outlined text-[18px] ${
                                    completed ? 'text-primary icon-filled' : active ? 'text-primary' : 'text-on-surface-variant'
                                }`}>
                                    {completed ? 'check_circle' : active ? 'progress_activity' : 'radio_button_unchecked'}
                                </span>
                                <span className={`text-sm ${completed || active ? 'text-white' : 'text-on-surface-variant'}`}>
                                    {item.label}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="space-y-3 text-center">
                <p className="text-sm text-on-surface-variant">{status}</p>
                <div className="rounded-2xl border border-outline-variant bg-surface-container-high/70 px-4 py-3 text-xs text-on-surface-variant">
                    Your file is encrypted in your browser first, then uploaded as ciphertext only.
                </div>
            </div>
        </div>
    )
}
