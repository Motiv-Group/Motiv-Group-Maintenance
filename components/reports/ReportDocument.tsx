import { chartUrl, type ReportModel } from '@/lib/report-data'

/**
 * Print-optimised HTML rendering of a ReportModel (used for the PDF path —
 * the user saves/prints this page to PDF). Figures and tables are numbered
 * globally and listed up front (cover → contents → figures → tables → body).
 */
export function ReportDocument({ model }: { model: ReportModel }) {
  // Pre-number figures & tables in document order.
  const figs: { n: number; caption: string }[] = []
  const tabs: { n: number; caption: string }[] = []
  let fN = 0, tN = 0
  for (const s of model.sections) {
    for (const f of s.figures ?? []) figs.push({ n: ++fN, caption: f.caption })
    for (const t of s.tables ?? []) tabs.push({ n: ++tN, caption: t.caption })
  }

  let figC = 0, tabC = 0

  return (
    <div className="report mx-auto bg-white text-gray-900" style={{ maxWidth: '800px' }}>
      {/* Cover */}
      <section className="report-cover">
        <p className="text-3xl font-bold" style={{ color: '#9a7b34' }}>Motiv</p>
        <p className="text-sm text-gray-500 mb-16">Maintenance Platform</p>
        <h1 className="text-4xl font-bold mt-24">{model.title}</h1>
        <p className="text-lg text-gray-500 mt-2 mb-12">{model.subtitle}</p>
        <p className="text-lg">Prepared for: <strong>{model.preparedFor}</strong></p>
        <p className="text-base">{model.periodLabel}</p>
        <p className="text-sm text-gray-500 mt-1">Generated: {model.generatedAt}</p>
      </section>

      {/* Contents */}
      <section className="report-section">
        <h2 className="text-xl font-bold border-b pb-1 mb-3">Table of Contents</h2>
        <ol className="list-decimal ml-6 space-y-1 text-sm">
          {model.executiveSummary && <li>Executive Summary</li>}
          {model.sections.map(s => <li key={s.heading}>{s.heading}</li>)}
        </ol>

        {figs.length > 0 && (
          <>
            <h2 className="text-xl font-bold border-b pb-1 mb-3 mt-6">Table of Figures</h2>
            <ul className="space-y-1 text-sm">
              {figs.map(f => <li key={f.n}>Figure {f.n}: {f.caption}</li>)}
            </ul>
          </>
        )}

        {tabs.length > 0 && (
          <>
            <h2 className="text-xl font-bold border-b pb-1 mb-3 mt-6">Table of Tables</h2>
            <ul className="space-y-1 text-sm">
              {tabs.map(t => <li key={t.n}>Table {t.n}: {t.caption}</li>)}
            </ul>
          </>
        )}
      </section>

      {/* Executive summary */}
      {model.executiveSummary && (
        <section className="report-section">
          <h2 className="text-xl font-bold border-b pb-1 mb-3">Executive Summary</h2>
          <p className="text-sm leading-relaxed">{model.executiveSummary}</p>
        </section>
      )}

      {/* Sections */}
      {model.sections.map((s, i) => (
        <section key={s.heading} className="report-section">
          <h2 className="text-xl font-bold border-b pb-1 mb-3">{i + 1}. {s.heading}</h2>
          {s.narrative && <p className="text-sm leading-relaxed mb-3">{s.narrative}</p>}

          {s.stats && s.stats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {s.stats.map(st => (
                <div key={st.label} className="border rounded-lg p-3">
                  <p className="text-lg font-bold">{st.value}</p>
                  <p className="text-xs text-gray-500">{st.label}</p>
                </div>
              ))}
            </div>
          )}

          {(s.figures ?? []).map(f => {
            figC++
            return (
              <figure key={f.caption} className="my-4 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={chartUrl(f.chart)} alt={f.caption} style={{ maxWidth: '100%' }} />
                <figcaption className="text-xs text-gray-500 italic mt-1">Figure {figC}: {f.caption}</figcaption>
              </figure>
            )
          })}

          {(s.tables ?? []).map(t => {
            tabC++
            return (
              <div key={t.caption} className="my-4">
                {/* Wide report tables scroll inside their own container on phones so the
                    page body never scrolls horizontally. */}
                <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm border-collapse">
                  <thead>
                    <tr>
                      {t.columns.map(c => (
                        <th key={c} className="text-left text-white px-2 py-1" style={{ background: '#9a7b34' }}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, ri) => (
                      <tr key={ri} className={ri % 2 ? 'bg-gray-50' : ''}>
                        {r.map((cell, ci) => <td key={ci} className="border px-2 py-1">{String(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                <p className="text-xs text-gray-500 italic mt-1">Table {tabC}: {t.caption}</p>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
