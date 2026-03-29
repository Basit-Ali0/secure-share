export default function MfCornerCard({ children, className = '', style }) {
    return (
        <div className={`relative border border-mf-border bg-mf-card ${className}`} style={style}>
            <span className="pointer-events-none absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-mf-accent" aria-hidden />
            <span className="pointer-events-none absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-mf-accent" aria-hidden />
            <span className="pointer-events-none absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-mf-accent" aria-hidden />
            <span className="pointer-events-none absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-mf-accent" aria-hidden />
            {children}
        </div>
    )
}
