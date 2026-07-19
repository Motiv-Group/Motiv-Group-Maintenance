import { describe, it, expect } from 'vitest'
import { extractTotalsFromText, parseZar } from './quote-extract'

// Regression suite built from the totals blocks of five real supplier quotes
// that previously failed (or mis-parsed catastrophically). Only the synthetic
// totals-line layouts are kept here — not the documents.

describe('parseZar', () => {
  it('parses SA formats', () => {
    expect(parseZar('804,661.17')).toBe(804661.17)
    expect(parseZar('R 804 661,17')).toBe(804661.17)
    expect(parseZar('198 809,60')).toBe(198809.6)
    expect(parseZar('925360.46')).toBe(925360.46)
  })
})

describe('extractTotalsFromText — real quote layouts', () => {
  it('label-first classic: Subtotal / TOTAL VAT / TOTAL ZAR', () => {
    const t = 'Travelling 1.00 4,316.00 15% 4,316.00 Subtotal 54,075.58 TOTAL VAT 8,111.34 TOTAL ZAR 62,186.92 Terms'
    expect(extractTotalsFromText(t)).toEqual({ amount: 54075.58, amount_incl_vat: 62186.92, confident: true })
  })

  it('two-word "Sub Total": the generic Total must not read the excl figure as incl', () => {
    const t = 'Installation & Sundries R 6 885.00 Sub Total R 36 091.60 VAT @15% R 5 413.74 Total R 41 505.34 Bank Details'
    expect(extractTotalsFromText(t)).toEqual({ amount: 36091.6, amount_incl_vat: 41505.34, confident: true })
  })

  it('column-extracted layout: amounts BEFORE their labels (triple scan)', () => {
    const t = 'Consumables / Smalls 6 750,45R 198 809,60R 29 821,44R 228 631,03R QUOTATION Customer : Banking Details SUB TOTAL VAT 15% : Total Including VAT : *TERMS 70% deposit'
    expect(extractTotalsFromText(t)).toEqual({ amount: 198809.6, amount_incl_vat: 228631.03, confident: true })
  })

  it('VAT registration number is never read as a VAT amount', () => {
    const t = 'Att: RINUS VAT no 4600243721 Reg no 2013/175728/07 Unit Price Qty Total 1 SHOPFITTING (EX VAT) ea. 198 809,60R 1,00 198 809,60R 504 427,52R VAT 15 % 75 664,13R TOTAL COST INCLUSIVE 580 091,64R SUB TOTAL EX VAT'
    const r = extractTotalsFromText(t)
    expect(r.confident).toBe(true)
    expect(r.amount).toBe(504427.52)
    expect(r.amount_incl_vat).toBe(580091.64)
  })

  it('a table-header "Total" followed by a qty never becomes the total', () => {
    // No real totals block at all → must return not-confident, not "Total 1".
    const t = 'Unit Price Qty Total 1 Widget ea. 100,00R 1,00 100,00R VAT no 4600243721'
    expect(extractTotalsFromText(t).confident).toBe(false)
  })

  it('non-VAT supplier: single labelled total, no VAT mention', () => {
    const t = 'Callout and repair work as discussed. Total R 3 450.00 Banking details: FNB'
    expect(extractTotalsFromText(t)).toEqual({ amount: 3450, amount_incl_vat: null, confident: true })
  })

  it('excl + VAT derives incl by exact arithmetic', () => {
    const t = 'Sub-total (ex VAT) R 10 000.00 VAT amount R 1 500.00 Thank you'
    expect(extractTotalsFromText(t)).toEqual({ amount: 10000, amount_incl_vat: 11500, confident: true })
  })
})
