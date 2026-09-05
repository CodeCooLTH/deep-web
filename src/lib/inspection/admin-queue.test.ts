// [blocker] ตัวชี้วัดงานค้าง — ตัวเลขที่ยุบรวมทำให้ทีมแก้ผิดทาง (feature 00060 · T10)

import { describe, expect, it } from 'vitest'
import { buildBacklog, type OpenRoundRow } from './admin-queue'

const NOW = new Date('2026-09-05T00:00:00.000Z')
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

const row = (o: Partial<OpenRoundRow>): OpenRoundRow => ({
  step: 4,
  method: 'ONSITE',
  dueAt: days(-1),
  inspectorUserId: null,
  ...o,
})

describe('buildBacklog', () => {
  it('🛑 mutation: ยุบ overdueUnassigned กับ overdueAssigned เป็นตัวเดียว → เคสนี้ต้องแดง', () => {
    // ขั้น 4 ตันเพราะไม่มีคนกดมอบหมาย · ขั้น 2 ตันเพราะผู้ตรวจค้างงาน
    // สองบรรทัดนี้สั่งให้ทีมทำคนละเรื่องกันโดยสิ้นเชิง
    const b = buildBacklog(
      [
        row({}),
        row({}),
        row({ step: 2, method: 'DOCUMENT', inspectorUserId: 'u-1' }),
      ],
      NOW,
    )
    expect(b).toEqual([
      { step: 2, method: 'DOCUMENT', overdueUnassigned: 0, overdueAssigned: 1, dueSoon: 0 },
      { step: 4, method: 'ONSITE', overdueUnassigned: 2, overdueAssigned: 0, dueSoon: 0 },
    ])
  })

  it('🛑 mutation: นับรอบที่ยังไม่ถึงกำหนดเป็นงานค้าง → เคสนี้ต้องแดง', () => {
    const b = buildBacklog([row({ dueAt: days(3) }), row({ dueAt: days(30) })], NOW)
    expect(b).toEqual([{ step: 4, method: 'ONSITE', overdueUnassigned: 0, overdueAssigned: 0, dueSoon: 1 }])
  })

  it('🛑 รอบที่ไม่มีกำหนด (ad-hoc) ไม่นับทั้งสามช่อง — ไม่มีกำหนดจึงยังไม่เลยกำหนด', () => {
    expect(buildBacklog([row({ dueAt: null })], NOW)).toEqual([])
  })

  it('แยกตามวิธีตรวจแม้อยู่ขั้นเดียวกัน — ONSITE ตันคนละเหตุผลกับ DOCUMENT', () => {
    const b = buildBacklog(
      [row({ step: 3, method: 'VIDEO_CALL' }), row({ step: 3, method: 'DOCUMENT' })],
      NOW,
    )
    expect(b.map((x) => x.method)).toEqual(['DOCUMENT', 'VIDEO_CALL'])
  })
})
