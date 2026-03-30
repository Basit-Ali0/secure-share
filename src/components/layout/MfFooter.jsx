import { Link } from 'react-router-dom'

export default function MfFooter({ showSendLink = false }) {
    return (
        <footer className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-mf-border px-6 py-5 font-mono text-[11px] text-mf-ink-muted md:flex-row md:px-12">
            <div>
                Made with <span className="text-mf-accent">♥</span> by Basit
            </div>
            {showSendLink ? (
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 uppercase tracking-[0.08em] text-mf-ink-muted no-underline transition-colors hover:text-mf-accent"
                >
                    Send a file
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                    </svg>
                </Link>
            ) : null}
        </footer>
    )
}
