'use client'

// Small helpers/types shared across the rm-actions domain files.

export async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Something went wrong')
}

// Narrow an unknown catch value to the message shown in the inline error banner.
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export type SupplierChoice = { id: string; name: string; avgRating?: number; ratingCount?: number; category?: string | null }

export type QuotePanelKind = 'waiting' | 'received' | 'accepted' | 'declined'

export const PANEL_META: Record<QuotePanelKind, { dot: string; label: string; txt: string }> = {
  waiting: { dot: 'bg-amber-500', label: 'Waiting for quote', txt: 'text-amber-700 dark:text-amber-400' },
  received: { dot: 'bg-emerald-500', label: 'Quote received', txt: 'text-emerald-600 dark:text-emerald-400' },
  accepted: { dot: 'bg-emerald-500', label: 'Accepted', txt: 'text-emerald-600 dark:text-emerald-400' },
  declined: { dot: 'bg-red-500', label: 'Declined', txt: 'text-red-600 dark:text-red-400' },
}
