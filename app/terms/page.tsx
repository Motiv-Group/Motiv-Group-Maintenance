import Link from 'next/link'

export const metadata = { title: 'Terms of Service — Motiv' }

// NOTE: TEMPLATE. Replace every [bracketed] placeholder and have it reviewed by a
// legal professional before a public launch. Not legal advice.
function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-base mb-1">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-gray-800 dark:text-gray-200">
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        ⚠️ Template — replace every bracketed detail and have a legal professional review before launch.
      </div>

      <h1 className="text-2xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: [DATE]</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <p>These terms are an agreement between you and <strong>[Company legal name]</strong> (registration no.
        [reg no.], “Motiv”, “we”, “us”) governing your use of the Motiv maintenance ticketing and quoting platform
        (the “Service”). By using the Service you agree to these terms; if you use it on behalf of an organisation,
        you confirm you are authorised to bind that organisation.</p>

        <S title="1. Accounts &amp; eligibility">
          <p>Accounts are provisioned by your organisation’s administrators. You must be 18+ and provide accurate
          details. You are responsible for keeping your credentials secure and for all activity under your account,
          and must notify us promptly of any unauthorised use.</p>
        </S>

        <S title="2. Acceptable use">
          <p>Use the Service only for legitimate maintenance and quoting activities for your organisation. You must
          not: upload unlawful, infringing or malicious content; attempt to access another organisation’s data or any
          account that is not yours; probe, scan, overload or interfere with the Service or its security; or use it to
          breach any law. We may remove content or suspend access that violates this.</p>
        </S>

        <S title="3. Content &amp; intellectual property">
          <p>You retain ownership of the tickets, photos, quotes, documents and other content you submit, and grant us
          the licence needed to host, process and display it to provide the Service. We (and our licensors) retain all
          rights in the Service software, design and branding. You may not copy, resell or reverse-engineer it.</p>
        </S>

        <S title="4. Fees">
          <p>[If the Service is paid: state fees, billing cycle, taxes (VAT), and non-payment consequences. Remove this
          section if the Service is provided free / under a separate agreement.]</p>
        </S>

        <S title="5. Service availability">
          <p>We aim to keep the Service available but do not guarantee uninterrupted or error-free operation. We may
          change, suspend or discontinue features, and perform maintenance, at our discretion. [State any SLA/uptime
          commitment if you offer one.]</p>
        </S>

        <S title="6. Warranties disclaimer">
          <p>To the maximum extent permitted by law, the Service is provided <strong>“as is” and “as available”</strong>
          without warranties of any kind, express or implied, including fitness for a particular purpose. [Note: the
          Consumer Protection Act may imply rights that cannot be excluded for certain users.]</p>
        </S>

        <S title="7. Limitation of liability">
          <p>To the extent permitted by law, we are not liable for indirect, incidental or consequential loss, or loss
          of profit, data or goodwill. Our total aggregate liability arising from the Service is limited to
          <strong> [state cap — e.g. fees paid in the preceding 12 months / a fixed amount]</strong>. Nothing limits
          liability that cannot lawfully be limited.</p>
        </S>

        <S title="8. Indemnity">
          <p>You agree to indemnify us against claims and losses arising from your misuse of the Service or breach of
          these terms. [Adjust/scope per legal advice.]</p>
        </S>

        <S title="9. Suspension &amp; termination">
          <p>You may delete your account at any time from <Link href="/settings" className="text-brand-600 dark:text-brand-400 underline">Settings</Link>.
          We may suspend or terminate access for breach of these terms, legal reasons, or risk to the Service. On
          termination your right to use the Service ends; data handling follows our{' '}
          <Link href="/privacy" className="text-brand-600 dark:text-brand-400 underline">Privacy Policy</Link>.</p>
        </S>

        <S title="10. Privacy">
          <p>Your use is also governed by our{' '}
          <Link href="/privacy" className="text-brand-600 dark:text-brand-400 underline">Privacy Policy</Link>,
          which explains how we handle personal information under POPIA.</p>
        </S>

        <S title="11. Changes">
          <p>We may update these terms; material changes will be notified in-app or by email and the “last updated”
          date will change. Continued use after changes means you accept them.</p>
        </S>

        <S title="12. Governing law &amp; disputes">
          <p>These terms are governed by the laws of the Republic of South Africa, and the courts of South Africa have
          jurisdiction. [State any dispute-resolution / arbitration process.] Contact: [email], [physical address].</p>
        </S>

        <p className="pt-4">
          <Link href="/privacy" className="text-brand-600 dark:text-brand-400 underline">Privacy Policy</Link>
        </p>
      </div>
    </main>
  )
}
