'use client'

import { useEffect, useRef } from 'react'

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

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  // Keep the latest callback in a ref so the render effect can run once (mount)
  // without re-subscribing when the parent passes a fresh function each render.
  const cbRef = useRef(onToken)
  useEffect(() => { cbRef.current = onToken })

  useEffect(() => {
    if (!SITE_KEY) return
    let cancelled = false

    const render = () => {
      if (cancelled || !boxRef.current || !window.turnstile || widgetId.current !== null) return
      widgetId.current = window.turnstile.render(boxRef.current, {
        sitekey: SITE_KEY,
        theme: 'auto',
        callback: (token: string) => cbRef.current(token),
        'expired-callback': () => cbRef.current(null),
        'error-callback': () => cbRef.current(null),
      })
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

  if (!SITE_KEY) return null
  return <div ref={boxRef} className="my-1 min-h-[65px]" />
}
