import { Link } from 'react-router-dom'
import { Shield, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export default function Header() {
    const { theme, toggleTheme } = useTheme()

    return (
        <header className="w-full px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity">
                    <Shield className="w-8 h-8" />
                    <span className="text-2xl font-bold">SecureShare</span>
                </Link>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg glass-card glass-hover text-white"
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
