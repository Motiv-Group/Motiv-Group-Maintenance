import Link from 'next/link'

export const metadata = { title: 'Terms of Service — Motiv' }

// NOTE: This is a TEMPLATE. Replace the bracketed placeholders and have it
// reviewed by a legal professional before a public launch. Not legal advice.
export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-gray-800 dark:text-gray-200">
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        ⚠️ Template — replace bracketed details and have a legal professional review before launch.
      </div>

      <h1 className="text-2xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: [DATE]</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <p>These terms govern your use of the Motiv maintenance platform operated by <strong>[Company legal name]</strong>
        (“Motiv”, “we”). By using the service you agree to them.</p>

        <section>
          <h2 className="font-semibold text-base mb-1">Accounts</h2>
          <p>Accounts are provisioned by your organisation’s administrators. You are responsible for keeping your
          login credentials secure and for activity under your account. Notify us of any unauthorised use.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Acceptable use</h2>
          <p>Use the service only for legitimate maintenance and quoting activities for your organisation. Do not
          upload unlawful content, attempt to access other organisations’ data, or interfere with the service.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Content you submit</h2>
          <p>You retain ownership of tickets, photos, quotes and documents you submit, and grant us the licence needed
          to host and process them to provide the service.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Availability &amp; liability</h2>
          <p>The service is provided “as is”. To the extent permitted by law we are not liable for indirect or
          consequential loss. [State any warranty/SLA and liability cap.]</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Termination</h2>
          <p>You may delete your account at any time from Settings. We may suspend or terminate access for breach of
          these terms.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Governing law &amp; contact</h2>
          <p>These terms are governed by the laws of the Republic of South Africa. Contact: [email], [address].</p>
        </section>

        <p className="pt-4">
          <Link href="/privacy" className="text-brand-600 dark:text-brand-400 underline">Privacy Policy</Link>
        </p>
      </div>
    </main>
  )
}
