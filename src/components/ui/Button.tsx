import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows an inline spinner and disables the button while true. */
  loading?: boolean
  /** Optional icon rendered to the left of children. */
  icon?: ReactNode
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-accent-pink to-accent-violet text-white border border-accent-pink/50 ' +
    'hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] ' +
    'shadow-md shadow-accent-pink/20',
  ghost:
    'bg-transparent text-text-secondary border border-transparent ' +
    'hover:bg-dark-elevated/60 hover:text-text-primary hover:border-dark-border/40',
  danger:
    'bg-transparent text-accent-pink border border-accent-pink/30 ' +
    'hover:bg-accent-pink/10 hover:border-accent-pink/60 active:scale-[0.98]',
  outline:
    'bg-dark-elevated/60 text-text-secondary border border-dark-border/60 ' +
    'hover:bg-dark-elevated hover:border-accent-violet/40 hover:text-text-primary',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs gap-1.5 rounded-lg',
  md: 'px-3.5 py-1.5 text-sm gap-2 rounded-xl',
  lg: 'px-5 py-2.5 text-base gap-2.5 rounded-xl',
}

const spinnerSizes: Record<ButtonSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
}

/**
 * Reusable button component matching the Drift dark glassmorphic design system.
 */
export function Button({
  variant = 'outline',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center font-medium',
        'transition-all duration-150 cursor-pointer select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <Spinner size={spinnerSizes[size]} />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  )
}
