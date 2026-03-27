import ReactGA from 'react-ga4'

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID
const analyticsEnabled = Boolean(import.meta.env.PROD && measurementId)

let initialized = false

export function initAnalytics() {
    if (!analyticsEnabled || initialized) {
        return
    }

    ReactGA.initialize(measurementId)
    initialized = true
}

export function trackPageView(path) {
    if (!initialized) {
        return
    }

    ReactGA.send({ hitType: 'pageview', page: path })
}

export function trackEvent(action, params = {}) {
    if (!initialized) {
        return
    }

    ReactGA.event(action, params)
}

export function isAnalyticsEnabled() {
    return analyticsEnabled
}
