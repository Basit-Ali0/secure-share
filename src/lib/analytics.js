import ReactGA from 'react-ga4'

let initialized = false
let initPromise = null

async function ensureAnalytics() {
    if (!import.meta.env.PROD) {
        return false
    }

    if (initialized) {
        return true
    }

    if (!initPromise) {
        initPromise = (async () => {
            let measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID

            if (!measurementId) {
                try {
                    const response = await fetch('/api/runtime-config', {
                        headers: { Accept: 'application/json' },
                        cache: 'no-store',
                    })

                    if (response.ok) {
                        const config = await response.json()
                        measurementId = config.gaMeasurementId
                    }
                } catch {
                    return false
                }
            }

            if (!measurementId) {
                return false
            }

            ReactGA.initialize(measurementId)
            initialized = true
            return true
        })()
    }

    return initPromise
}

export function initAnalytics() {
    void ensureAnalytics()
}

export function trackPageView(path) {
    void (async () => {
        if (!await ensureAnalytics()) {
            return
        }

        ReactGA.send({ hitType: 'pageview', page: path })
    })()
}

export function trackEvent(action, params = {}) {
    void (async () => {
        if (!await ensureAnalytics()) {
            return
        }

        ReactGA.event(action, params)
    })()
}
