import ReactGA from 'react-ga4'

let initialized = false
let initPromise = null
let initScheduled = false
const pendingCalls = []

function flushPendingCalls() {
    if (!initialized || pendingCalls.length === 0) {
        return
    }

    const queued = pendingCalls.splice(0, pendingCalls.length)
    queued.forEach((run) => run())
}

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
            flushPendingCalls()
            return true
        })()
    }

    return initPromise
}

function queueOrRun(call) {
    if (!import.meta.env.PROD) {
        return
    }

    if (initialized) {
        call()
        return
    }

    pendingCalls.push(call)
    initAnalytics()
}

function scheduleAfterPaint(callback) {
    if (typeof window === 'undefined') {
        return
    }

    const run = () => {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => {
                void callback()
            }, { timeout: 2500 })
        } else {
            window.setTimeout(() => {
                void callback()
            }, 1200)
        }
    }

    if (document.readyState === 'complete') {
        run()
        return
    }

    window.addEventListener('load', run, { once: true })
}

export function initAnalytics() {
    if (!import.meta.env.PROD || initScheduled) {
        return
    }

    initScheduled = true
    scheduleAfterPaint(async () => {
        await ensureAnalytics()
    })
}

export function trackPageView(path) {
    queueOrRun(() => {
        ReactGA.send({ hitType: 'pageview', page: path })
    })
}

export function trackEvent(action, params = {}) {
    queueOrRun(() => {
        ReactGA.event(action, params)
    })
}
