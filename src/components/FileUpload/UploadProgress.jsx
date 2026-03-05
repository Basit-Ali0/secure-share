export default function UploadProgress({ progress, fileName, status, encryptionNote }) {
    return (
        <div className="flex flex-col gap-6">
            {/* File being uploaded */}
            <div className="bg-surface-container-high rounded-xl p-4 flex items-center gap-3 border border-outline-variant">
                <div className="w-10 h-10 rounded-full bg-primary-container text-primary-200 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl icon-filled">description</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-white truncate">{fileName}</span>
                        <span className="text-xs font-medium text-primary">{Math.round(progress)}%</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1 w-full bg-surface-variant rounded-full overflow-hidden">
                        <div
                            className="progress-bar transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Status */}
            <div className="text-center">
                <p className="text-on-surface-variant text-sm">{status}</p>
            </div>

            {/* Encryption Info */}
            {encryptionNote && (
                <div className="bg-primary-container/30 border border-primary/20 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                        <span className="material-symbols-outlined text-primary text-lg shrink-0">lock</span>
                        <div>
                            <p className="text-sm text-primary-200 font-medium mb-1">
                                Encrypting in your browser
                            </p>
                            <p className="text-xs text-on-surface-variant">
                                Your file is being encrypted locally for maximum security. The server will never see your unencrypted data.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
