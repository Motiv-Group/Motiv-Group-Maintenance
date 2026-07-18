/** Narrow an unknown thrown value to a display string (same shape as
 *  components/regional/rm-actions/shared.tsx — candidate for lib/ consolidation). */
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
