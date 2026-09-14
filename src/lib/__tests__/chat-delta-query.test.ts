import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDeltaWhere, isDeltaRequest } from '@/lib/chat-delta-query'

describe('[blocker] delta สองแกน', () => {
  it('ระบุทั้งสองแกน = OR กัน (ใบใหม่ หรือ ใบเก่าที่ค่าเปลี่ยน)', () => {
    const w = buildDeltaWhere({ conversationId: 'c1', afterSeq: 10, afterUpdatedAt: '2026-09-14T09:00:00.000Z' })
    expect(w).toEqual({
      conversationId: 'c1',
      OR: [{ seq: { gt: 10 } }, { updatedAt: { gt: new Date('2026-09-14T09:00:00.000Z') } }],
    })
  })

  it('ระบุแกนเดียวก็ยังทำงาน', () => {
    expect(buildDeltaWhere({ conversationId: 'c1', afterSeq: 10 })).toEqual({
      conversationId: 'c1',
      OR: [{ seq: { gt: 10 } }],
    })
  })

  it('ไม่ระบุแกนไหนเลย = ไม่ใช่ delta (ผู้เรียกต้องถอยไปใช้ cursor แบบเดิม)', () => {
    expect(isDeltaRequest({})).toBe(false)
    expect(isDeltaRequest({ afterSeq: 0 })).toBe(true) // seq 0 คือค่าที่ถูกต้อง ห้ามตกเพราะ falsy
    expect(isDeltaRequest({ afterUpdatedAt: '2026-09-14T09:00:00.000Z' })).toBe(true)
  })
})

describe('[blocker] RSC boundary: updatedAt ต้องแปลงเป็น ISO string เหมือน createdAt', () => {
  it('chat-thread-messages.service.ts ต้องแปลง m.updatedAt เป็น string ก่อนคืนออกไป (2026-09-14 R2)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/chat-thread-messages.service.ts'),
      'utf8',
    )
    expect(src).toContain('updatedAt: m.updatedAt.toISOString()')
  })
})
