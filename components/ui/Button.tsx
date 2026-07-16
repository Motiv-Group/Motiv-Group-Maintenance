import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

    const variants = {
      primary:   'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500',
      secondary: 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 focus:ring-brand-500',
      danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      ghost:     'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:ring-gray-400',
      // Auth-screen primary action — colour comes from the --auth-btn CSS var set
      // by AuthShell (admin-configurable hex), defaulting to a premium blue. A
      // subtle top-light gradient + inset highlight + restrained blue shadow give
      // it depth; hover brightens + lifts 1px; the disabled state is an explicit
      // neutral (not a dimmed colour) so an incomplete form reads clearly as
      // disabled. Any admin hue still works — the overlay is a white fade. (Key
      // kept as `gold`.)
      gold:      'relative rounded-[10px] text-white font-semibold bg-[var(--auth-btn,#2f6fed)] [background-image:linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0)_58%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_10px_24px_-10px_rgba(47,111,237,0.55)] transition-[filter,transform,box-shadow] hover:brightness-105 hover:-translate-y-px hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_14px_30px_-10px_rgba(47,111,237,0.7)] active:translate-y-0 active:brightness-95 focus:ring-[var(--auth-btn,#2f6fed)] disabled:bg-none disabled:bg-[#1c1f27] disabled:text-gray-400 disabled:shadow-none disabled:translate-y-0 disabled:brightness-100 disabled:hover:brightness-100 disabled:hover:translate-y-0',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    }

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
