import type { ReactNode } from 'react'

/**
 * Render an address/location as a link that opens Google Maps in a new tab.
 * Use anywhere a physical location is displayed so it's tappable for directions.
 */
export function MapLink({ address, className = '', children }: { address: string; className?: string; children?: ReactNode }) {
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children ?? address}
    </a>
  )
}
