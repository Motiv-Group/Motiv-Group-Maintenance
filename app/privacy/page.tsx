import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — Motiv' }

// NOTE: POPIA-aware TEMPLATE. Replace every [bracketed] placeholder and have it
// reviewed by a legal professional before a public launch. A starting point, not
// legal advice.
function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-base mb-1">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-gray-800 dark:text-gray-200">
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        ⚠️ Template — replace every bracketed detail and have a legal professional review before launch.
      </div>

      <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: [DATE]</p>

      <div className="space-y-6 text-sm leading-relaxed">
        <p>
          This policy explains how <strong>[Company legal name]</strong> (registration no. [reg no.], “Motiv”, “we”,
          “us”) collects, uses, shares and protects your personal information when you use the Motiv maintenance
          ticketing and quoting platform (the “Service”), in line with South Africa’s Protection of Personal
          Information Act, 2013 (POPIA). By using the Service you acknowledge this policy.
        </p>

        <S title="1. Information we collect">
          <p><strong>Account &amp; profile:</strong> name, email address, phone number, role, the company / store /
          region you are linked to, and (for suppliers) trade and qualification details.</p>
          <p><strong>Operational content:</strong> maintenance tickets, descriptions, quotes and amounts,
          completion certificates (COCs), photos and documents you upload, ratings, and audit-trail actions.</p>
          <p><strong>Messaging intake (optional):</strong> if you log a ticket via WhatsApp, the message text and any
          voice note you send, which are transcribed to create the ticket.</p>
          <p><strong>Technical:</strong> device push-notification tokens, log/usage data, and cookies necessary to
          keep you signed in.</p>
        </S>

        <S title="2. Why we process it, and our lawful basis (POPIA)">
          <p>We process your information to operate the ticketing and quoting workflow, route notifications to the
          right people, produce dashboards and reports, and keep the Service secure. Our lawful bases are: the
          <strong> performance of our contract</strong> with you or your organisation; our <strong>legitimate
          interest</strong> in running and securing the Service and keeping accurate operational records; your
          <strong> consent</strong> where required (e.g. optional messaging/AI intake); and compliance with
          <strong> legal obligations</strong>.</p>
        </S>

        <S title="3. Automated processing">
          <p>The Service computes health / SLA / priority scores automatically from ticket data to help prioritise
          work. These do not make legal decisions about you. [Describe/limit any automated decision-making per
          POPIA s.71 if applicable.]</p>
        </S>

        <S title="4. Who we share it with">
          <p>Other authorised users within your organisation (managers, suppliers) as the workflow requires, and our
          <strong> operators (processors)</strong> who process data on our behalf under contract: <strong>Supabase</strong>
          (database, authentication, file storage), <strong>Vercel</strong> (hosting), <strong>Upstash</strong>
          (rate-limiting), <strong>Sentry</strong> (error monitoring), <strong>Resend</strong> (email),
          <strong> Groq</strong> (AI transcription/extraction for WhatsApp intake), and <strong>Meta / WhatsApp</strong>
          (messaging). <strong>We do not sell your personal information.</strong></p>
        </S>

        <S title="5. Cross-border transfer">
          <p>Some of our operators (e.g. Supabase, Vercel, Sentry, Groq) may store or process data on servers
          <strong> outside South Africa</strong>. Where that happens we rely on POPIA s.72 — the recipient is bound by
          contract and laws providing an adequate level of protection. [Confirm your hosting regions and safeguards.]</p>
        </S>

        <S title="6. How we secure it">
          <p>Encryption in transit (HTTPS/TLS); database Row-Level Security isolating each organisation’s data;
          role-based access controls; private file storage served via short-lived signed links; rate limiting; and
          error monitoring. No system is perfectly secure, but we take reasonable technical and organisational
          measures as required by POPIA.</p>
        </S>

        <S title="7. Retention">
          <p>We keep operational records (tickets, quotes, completions) for as long as needed for business, warranty
          and legal purposes. When you delete your account we erase your personal details (name, email, phone) and
          disable sign-in, but may retain anonymised operational history. [State your specific retention periods.]</p>
        </S>

        <S title="8. Your rights (POPIA)">
          <p>You may <strong>access</strong>, <strong>correct</strong> or <strong>delete</strong> your personal
          information, <strong>object</strong> to processing, and <strong>complain</strong>. You can download a copy
          of your data or delete your account any time from{' '}
          <Link href="/settings" className="text-brand-600 dark:text-brand-400 underline">Settings → Privacy &amp; your data</Link>.
          You may also lodge a complaint with the Information Regulator (South Africa) —
          enquiries: [POPIAComplaints@inforegulator.org.za].</p>
        </S>

        <S title="9. Direct marketing">
          <p>We will only send you electronic marketing with your consent or as permitted by POPIA s.69, and every
          such message will let you opt out. [Remove this section if you do not do marketing.]</p>
        </S>

        <S title="10. Cookies">
          <p>We use only the cookies necessary to keep you authenticated and remember your theme preference. We do not
          use third-party advertising or tracking cookies. [Update if this changes.]</p>
        </S>

        <S title="11. Children">
          <p>The Service is a business tool not intended for children under 18, and we do not knowingly collect their
          personal information.</p>
        </S>

        <S title="12. Changes">
          <p>We may update this policy; material changes will be notified in-app or by email, and the “last updated”
          date above will change.</p>
        </S>

        <S title="13. Information Officer &amp; contact">
          <p>Information Officer: [Name], [email], [phone], [physical address]. General privacy queries: [email].</p>
        </S>

        <p className="pt-4">
          <Link href="/terms" className="text-brand-600 dark:text-brand-400 underline">Terms of Service</Link>
        </p>
      </div>
    </main>
  )
}
