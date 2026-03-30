import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'

const ThemeContext = createContext()

function readStoredTheme() {
    try {
        const stored = localStorage.getItem('theme')
        if (stored === 'light' || stored === 'dark') return stored
    } catch {
        /* ignore */
    }
    if (
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
        return 'dark'
    }
    return 'light'
}

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => readStoredTheme())

    useLayoutEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
        try {
            localStorage.setItem('theme', theme)
        } catch {
            /* ignore */
        }
    }, [theme])

    const toggleTheme = (clickEvent) => {
        const runToggle = () => {
            flushSync(() => {
                setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
            })
        }

        if (typeof document === 'undefined') {
            return
        }

        const reduceMotion =
            typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches

        const vt = document.startViewTransition
        if (!vt || reduceMotion) {
            runToggle()
            return
        }

        const x = clickEvent?.clientX ?? window.innerWidth / 2
        const y = clickEvent?.clientY ?? window.innerHeight / 2
        const r =
            Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 32

        document.documentElement.style.setProperty('--theme-vt-x', `${x}px`)
        document.documentElement.style.setProperty('--theme-vt-y', `${y}px`)
        document.documentElement.style.setProperty('--theme-vt-r', `${r}px`)

        vt.call(document, runToggle)
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
