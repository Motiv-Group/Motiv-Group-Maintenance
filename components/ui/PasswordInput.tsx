'use client'

import { forwardRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  /** 'auth' → softened dark field with a blue focus ring (see Input). */
  tone?: 'default' | 'auth'
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, error, id, tone = 'default', ...props }, ref) => {
    const [show, setShow] = useState(false)
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
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={show ? 'text' : 'password'}
            className={cn(
              'w-full rounded-lg text-sm transition-colors focus:outline-none pr-10',
              auth
                ? cn(
                    // gray-400 placeholder clears WCAG 4.5:1 on the #20222b field.
                    'px-3.5 py-2.5 border bg-[#20222b] text-white placeholder:text-gray-400',
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
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 transition-colors',
              auth ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            )}
            tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {error && <p className={cn('mt-1 text-xs', auth ? 'text-red-400' : 'text-red-600')}>{error}</p>}
      </div>
    )
  }
)
PasswordInput.displayName = 'PasswordInput'
