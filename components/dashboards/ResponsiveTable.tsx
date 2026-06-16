// Responsive table → cards. One column definition drives both layouts:
//   • md+ (tablet/desktop): a normal table.
//   • < md (phones): each row becomes a stacked card — no horizontal scroll.
//
// Column roles control the mobile card:
//   title  → main line(s) (e.g. name/link)
//   badge  → top-right (e.g. RAG badge, score)
//   meta   → compact "Header: value" chips (default)
//   hideMobile → desktop-only (kept off the phone card to stay essentials-only)
//
// Server component (no client hooks) so it renders inside Server Component pages.
import type { ReactNode } from 'react'

export interface RTColumn<T> {
  header: string
  cell: (row: T) => ReactNode
  role?: 'title' | 'badge' | 'meta'
  hideMobile?: boolean
  align?: 'left' | 'right'
  minWidthCh?: number
}

interface ResponsiveTableProps<T> {
  columns: RTColumn<T>[]
  rows: T[]
  getKey: (row: T, i: number) => string
  minWidth?: number
  empty?: string
}

export function ResponsiveTable<T>({
  columns, rows, getKey, minWidth = 640, empty = 'Nothing to show.',
}: ResponsiveTableProps<T>) {
  if (rows.length === 0) return <p className="text-sm text-gray-400">{empty}</p>

  const titleCols = columns.filter(c => c.role === 'title')
  const badgeCols = columns.filter(c => c.role === 'badge')
  const metaCols  = columns.filter(c => (c.role ?? 'meta') === 'meta' && !c.hideMobile)

  return (
    <>
      {/* Tablet / desktop — full table */}
      <div className="hidden md:block overflow-x-auto -mx-2">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700">
              {columns.map((c, i) => (
                <th key={i} className={`py-2 px-2 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={getKey(row, i)} className="border-b border-gray-50 dark:border-gray-700/50 align-top">
                {columns.map((c, j) => (
                  <td key={j} className={`py-2 px-2 ${c.align === 'right' ? 'text-right' : ''}`}>{c.cell(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone — stacked cards (no horizontal scroll) */}
      <ul className="md:hidden space-y-2">
        {rows.map((row, i) => (
          <li
            key={getKey(row, i)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                {titleCols.map((c, j) => <div key={j} className="min-w-0">{c.cell(row)}</div>)}
              </div>
              {badgeCols.length > 0 && (
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {badgeCols.map((c, j) => <div key={j}>{c.cell(row)}</div>)}
                </div>
              )}
            </div>
            {metaCols.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {metaCols.map((c, j) => (
                  <span key={j} className="inline-flex items-baseline gap-1 min-w-0">
                    <span className="text-gray-400 dark:text-gray-500 shrink-0">{c.header}:</span>
                    <span className="text-gray-700 dark:text-gray-300 truncate">{c.cell(row)}</span>
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
