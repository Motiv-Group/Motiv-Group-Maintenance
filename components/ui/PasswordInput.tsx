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
              auth ? 'text-[13px] mb-2 text-gray-300' : 'text-gray-700 dark:text-gray-300'
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
              // Right padding lives in each branch (asymmetric) so it always clears
              // the eye toggle — a shared pr-* would be overridden by the branch's px-*.
              'w-full rounded-lg text-sm transition-colors focus:outline-none',
              auth
                ? cn(
                    // Identical to the email field; gray-400 placeholder clears WCAG on #20242E.
                    'h-12 pl-3.5 pr-12 border rounded-[10px] bg-[#20242E] text-[#F4F6FA] placeholder:text-gray-400',
                    'transition-[color,border-color,box-shadow] hover:border-white/20',
                    'focus:border-[#4C8DFF] focus:shadow-[0_0_0_3px_rgba(76,141,255,0.14)]',
                    error
                      ? 'border-[#E5714E] focus:border-[#E5714E] focus:shadow-[0_0_0_3px_rgba(229,113,78,0.16)]'
                      : 'border-white/[0.09]'
                  )
                : cn(
                    'pl-3 pr-10 py-2 border shadow-sm placeholder-gray-400',
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
              'absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition-colors',
              auth ? 'text-gray-400 hover:text-gray-100 hover:bg-white/[0.06]' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            )}
            tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff size={auth ? 18 : 16} /> : <Eye size={auth ? 18 : 16} />}
          </button>
        </div>
        {/* Auth fields reserve a single fixed-height message row (error takes
            priority over the Caps-Lock hint) so nothing below ever shifts. */}
        {auth ? (
          <p role="status" className="mt-0.5 flex min-h-[16px] items-center gap-1 text-xs leading-tight">
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
