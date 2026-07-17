'use client'

import { useEffect, useRef, useState } from 'react'
import { SwUpdateToast } from './SwUpdateToast'

export function ServiceWorkerSetup() {
  const [updateReady, setUpdateReady] = useState(false)
  const waitingRef = useRef<ServiceWorker | null>(null)
  const reloadingRef = useRef(false)
  const refreshRequestedRef = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Whether a SW already controls this page at load. The very first install
    // also fires controllerchange (via clients.claim) — we must NOT reload then,
    // only when a genuine update replaces an existing controller.
    const hadController = !!navigator.serviceWorker.controller

    const promptUpdate = (worker: ServiceWorker | null) => {
      if (!worker) return
      waitingRef.current = worker
      setUpdateReady(true)
    }

    // Reload once, when the new SW takes control after the user opts in.
    const onControllerChange = () => {
      if (reloadingRef.current) return
      if (!hadController && !refreshRequestedRef.current) return
      reloadingRef.current = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // An updated worker may already be parked when the page loads.
        if (reg.waiting && navigator.serviceWorker.controller) {
          promptUpdate(reg.waiting)
        }
        // A new worker started installing after this load.
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(reg.waiting ?? installing)
            }
          })
        })
      })
      .catch(console.error)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!updateReady) return null

  return (
    <SwUpdateToast
      onRefresh={() => {
        refreshRequestedRef.current = true
        // Ask the waiting worker to activate; the controllerchange handler above
        // performs the one-time reload once it has taken control.
        waitingRef.current?.postMessage('SKIP_WAITING')
      }}
      onDismiss={() => setUpdateReady(false)}
    />
  )
}
