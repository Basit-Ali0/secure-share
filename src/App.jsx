import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import HomePage from './pages/HomePage'
import SharePage from './pages/SharePage'
import { trackPageView } from './lib/analytics.js'
import { routePresenceProps } from './lib/motionPresets.js'

function AnalyticsTracker() {
    const location = useLocation()

    useEffect(() => {
        trackPageView(`${location.pathname}${location.search}`)
    }, [location.pathname, location.search])

    return null
}

function AnimatedOutlet() {
    const location = useLocation()
    const reduce = useReducedMotion()
    const presence = routePresenceProps(reduce)

    return (
        <AnimatePresence mode="wait">
            <motion.div key={location.pathname} className="min-h-screen" {...presence}>
                <Outlet />
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
                    <Route path="/share/:fileId" element={<SharePage />} />
                    <Route path="/s/:shortId" element={<SharePage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
