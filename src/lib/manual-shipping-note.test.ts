import { describe, expect, it } from 'vitest'
import { manualShippingNote } from './manual-shipping-note'

describe('manualShippingNote', () => {
  it.each([
    ['PENDING', 'AWAITING'],
    ['SHIPPED', 'DISPATCHED'],
    ['CONFIRMED', 'DISPATCHED'],
    ['CANCELLED', 'RECORDED_ONLY'],
    [undefined, 'RECORDED_ONLY'],
  ] as const)('%s → %s', (status, want) => {
    expect(manualShippingNote(status)).toBe(want)
  })
})
