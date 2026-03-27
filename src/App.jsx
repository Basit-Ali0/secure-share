import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import SharePage from './pages/SharePage'
import { trackPageView } from './lib/analytics.js'

function AnalyticsTracker() {
    const location = useLocation()

    useEffect(() => {
        trackPageView(`${location.pathname}${location.search}`)
    }, [location.pathname, location.search])

    return null
}

function App() {
    return (
        <BrowserRouter>
            <AnalyticsTracker />
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/share/:fileId" element={<SharePage />} />
                <Route path="/s/:shortId" element={<SharePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App
