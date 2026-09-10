import { describe, it, expect } from 'vitest'
import { shouldAskMetaForInboundWindow } from '@/lib/inbound-window-sync'

const long_ago = new Date(Date.now() - 40 * 60 * 60 * 1000)
const recent = new Date(Date.now() - 60 * 1000)

/**
 * [blocker] — Graph call ตัวนี้ median 680ms และบล็อกการวาดหน้าเธรด
 * ขยายเงื่อนไขกลับไปกว้างเหมือนเดิม = ผู้ใช้บ่นว่า "เข้าห้องต้องโหลดตลอด" อีกรอบ
 */
describe('[blocker] ถาม Meta หาเวลาที่ลูกค้าทักล่าสุด', () => {
  it('ถามเฉพาะตอนไม่มีข้อมูลเลย (null)', () => {
    expect(shouldAskMetaForInboundWindow({ channel: 'MESSENGER', lastInboundAt: null })).toBe(true)
    expect(shouldAskMetaForInboundWindow({ channel: 'INSTAGRAM', lastInboundAt: null })).toBe(true)
  })

  /** 90.9% ของเธรดบน prod อยู่กลุ่มนี้ — ถามซ้ำได้คำตอบเดิมเสมอ */
  it('มีค่าแล้วไม่ถามซ้ำ ไม่ว่าจะเก่าแค่ไหน', () => {
    expect(shouldAskMetaForInboundWindow({ channel: 'MESSENGER', lastInboundAt: long_ago })).toBe(false)
    expect(shouldAskMetaForInboundWindow({ channel: 'MESSENGER', lastInboundAt: recent })).toBe(false)
  })

  it('DEEP/LINE ไม่เข้าเส้นทางนี้เลย (คนละแนวคิดของหน้าต่างเวลา)', () => {
    for (const channel of ['DEEP', 'LINE']) {
      expect(shouldAskMetaForInboundWindow({ channel, lastInboundAt: null }), channel).toBe(false)
      expect(shouldAskMetaForInboundWindow({ channel, lastInboundAt: long_ago }), channel).toBe(false)
    }
  })

  it('หน้าเธรดเรียกฟังก์ชันนี้ ไม่ได้เขียนเงื่อนไขเอง', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).toMatch(/shouldAskMetaForInboundWindow\(\{/)
    // ห้ามกลับไปใช้ "หน้าต่างดูปิด" เป็นเกณฑ์ยิง Meta อีก
    expect(code).not.toMatch(/!getWindowState\([^)]*\)\.open[\s\S]{0,80}syncInboundWindowFromMeta/)
  })
})
