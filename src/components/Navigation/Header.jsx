import { Link } from 'react-router-dom'
import { Shield, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export default function Header() {
    const { theme, toggleTheme } = useTheme()

    return (
        <header className="w-full px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-lg">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2 text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                    <Shield className="w-8 h-8" />
                    <span className="text-2xl font-bold">SecureShare</span>
                </Link>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg glass-card glass-hover text-gray-900 dark:text-white"
                    aria-label="Toggle theme"
                >
                    {theme === 'light' ? (
                        <Moon className="w-5 h-5" />
                    ) : (
                        <Sun className="w-5 h-5" />
                    )}
                </button>
            </div>
        </header>
    )
}
