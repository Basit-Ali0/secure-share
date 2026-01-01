export default function TierBadge({ fileSize }) {
    const getTierInfo = (size) => {
        const TIER_1 = 50 * 1024 * 1024       // 50MB
        const TIER_2 = 1024 * 1024 * 1024     // 1GB
        const TIER_3 = 5 * 1024 * 1024 * 1024 // 5GB

        if (size <= TIER_1) {
            return {
                label: 'Tier 1',
                description: 'Instant Upload',
                color: 'bg-green-500/20 text-green-400 border-green-500/30'
            }
        } else if (size <= TIER_2) {
            return {
                label: 'Tier 2',
                description: 'Chunked Upload',
                color: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
            }
        } else if (size <= TIER_3) {
            return {
                label: 'Tier 3',
                description: 'Large File',
                color: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
            }
        } else {
            return {
                label: 'Too Large',
                description: 'Max 5GB',
                color: 'bg-red-500/20 text-red-400 border-red-500/30'
            }
        }
    }

    const tierInfo = getTierInfo(fileSize)

    return (
        <div className={`px-4 py-2 rounded-lg border ${tierInfo.color} backdrop-blur-sm`}>
            <div className="text-sm font-semibold">{tierInfo.label}</div>
            <div className="text-xs opacity-80">{tierInfo.description}</div>
        </div>
    )
}
