interface SpinnerProps {
  /** Size in pixels. Defaults to 16. */
  size?: number
  /** Tailwind color class for the spinning arc. Defaults to current text color. */
  className?: string
}

/**
 * Lightweight CSS-only spinner — no additional dependencies.
 * Uses border-trick animation consistent with the dark glassmorphic theme.
 */
export function Spinner({ size = 16, className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
