import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — Motiv' }

// NOTE: This is a POPIA-aware TEMPLATE. Replace the bracketed placeholders and
// have it reviewed by a legal professional before a public launch. It is a
// starting point, not legal advice.
export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-gray-800 dark:text-gray-200">
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        ⚠️ Template — replace bracketed details and have a legal professional review before launch.
      </div>

      <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: [DATE]</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <p>
          This policy explains how <strong>[Company legal name]</strong> (“Motiv”, “we”) collects, uses and protects
          your personal information when you use the Motiv maintenance platform, in line with South Africa’s
          Protection of Personal Information Act, 2013 (POPIA).
        </p>

        <section>
          <h2 className="font-semibold text-base mb-1">Information we collect</h2>
          <p>Account details (name, email, phone number), the store/region you are linked to, maintenance tickets,
          quotes, photos and documents you upload, ratings, device push-notification tokens, and technical logs.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Why we process it</h2>
          <p>To operate the ticketing and quoting workflow, notify the right people, produce reports and dashboards,
          and keep the service secure. We rely on the performance of our contract with you and our legitimate
          business interest in maintaining accurate operational records.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Who we share it with</h2>
          <p>Other authorised users within your organisation (managers, suppliers) as required by the workflow, and
          our processors — Supabase (database/storage/auth), Vercel (hosting), and messaging providers used for
          notifications. We do not sell your personal information.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Retention</h2>
          <p>We keep operational records (tickets, quotes, completions) for as long as needed for business and legal
          purposes. When you delete your account we erase your personal details but may retain anonymised
          operational history. [State your retention period.]</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Your rights</h2>
          <p>Under POPIA you may access, correct, or delete your personal information, and object to processing. You
          can download a copy of your data or delete your account from{' '}
          <Link href="/settings" className="text-brand-600 dark:text-brand-400 underline">Settings → Privacy &amp; your data</Link>.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Information Officer</h2>
          <p>[Name], [email], [phone], [address]. You also have the right to lodge a complaint with the Information
          Regulator (South Africa).</p>
        </section>

        <p className="pt-4">
          <Link href="/terms" className="text-brand-600 dark:text-brand-400 underline">Terms of Service</Link>
        </p>
      </div>
    </main>
  )
}
