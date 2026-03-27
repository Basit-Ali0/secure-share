import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App.jsx'
import './index.css'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { initAnalytics } from './lib/analytics.js'

initAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <HelmetProvider>
            <ThemeProvider>
                <App />
            </ThemeProvider>
        </HelmetProvider>
    </React.StrictMode>,
)
