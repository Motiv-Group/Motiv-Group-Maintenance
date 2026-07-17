import type { Priority } from '@/lib/types';

// ─── Enums (must mirror the web "Log a Ticket" form options exactly) ─────────
export const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'General', 'Cleaning', 'Other'] as const;
export const IMPACTS = ['none', 'cosmetic', 'customer_visible', 'staff_inconvenience', 'trading_affected', 'safety_risk', 'cannot_trade'] as const;
export type Category = typeof CATEGORIES[number];
export type OpImpact = typeof IMPACTS[number];

// Below this the AI is treated as unsure → warn the manager + flag for RM review.
export const CONFIDENCE_THRESHOLD = 0.6;

export interface ExtractedTicket {
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  operational_impact: OpImpact;
  confidence: number;
  is_issue: boolean;
}

// Exported for unit tests (pure function — clamps free-text LLM output to enums).
export function sanitiseExtracted(raw: Partial<ExtractedTicket>, fallbackDescription?: string): ExtractedTicket {
  const validPriorities: Priority[] = ['low', 'medium', 'high', 'urgent'];
  // Constrain free-text model output to our exact enums; fall back safely so a
  // bad/missing value never blocks ticket creation.
  const category: Category = (CATEGORIES as readonly string[]).includes(raw.category as string) ? (raw.category as Category) : 'General';
  const operational_impact: OpImpact = (IMPACTS as readonly string[]).includes(raw.operational_impact as string) ? (raw.operational_impact as OpImpact) : 'none';
  const confidence = typeof raw.confidence === 'number' && raw.confidence >= 0 && raw.confidence <= 1 ? raw.confidence : 0.5;
  // Default true so a missing flag never silently drops a real ticket.
  const is_issue = typeof raw.is_issue === 'boolean' ? raw.is_issue : true;
  return {
    title:       (raw.title ?? 'Maintenance request').toString().slice(0, 80),
    description: raw.description ?? fallbackDescription ?? 'No description provided',
    priority:    validPriorities.includes(raw.priority as Priority) ? (raw.priority as Priority) : 'medium',
    category,
    operational_impact,
    confidence,
    is_issue,
  };
}

// Operational impact → v3 ticket priority (P1–P4) + severity. Mirrors the
// health engine's derivation so WhatsApp tickets rank like web-form tickets.
export type V3Priority = 'P1' | 'P2' | 'P3' | 'P4';
// Exported for unit tests (pure function — mirrors the health engine's derivation).
export function impactToPriority(impact: OpImpact): { priority: V3Priority; severity: 'low' | 'medium' | 'high' | 'critical' } {
  switch (impact) {
    case 'cannot_trade':
    case 'safety_risk':       return { priority: 'P1', severity: 'critical' };
    case 'trading_affected':  return { priority: 'P2', severity: 'high' };
    case 'customer_visible':
    case 'staff_inconvenience': return { priority: 'P3', severity: 'medium' };
    default:                  return { priority: 'P4', severity: 'low' }; // cosmetic / none
  }
}
