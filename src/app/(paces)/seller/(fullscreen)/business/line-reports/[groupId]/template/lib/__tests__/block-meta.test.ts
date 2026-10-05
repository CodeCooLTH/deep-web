import { describe, expect, it } from 'vitest'
import { BLOCK_ICON, LIBRARY_GROUPS, blockSummary, blockTitle, libraryDesc } from '../block-meta'

describe('block-meta: expense / net_sales', () => {
  it('ชื่อ/ไอคอน/คำอธิบาย/บรรทัดสรุป', () => {
    expect(blockTitle('expense', 'ออเดอร์')).toBe('ค่าใช้จ่าย')
    expect(blockTitle('net_sales', 'ออเดอร์')).toBe('ยอดขายหลังหักค่าใช้จ่าย')
    expect(BLOCK_ICON.expense).toBe('report-money')
    expect(BLOCK_ICON.net_sales).toBe('wallet')
    expect(libraryDesc('expense', 'ออเดอร์', { blocks: [] })).toBe('ทุกคนในกลุ่มจะเห็น — ถามยืนยันก่อนเพิ่ม')
    expect(blockSummary({ id: 'e', type: 'expense' }, 'ออเดอร์', '')).toBeNull()
  })
  it('อยู่ในกลุ่ม "ข้อมูล" ต่อท้าย profit', () => {
    const g = LIBRARY_GROUPS[0]
    expect(g.types.slice(-3)).toEqual(['profit', 'expense', 'net_sales'])
  })
})
