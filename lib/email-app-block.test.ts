import { describe, it, expect } from 'vitest'
import { renderBrandedEmail } from '@/lib/email'
import type { EmailLogo } from '@/lib/emails/defaults'
import type { EmailCopy } from '@/lib/settings'

const LOGO: EmailLogo = { symbolUrl: 'x', symbolW: 30, symbolH: 30, wordmarkUrl: 'y', wordmarkW: 60, wordmarkH: 20 }
const COPY: EmailCopy = { subject: 'S', heading: 'H', lead: 'L', sub: '', ctaLabel: 'Set password', footerNote: 'F' }

describe('invite email "Get the app" block', () => {
  it('shows both the Android download link and the browser link', () => {
    const { html, text } = renderBrandedEmail(COPY, { logo: LOGO, link: 'https://app/confirm', app: { downloadUrl: 'https://play.google.com/x', browserUrl: 'https://app.motiv' } })
    expect(html).toContain('Get the app')
    expect(html).toContain('https://play.google.com/x')
    expect(html).toContain('https://app.motiv')
    expect(text).toContain('On your phone (Android): https://play.google.com/x')
    expect(text).toContain('In your browser: https://app.motiv')
  })

  it('omits the app block entirely when no links are set', () => {
    const { html } = renderBrandedEmail(COPY, { logo: LOGO, link: 'https://app/confirm' })
    expect(html).not.toContain('Get the app')
  })

  it('shows only the browser link when no download URL', () => {
    const { html } = renderBrandedEmail(COPY, { logo: LOGO, link: 'https://app/confirm', app: { downloadUrl: null, browserUrl: 'https://app.motiv' } })
    expect(html).toContain('Get the app')
    expect(html).toContain('use it in your browser')
    expect(html).not.toContain('Download the Android app')
  })
})
