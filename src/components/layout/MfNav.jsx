import { Link } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext.jsx'

function LogoMark() {
    return (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-mf-accent">
            <svg viewBox="0 0 16 16" className="h-[15px] w-[15px] fill-white" aria-hidden>
                <path d="M8 1L2 4v4c0 3.3 2.5 6.4 6 7 3.5-.6 6-3.7 6-7V4L8 1z" />
            </svg>
        </div>
    )
}

export default function MfNav({ badge = null, homeHref = '/' }) {
    const { theme, toggleTheme } = useTheme()

    return (
        <nav className="sticky top-0 z-[100] flex items-center justify-between border-b border-mf-border bg-mf-bg px-6 py-5 md:px-12">
            <Link to={homeHref} className="flex items-center gap-2.5 text-mf-ink no-underline">
                <LogoMark />
                <span className="text-[15px] font-bold tracking-tight">MaskedFile</span>
            </Link>
            <div className="flex items-center gap-4 md:gap-5">
                {badge ? (
                    <span className="hidden border border-mf-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-mf-ink-muted sm:inline">
                        {badge}
                    </span>
                ) : null}
                <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-9 w-9 items-center justify-center rounded border border-mf-border text-mf-ink-muted transition-colors hover:border-mf-ink hover:text-mf-ink"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                    <span className="material-symbols-outlined text-[20px]">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
                </button>
                <div className="flex items-center gap-4">
                    <a
                        href="https://github.com/Basit-Ali0"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-mf-ink-muted transition-colors hover:text-mf-ink"
                        aria-label="GitHub"
                    >
                        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                    </a>
                    <a
                        href="https://x.com/BasitAli"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-mf-ink-muted transition-colors hover:text-mf-ink"
                        aria-label="X"
                    >
                        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.845L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                    </a>
                </div>
            </div>
        </nav>
    )
}
