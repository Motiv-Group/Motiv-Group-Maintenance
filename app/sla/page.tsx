import Link from 'next/link'
import { SLA_VERSION } from '@/lib/sla'

export const metadata = { title: 'Supplier Service Level Agreement — Motiv' }

// NOTE: SA-law-aware TEMPLATE. Replace every [bracketed] placeholder and have it
// reviewed by a legal professional before a public launch. A starting point, not
// legal advice. Version lives in lib/sla.ts (page files may not export consts).

// The timing matrix mirrors the live SLA engine (lib/health/constants.ts
// FALLBACK_SLA + the seeded sla_rules rows). The contract MUST match what the
// engine measures, or suppliers get breached against numbers they never agreed
// to. If sla_rules change, update this table AND bump SLA_VERSION.
const PRIORITY_ROWS = [
  {
    p: 'P1 — Emergency',
    examples: 'Cannot trade, safety risk (e.g. no power to the site, gas leak, flooding)',
    response: '1 hour',
    attendance: '4 hours',
    quote: '4 hours',
    resolution: '24 hours [DECISION — engine currently 4h; see clause 4.3]',
  },
  {
    p: 'P2 — Urgent',
    examples: 'Trading affected (e.g. one fridge down, partial power failure)',
    response: '4 hours',
    attendance: '8 hours',
    quote: '8 hours',
    resolution: '48 hours [DECISION — engine currently 24h; see clause 4.3]',
  },
  {
    p: 'P3 — Standard',
    examples: 'Customer-visible or staff-inconvenience faults',
    response: '24 hours',
    attendance: '48 hours',
    quote: '48 hours',
    resolution: '5 days',
  },
  {
    p: 'P4 — Low',
    examples: 'Cosmetic / no operational impact',
    response: '48 hours',
    attendance: '5 days',
    quote: '5 days',
    resolution: '7 days',
  },
]

