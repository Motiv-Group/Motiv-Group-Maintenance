'use client'

import { forwardRef, useState, type InputHTMLAttributes, type KeyboardEvent, type FocusEvent } from 'react'
import { Eye, EyeOff, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  /** 'auth' → softened dark field with a blue focus ring (see Input). */
  tone?: 'default' | 'auth'
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, error, id, tone = 'default', onKeyUp, onKeyDown, onFocus, onBlur, ...props }, ref) => {
    const [show, setShow] = useState(false)
    // Caps-Lock hint: getModifierState is only available on key/mouse events, so
    // we sample it on key up/down while the field is focused. It stays until the
    // key toggles it off or the field loses focus.
    const [capsOn, setCapsOn] = useState(false)
    const [focused, setFocused] = useState(false)
    const auth = tone === 'auth'

    const sampleCaps = (e: KeyboardEvent<HTMLInputElement>) => {
      if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'))
    }

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
            onKeyDown={e => { sampleCaps(e); onKeyDown?.(e) }}
            onKeyUp={e => { sampleCaps(e); onKeyUp?.(e) }}
            onFocus={e => { setFocused(true); onFocus?.(e) }}
            onBlur={(e: FocusEvent<HTMLInputElement>) => { setFocused(false); setCapsOn(false); onBlur?.(e) }}
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
        {/* Auth fields reserve a single fixed-height message row (error takes
            priority over the Caps-Lock hint) so nothing below ever shifts. */}
        {auth ? (
          <p role="status" className="mt-1 flex min-h-[18px] items-center gap-1 text-xs leading-tight">
            {error
              ? <span className="text-red-400">{error}</span>
              : capsOn && focused
                ? <span className="flex items-center gap-1 text-amber-400"><TriangleAlert size={13} className="shrink-0" /> Caps Lock is on</span>
                : null}
          </p>
        ) : (
          <>
            {capsOn && focused && (
              <p role="status" className="mt-1 flex items-center gap-1 text-xs text-amber-500 dark:text-amber-400">
                <TriangleAlert size={13} className="shrink-0" /> Caps Lock is on
              </p>
            )}
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </>
        )}
      </div>
    )
  }
)
PasswordInput.displayName = 'PasswordInput'
