import { describe, it, expect } from 'vitest'
import { renderBrandedEmail } from '@/lib/email'
import type { EmailLogo } from '@/lib/emails/defaults'
import type { EmailCopy } from '@/lib/settings'

const LOGO: EmailLogo = { symbolUrl: 'x', symbolW: 30, symbolH: 30, wordmarkUrl: 'y', wordmarkW: 60, wordmarkH: 20 }
const COPY: EmailCopy = { subject: 'S', heading: 'H', lead: 'L', sub: '', ctaLabel: 'Set password', footerNote: 'F' }

describe('invite email "Get the app" block', () => {
  it('renders the per-OS install steps plus optional download and browser links', () => {
    const { html, text } = renderBrandedEmail(COPY, {
      logo: LOGO,
      link: 'https://app/confirm',
      app: {
        android: 'Open in Chrome.\nTap the menu.\nAdd to Home screen.',
        ios: 'Open in Safari.\nTap Share.\nAdd to Home Screen.',
        downloadUrl: 'https://play.google.com/x',
        browserUrl: 'https://app.motiv',
      },
    })
    expect(html).toContain('Get the app')
    expect(html).toContain('On Android')
    expect(html).toContain('On iPhone / iPad')
    expect(html).toContain('Add to Home screen.')
    expect(html).toContain('https://play.google.com/x')
    expect(html).toContain('https://app.motiv')
    // Plain-text version carries the numbered steps + both links.
    expect(text).toContain('On Android:')
    expect(text).toContain('1. Open in Chrome.')
    expect(text).toContain('On iPhone / iPad:')
    expect(text).toContain('Prefer a download? https://play.google.com/x')
    expect(text).toContain('Or use it in your browser: https://app.motiv')
  })

  it('omits the app block entirely when nothing is set', () => {
    const { html } = renderBrandedEmail(COPY, { logo: LOGO, link: 'https://app/confirm' })
    expect(html).not.toContain('Get the app')
  })

  it('shows the steps and browser link but no download line when no download URL', () => {
    const { html } = renderBrandedEmail(COPY, {
      logo: LOGO,
      link: 'https://app/confirm',
      app: { android: 'Open in Chrome.', ios: 'Open in Safari.', downloadUrl: null, browserUrl: 'https://app.motiv' },
    })
    expect(html).toContain('Get the app')
    expect(html).toContain('use it in your browser')
    expect(html).not.toContain('Prefer a download?')
  })
})
