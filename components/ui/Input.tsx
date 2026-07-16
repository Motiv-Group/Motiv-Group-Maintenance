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
              auth ? 'text-[13px] mb-2 text-gray-300' : 'text-gray-700 dark:text-gray-300'
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
                  // 48px premium field; identical email/password default. gray-400
                  // placeholder clears WCAG 4.5:1 on the #20242E field.
                  'h-12 px-3.5 border rounded-[10px] bg-[#20242E] text-[#F4F6FA] placeholder:text-gray-400',
                  'transition-[color,border-color,box-shadow] hover:border-white/20',
                  'focus:border-[#4C8DFF] focus:shadow-[0_0_0_3px_rgba(76,141,255,0.14)]',
                  error
                    ? 'border-[#E5714E] focus:border-[#E5714E] focus:shadow-[0_0_0_3px_rgba(229,113,78,0.16)]'
                    : 'border-white/[0.09]'
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
