/** [blocker] เพดาน prefetch แถวรายการแชท (L1) — mutation: เปลี่ยน < เป็น <= หรือ ตัดเงื่อนไข >= 0 แล้วต้องแดง */
import { describe, expect, it } from 'vitest'
import { INBOX_PREFETCH_TOP_ROWS, shouldPrefetchRow } from '../inbox-row-prefetch'

describe('shouldPrefetchRow', () => {
  it('N แถวบน prefetch เต็ม', () => {
    for (let i = 0; i < INBOX_PREFETCH_TOP_ROWS; i++) expect(shouldPrefetchRow(i)).toBe(true)
  })
  it('แถวที่ N เป็นต้นไปไม่ prefetch', () => {
    expect(shouldPrefetchRow(INBOX_PREFETCH_TOP_ROWS)).toBe(false)
    expect(shouldPrefetchRow(200)).toBe(false)
  })
  it('index ติดลบไม่ prefetch', () => {
    expect(shouldPrefetchRow(-1)).toBe(false)
  })
})
