import type { DecisionCategory } from '@/lib/dashboards/decisions'

/** Tailwind classes per executive decision category. */
export const DECISION_CHIP: Record<DecisionCategory, string> = {
  'Approve':            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Escalate':          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'Fund':              'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Replace supplier':  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'Review strategy':   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'Monitor':           'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'No action required':'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}
