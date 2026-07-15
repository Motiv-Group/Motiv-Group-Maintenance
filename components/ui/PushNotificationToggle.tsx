'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr.buffer
}

type Status = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

export function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only init from window/navigator feature-detection (Notification/serviceWorker/PushManager); cannot run during SSR render
      setStatus('unsupported')
      return
    }

    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }

    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setStatus(sub ? 'subscribed' : 'unsubscribed'))
      .catch(() => setStatus('unsubscribed'))
  }, [])

  async function enable() {
    setStatus('loading')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); return }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      })

      const json = sub.toJSON() as any
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh:   json.keys.p256dh,
          auth:     json.keys.auth,
        }),
      })
      setStatus('subscribed')
    } catch {
      setStatus('unsubscribed')
    }
  }

  async function disable() {
    setStatus('loading')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const { endpoint } = sub.toJSON() as any
        await sub.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        })
      }
      setStatus('unsubscribed')
    } catch {
      setStatus('unsubscribed')
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={14} className="animate-spin" /> Checking…
      </div>
    )
  }

  if (status === 'unsupported') {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 italic">
        Push notifications are not supported on this browser.
      </p>
    )
  }

  if (status === 'denied') {
    return (
      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        Notifications are blocked. Go to your browser or phone <strong>Settings → Site Permissions</strong> and allow notifications for this site.
      </div>
    )
  }

  if (status === 'subscribed') {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <Bell size={14} className="text-[#f59e0b]" /> Push Notifications
          </p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Enabled on this device</p>
        </div>
        <button
          onClick={disable}
          className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 transition-colors"
        >
          <BellOff size={12} /> Disable
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <BellOff size={14} className="text-gray-400" /> Push Notifications
        </p>
        <p className="text-xs text-gray-400 mt-0.5">Not enabled on this device</p>
      </div>
      <button
        onClick={enable}
        className="flex items-center gap-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg px-3 py-1.5 transition-colors"
      >
        <Bell size={12} /> Enable
      </button>
    </div>
  )
}
