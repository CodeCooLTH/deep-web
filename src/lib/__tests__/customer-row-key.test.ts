import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { makeCustomerRowKey } from '@/lib/customer-row-key'

describe('makeCustomerRowKey', () => {
  it('มี customerId → c-{id} ชนะแม้มี buyerUserId/contact ด้วย', () => {
    expect(makeCustomerRowKey('cust-1', 'user-1', '0812345678')).toBe('c-cust-1')
  })

  it('ไม่มี customerId มี buyerUserId → u-{id}', () => {
    expect(makeCustomerRowKey(null, 'user-1', '0812345678')).toBe('u-user-1')
    expect(makeCustomerRowKey(undefined, 'user-1', undefined)).toBe('u-user-1')
  })

  it('guest มี contact → g- + sha256 16 hex ตัวแรก', () => {
    const key = makeCustomerRowKey(null, null, '0812345678')
    const expectedHash = createHash('sha256').update('0812345678').digest('hex').slice(0, 16)
    expect(key).toBe('g-' + expectedHash)
    expect(key).toMatch(/^g-[0-9a-f]{16}$/)
  })

  it('contact ต่างกัน → key ต่างกัน', () => {
    const keyA = makeCustomerRowKey(null, null, '0812345678')
    const keyB = makeCustomerRowKey(null, null, '0899999999')
    expect(keyA).not.toBe(keyB)
  })

  it('contact เดียวกัน → key เดียวกัน (deterministic)', () => {
    const keyA = makeCustomerRowKey(null, null, '0812345678')
    const keyB = makeCustomerRowKey(undefined, undefined, '0812345678')
    expect(keyA).toBe(keyB)
  })

  it('ไม่มีอะไรเลย (null/undefined/ว่าง) → guest-unknown', () => {
    expect(makeCustomerRowKey(null, null, null)).toBe('guest-unknown')
    expect(makeCustomerRowKey(undefined, undefined, undefined)).toBe('guest-unknown')
    expect(makeCustomerRowKey(null, null, '')).toBe('guest-unknown')
  })
})
