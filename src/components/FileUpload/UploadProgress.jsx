export default function UploadProgress({ progress, fileName, status }) {
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

            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {fileName}
            </p>
        </div>
    )
}