function S({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-base mb-1">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

export default function SlaPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 text-gray-800 dark:text-gray-200">
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        ⚠️ Template — replace every bracketed detail and have a legal professional review before launch.
      </div>

      <h1 className="text-2xl font-bold mb-2">Supplier Service Level Agreement</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Version {SLA_VERSION} · Last updated: [DATE]
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <p>
          This Service Level Agreement (the “SLA”) is entered into between <strong>[Company legal name]</strong>{' '}
          (registration no. [reg no.], “Motiv”) and the supplier accepting it electronically during onboarding
          (the “Supplier”). It governs all maintenance work the Supplier accepts through the Motiv platform
          (the “Platform”), whether for Motiv’s network clients or individual customers. Acceptance is recorded
          electronically (name, date, time and version) and constitutes a binding signature under the Electronic
          Communications and Transactions Act, 2002 (ECTA).
        </p>

        <S title="1. Definitions">
          <p><strong>“Job”</strong> — a maintenance ticket assigned to, or accepted by, the Supplier on the Platform.</p>
          <p><strong>“First response”</strong> — the Supplier acknowledging a Job on the Platform (accept, decline, or
          propose a visit time).</p>
          <p><strong>“Attendance”</strong> — a qualified technician physically on site.</p>
          <p><strong>“Resolution”</strong> — the fault remedied and completion evidence submitted (clause 6).</p>
          <p><strong>“Make safe”</strong> — immediate temporary measures that remove danger or stop ongoing damage,
          even where the permanent repair follows later.</p>
          <p><strong>“Business hours”</strong> — [07:00–18:00, Monday to Saturday, excluding SA public holidays].</p>
        </S>

        <S title="2. Priority levels & response times">
          <p>
            Every Job carries a priority (P1–P4) derived from its operational impact. The Supplier commits to the
            following targets, measured by the Platform from the moment the Job is assigned:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-300 dark:border-gray-700">
                  <th className="py-2 pr-2 font-semibold">Priority</th>
                  <th className="py-2 pr-2 font-semibold">Typical examples</th>
                  <th className="py-2 pr-2 font-semibold">First response</th>
                  <th className="py-2 pr-2 font-semibold">Attendance</th>
                  <th className="py-2 pr-2 font-semibold">Quote due</th>
                  <th className="py-2 font-semibold">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {PRIORITY_ROWS.map(r => (
                  <tr key={r.p} className="border-b border-gray-200 dark:border-gray-800 align-top">
                    <td className="py-2 pr-2 font-medium whitespace-nowrap">{r.p}</td>
                    <td className="py-2 pr-2">{r.examples}</td>
                    <td className="py-2 pr-2">{r.response}</td>
                    <td className="py-2 pr-2">{r.attendance}</td>
                    <td className="py-2 pr-2">{r.quote}</td>
                    <td className="py-2">{r.resolution}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            P1 targets run <strong>24/7/365</strong>. P2 targets run during an extended day of
            [07:00–19:00, Monday–Saturday]. P3 and P4 targets are measured in business hours/days.
            [DECISION — the Platform currently measures all targets on a wall-clock basis; align the engine or
            this clause before launch.]
          </p>
        </S>

        <S title="3. Emergency (P1) obligations">
          <p>
            On any P1 Job the Supplier must <strong>make safe on first attendance</strong>: isolate the hazard,
            prevent further damage, and restore trading capability where reasonably possible, even if the permanent
            repair requires parts or a return visit. The permanent repair then completes within the P1 resolution
            window, or within a revised schedule agreed under clause 5.
          </p>
        </S>

        <S title="4. Quotes">
          <p>4.1 Where a quote is required, it is submitted on the Platform by the quote-due deadline — normally
          from the assessment made during first attendance (attendance and quoting share the same visit unless
          otherwise agreed).</p>
          <p>4.2 Quotes state whether the Supplier is VAT-registered and, where applicable, show VAT separately.
          Quoted amounts are binding for [30] days.</p>
          <p>4.3 The resolution clock is <strong>adjusted</strong> when a quote/approval cycle applies: on approval
          of a quote and acceptance of a proposed schedule, the agreed date becomes the resolution deadline. Meeting
          an agreed schedule is never a breach.</p>
          <p>4.4 Work may not begin before the client approves the quote, except make-safe measures under clause 3.</p>
        </S>

        <S title="5. Scheduling">
          <p>5.1 The Supplier proposes visit times on the Platform. A proposed time beyond the priority window
          requires the client’s acceptance; once accepted it becomes the binding deadline.</p>
          <p>5.2 Missed confirmed appointments without at least [4 hours’] notice count as an SLA breach and are
          visible in the Supplier’s performance record.</p>
        </S>

        <S title="6. Completion evidence">
          <p>Every Job closes with evidence submitted on the Platform: before and after photos; a Certificate of
          Compliance (COC) where the work is regulated (electrical, gas, plumbing as applicable); and the invoice.
          Sign-off is withheld until evidence is complete. Fraudulent or misleading evidence is a material breach
          and grounds for immediate removal (clause 12).</p>
        </S>

        <S title="7. Snags & rework">
          <p>7.1 If a completed Job fails inspection or the fault recurs within the warranty period (clause 8),
          a snag is raised on the Platform. The Supplier proposes a rework date <strong>within [the original
          priority’s attendance window]</strong> of the snag being assigned, and completes rework at
          <strong> no additional charge</strong> where the failure results from the Supplier’s workmanship
          or materials.</p>
          <p>7.2 Repeated snags on the same Job, or a pattern of snags across Jobs, affect the Supplier’s
          performance rating and may trigger review under clause 12.</p>
        </S>

        <S title="8. Warranty">
          <p>Workmanship is guaranteed for [90 days / 6 months] from sign-off; materials carry the manufacturer’s
          warranty. Statutory warranties under the Consumer Protection Act, 2008 apply to consumer clients and are
          not limited by this SLA.</p>
        </S>

        <S title="9. Variations">
          <p>Additional work beyond an approved quote requires a variation order submitted and approved on the
          Platform <em>before</em> the additional work is performed. Unapproved extras are not payable.</p>
        </S>

        <S title="10. SLA clock pauses">
          <p>The SLA clock pauses only for: (a) the client’s quote/sign-off decisions; (b) a schedule the client
          has accepted; (c) documented parts lead time the client has approved on the Platform; (d) denied site
          access documented at the time; (e) force majeure. Pauses claimed after the fact without contemporaneous
          Platform records do not apply.</p>
        </S>

        <S title="11. Compliance, insurance & tax">
          <p>11.1 The Supplier holds and maintains all licences and registrations required for its trades
          [e.g. Department of Employment and Labour electrical contractor registration, PIRB for plumbing, SAQCC
          for gas], and supplies proof on request and during account verification.</p>
          <p>11.2 The Supplier maintains public liability insurance of at least R[amount] and, where it employs
          staff, COIDA registration. Certificates are supplied during verification and on renewal.</p>
          <p>11.3 If VAT-registered, the Supplier provides its VAT number and issues compliant tax invoices.</p>
          <p>11.4 Only technicians registered on the Platform (with [ID/qualification] on file) attend Jobs.</p>
        </S>

        <S title="12. Performance management & removal">
          <p>12.1 The Platform measures the targets in clause 2 and client ratings automatically; the Supplier can
          view its record at any time.</p>
          <p>12.2 Sustained breaches — [three] SLA breaches in a rolling [30-day] window, an average rating below
          [3.0], or any material breach (fraud, safety negligence, unlicensed work) — entitle Motiv to suspend new
          Job assignment, require a remediation plan, or remove the Supplier from the network. Jobs in progress are
          completed or handed over safely.</p>
        </S>

        <S title="13. Payment">
          <p>Client invoices are settled within [30] days of an approved sign-off, subject to complete evidence
          (clause 6). [Adjust to the actual commercial model — direct client payment vs platform-mediated.]</p>
        </S>

        <S title="14. POPIA & confidentiality">
          <p>The Supplier processes personal information encountered on Jobs (names, addresses, photos of premises)
          only to perform the Job, in line with POPIA and Motiv’s{' '}
          <Link href="/privacy" className="underline">Privacy Policy</Link>, and keeps client information
          confidential.</p>
        </S>

        <S title="15. Term & termination">
          <p>This SLA runs from acceptance until terminated by either party on [30 days’] written notice, or
          immediately by Motiv for material breach. Clauses 6–8, 11 and 14 survive termination for work already
          performed.</p>
        </S>

        <S title="16. General">
          <p>South African law governs this SLA. The parties consent to the jurisdiction of the courts of
          [jurisdiction]. This SLA, the Platform{' '}
          <Link href="/terms" className="underline">Terms of Service</Link> and the{' '}
          <Link href="/privacy" className="underline">Privacy Policy</Link> form the whole agreement; if they
          conflict, this SLA prevails for supplier work. Motiv may amend this SLA by publishing a new version —
          continued acceptance of new Jobs after re-acceptance on the Platform constitutes agreement.</p>
        </S>

        <p className="text-gray-500 dark:text-gray-400">
          Accepted electronically during supplier onboarding. The Platform records the accepting user, supplier,
          full name typed as signature, SLA version, and timestamp.
        </p>
      </div>
    </main>
  )
}
