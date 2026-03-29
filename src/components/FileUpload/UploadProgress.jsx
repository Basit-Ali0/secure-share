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
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-6">
            <div className="border border-mf-border bg-mf-bg-panel px-4 py-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-mf-accent/15 text-mf-accent">
                        <span className="material-symbols-outlined text-[24px] icon-filled">description</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-base font-bold text-mf-ink">{fileName}</p>
                            <span className="font-mono text-xs font-medium text-mf-accent">{Math.round(progress)}%</span>
                        </div>
                        {fileMeta ? <p className="mt-1 font-mono text-xs text-mf-ink-muted">{fileMeta}</p> : null}
                        {contextLabel ? (
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-mf-ink-muted">{contextLabel}</p>
                        ) : null}
                        <div className="mt-3 h-0.5 w-full bg-mf-border">
                            <div className="mf-progress-fill" style={{ width: `${progress}%` }} />
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
                            className={`border px-4 py-3 transition-colors ${
                                completed || active ? 'border-mf-accent/40 bg-mf-accent/10' : 'border-mf-border bg-mf-bg-panel'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={`material-symbols-outlined text-[18px] ${
                                        completed ? 'text-mf-accent icon-filled' : active ? 'text-mf-accent' : 'text-mf-ink-muted'
                                    }`}
                                >
                                    {completed ? 'check_circle' : active ? 'progress_activity' : 'radio_button_unchecked'}
                                </span>
                                <span className={`text-sm ${completed || active ? 'text-mf-ink' : 'text-mf-ink-muted'}`}>{item.label}</span>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="space-y-3 text-center">
                <p className="text-sm text-mf-ink-muted">{status}</p>
                <div className="border border-mf-border bg-mf-bg-panel px-4 py-3 font-mono text-xs text-mf-ink-muted">
                    Your file is encrypted in your browser first, then uploaded as ciphertext only.
                </div>
            </div>
        </div>
    )
}
