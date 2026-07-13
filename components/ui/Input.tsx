import { cn } from '@/lib/utils'
import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /**
   * 'auth' → the softened dark field used across the auth pipeline: background a
   * touch lighter than the card, neutral grey border, white text, muted
   * placeholder and a blue focus ring. Opt-in so the change stays scoped to the
   * auth pages and never ripples into the rest of the app's forms.
   */
  tone?: 'default' | 'auth'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, tone = 'default', ...props }, ref) => {
    const auth = tone === 'auth'
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className={cn(
              'block text-sm font-medium mb-1.5',
              auth ? 'text-gray-300' : 'text-gray-700 dark:text-gray-300'
            )}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-lg text-sm transition-colors focus:outline-none',
            auth
              ? cn(
                  // gray-400 placeholder clears WCAG 4.5:1 on the #20222b field.
                  'px-4 py-3 border bg-[#20222b] text-white placeholder:text-gray-400',
                  'focus:ring-2 focus:ring-blue-500 focus:border-blue-500/60',
                  error ? 'border-red-500/70' : 'border-[#343742]'
                )
              : cn(
                  'px-3 py-2 border shadow-sm placeholder-gray-400',
                  'bg-white dark:bg-gray-700 text-gray-900 dark:text-white',
                  'focus:ring-2 focus:ring-brand-500 focus:border-transparent',
                  error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                ),
            className
          )}
          {...props}
        />
        {/* Auth fields reserve a fixed-height message row so validation text never
            shifts the card/controls; default tone renders only when present. */}
        {auth
          ? <p className="mt-0.5 min-h-[16px] text-xs leading-tight text-red-400">{error ?? ''}</p>
          : (error && <p className="mt-1 text-xs text-red-600">{error}</p>)}
      </div>
    )
  }
)
Input.displayName = 'Input'
