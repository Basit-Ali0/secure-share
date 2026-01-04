export default function UploadProgress({ progress, fileName, status, encryptionNote }) {
    return (
        <div className="glass-card p-6 rounded-2xl">
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {status}
                    </span>
                    <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                        {progress}%
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div
                        className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 truncate mb-3">
                {fileName}
            </p>

            {/* Encryption Info */}
            {encryptionNote && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                            <strong>Processing may take time:</strong> Your file is being encrypted in your browser for maximum security. The server will never see your unencrypted data.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
