'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Cloudflare Turnstile CAPTCHA widget (OPS-003). Renders only when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set — so the whole auth flow keeps working
// unchanged until the owner sets the key AND enables CAPTCHA in Supabase (the two
// must be flipped together: Supabase rejects auth calls lacking a token once
// CAPTCHA is on, and this widget is what produces the token).
//
// The api.js is injected here (by our own nonce'd bundle) so the strict-dynamic
// CSP trusts it; proxy.ts allows challenges.cloudflare.com in frame-src/connect-src.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

/** True when Turnstile is configured — callers use this to require a token. */
export function isTurnstileEnabled(): boolean {
  return !!SITE_KEY
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (id: string) => void
      reset: (id?: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export function Turnstile({ onToken, onLoadFailed }: {
  onToken: (token: string | null) => void
  /** Fires true when the widget itself cannot load/run (script blocked, hostname
   *  not on the site key's allowlist — e.g. Vercel previews — or Cloudflare
   *  down), false again if a retry recovers. Callers use it to FAIL OPEN
   *  client-side: submit without a token rather than hard-locking the form.
   *  Safe because Supabase-side CAPTCHA enforcement is the real gate — where
   *  it's on (production), a tokenless attempt still fails with the distinct
   *  captcha error; where it's off (dev/preview), login proceeds. */
  onLoadFailed?: (failed: boolean) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  // Keep the latest callback in a ref so the render effect can run once (mount)
  // without re-subscribing when the parent passes a fresh function each render.
  const cbRef = useRef(onToken)
  const failRef = useRef(onLoadFailed)
  useEffect(() => { cbRef.current = onToken; failRef.current = onLoadFailed })

  // App-level status so we can show a quiet loading line and a styled error
  // instead of leaking Cloudflare's raw error block into the premium card.
  //  loading → script still fetching; ready → widget mounted (its own
  //  interaction-only UI takes over); error → the widget failed to load.
  const [status, setStatusRaw] = useState<'loading' | 'ready' | 'error'>('loading')
  const setStatus = (s: 'loading' | 'ready' | 'error') => {
    setStatusRaw(s)
    failRef.current?.(s === 'error')
  }

  useEffect(() => {
    if (!SITE_KEY) return
    let cancelled = false

    const render = () => {
      if (cancelled || !boxRef.current || !window.turnstile || widgetId.current !== null) return
      widgetId.current = window.turnstile.render(boxRef.current, {
        sitekey: SITE_KEY,
        theme: 'auto',
        // Flexible fills the container width so the (rare) visible challenge
        // lines up with the inputs; interaction-only keeps it invisible unless a
        // human check is actually required — no grey block on a normal load.
        size: 'flexible',
        appearance: 'interaction-only',
        callback: (token: string) => cbRef.current(token),
        'expired-callback': () => {
          cbRef.current(null)
          try { if (widgetId.current !== null) window.turnstile?.reset(widgetId.current) } catch { /* gone */ }
        },
        'error-callback': () => { cbRef.current(null); setStatus('error') },
      })
      // Widget mounted — hand off to its own UI; drop the loading line.
      setStatus('ready')
    }

    if (window.turnstile) {
      render()
    } else {
      let script = document.querySelector<HTMLScriptElement>('script[data-turnstile]')
      if (!script) {
        script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        script.setAttribute('data-turnstile', '')
        script.addEventListener('error', () => { if (!cancelled) setStatus('error') })
        document.head.appendChild(script)
      }
      script.addEventListener('load', render)
    }

    return () => {
      cancelled = true
      try {
        if (widgetId.current !== null && window.turnstile) window.turnstile.remove(widgetId.current)
      } catch { /* widget already gone */ }
      widgetId.current = null
    }
  }, [])

  const retry = () => {
    setStatus('loading')
    try {
      if (widgetId.current !== null && window.turnstile) {
        window.turnstile.reset(widgetId.current)
        setStatus('ready')
      }
    } catch { /* will re-render on next mount */ }
  }

  if (!SITE_KEY) return null

  return (
    <div>
      {/* Widget host. Collapses to nothing when the check passes invisibly
          (empty:hidden). When a real challenge iframe IS injected it fills the
          input width and gets a soft dark frame + 10px radius to match the
          fields — never a harsh contrasting border. Hidden while erroring so
          Cloudflare's own error UI never shows through our styled message. */}
      <div
        ref={boxRef}
        className={cn(
          'empty:hidden overflow-hidden rounded-[10px]',
          '[&:has(iframe)]:border [&:has(iframe)]:border-white/[0.08] [&:has(iframe)]:bg-[#20242E]/50',
          status === 'error' && 'hidden',
        )}
      />
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-gray-600 border-t-gray-300" />
          Verifying your browser…
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center justify-between gap-4 rounded-[10px] border border-[#E5714E]/40 bg-[#E5714E]/10 px-3 py-2.5 text-[13px] text-[#F0A98C]">
          <span>Verification couldn’t load — you can continue without it.</span>
          <button
            type="button"
            onClick={retry}
            className="shrink-0 font-semibold text-[#F4B79E] underline underline-offset-2 transition-colors hover:text-white"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
