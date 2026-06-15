import type { ReportModel } from '@/lib/report-data'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_BASE    = 'https://api.groq.com/openai/v1'

/**
 * Ask Groq to write the executive summary and a short professional narrative for
 * each section, based on the computed metrics. Mutates and returns the model.
 * Degrades gracefully (returns the model unchanged) if Groq is unavailable.
 */
export async function addNarrative(model: ReportModel): Promise<ReportModel> {
  if (!GROQ_API_KEY) return model

  // Compact data digest for the model to reason over.
  const digest = model.sections.map(s => {
    const stats  = s.stats?.map(st => `${st.label}: ${st.value}`).join('; ')
    const tables = s.tables?.map(t =>
      `${t.caption} [${t.columns.join(' | ')}] ` + t.rows.slice(0, 12).map(r => r.join(' | ')).join(' ; ')
    ).join(' || ')
    return `### ${s.heading}\n${[stats, tables].filter(Boolean).join('\n')}`
  }).join('\n\n')

  const sys = `You are a professional business analyst writing a formal report for a South African facilities-maintenance platform. Write in clear, concise, professional British English. Use ZAR (R) for money. Do NOT invent numbers — only interpret the figures provided. Be specific and insight-oriented (trends, ratios, what stands out, recommended attention), not generic.`

  const user = `Report: "${model.title}" for ${model.preparedFor}. Period: ${model.periodLabel}.

DATA:
${digest}

Return ONLY a JSON object:
{
  "executiveSummary": "2-4 sentence executive summary of the period's performance",
  "sections": { "<exact section heading>": "1-3 sentence professional commentary", ... }
}
Provide commentary for every section heading listed above.`

  try {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1200,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      }),
    })
    if (!res.ok) return model
    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const parsed = JSON.parse(json.choices[0].message.content) as {
      executiveSummary?: string
      sections?: Record<string, string>
    }
    model.executiveSummary = typeof parsed.executiveSummary === 'string' ? parsed.executiveSummary : undefined
    if (parsed.sections) {
      for (const s of model.sections) {
        const n = parsed.sections[s.heading]
        if (typeof n === 'string') s.narrative = n
      }
    }
  } catch {
    // leave model without narrative
  }
  return model
}
