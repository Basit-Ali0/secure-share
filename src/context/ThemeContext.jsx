import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        // Get from localStorage or default to light
        return localStorage.getItem('theme') || 'light'
    })

    useEffect(() => {
        // Apply theme to document
        if (theme === 'dark') {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }

        // Save to localStorage
        localStorage.setItem('theme', theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light')
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider')
    }
    return context
}
