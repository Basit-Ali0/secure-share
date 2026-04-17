import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import HomePage from './pages/HomePage'
import { trackPageView } from './lib/analytics.js'
import { routePresenceProps } from './lib/motionPresets.js'

const SharePage = lazy(() => import('./pages/SharePage'))

function RouteFallback() {
    return <div className="min-h-screen bg-mf-bg" aria-hidden />
}

function AnalyticsTracker() {
    const location = useLocation()

    useEffect(() => {
        trackPageView(`${location.pathname}${location.search}`)
    }, [location.pathname, location.search])

    return null
}

function AnimatedOutlet() {
    const location = useLocation()
    const outlet = useOutlet()
    const reduce = useReducedMotion()
    const presence = routePresenceProps(reduce)

    return (
        <AnimatePresence mode="wait">
            <motion.div key={location.pathname} className="min-h-screen" {...presence}>
                {outlet}
            </motion.div>
        </AnimatePresence>
    )
}

function App() {
    return (
        <BrowserRouter>
            <AnalyticsTracker />
            <Routes>
                <Route element={<AnimatedOutlet />}>
                    <Route path="/" element={<HomePage />} />
                    <Route
                        path="/share/:fileId"
                        element={(
                            <Suspense fallback={<RouteFallback />}>
                                <SharePage />
                            </Suspense>
                        )}
                    />
                    <Route
                        path="/s/:shortId"
                        element={(
                            <Suspense fallback={<RouteFallback />}>
                                <SharePage />
                            </Suspense>
                        )}
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
