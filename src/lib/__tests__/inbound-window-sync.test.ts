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
    /**
     * 🛑 ห้าม await — Graph call นี้ median 680ms และเคยเป็นทั้งหมดของอาการ "เข้าห้องต้องโหลดตลอด"
     * ต้องยิงผ่าน `after()` ให้รันหลังส่ง response (แพตเทิร์นเดียวกับ messages/route.ts:291)
     */
    expect(code).toMatch(/after\(syncInboundWindowFromMeta\(/)
    expect(code).not.toMatch(/await syncInboundWindowFromMeta\(/)
  })
})

/**
 * [blocker] — ตัวจำตำแหน่งรายการแชทต้องผูกกับ prop ของตัวเอง ห้ามเดาจาก `railMode`
 *
 * 🛑 รอบแรก (2026-09-10) กันด้วย `!railMode` โดยเข้าใจว่ามันแปลว่า "รายการฝั่ง rail" — ผิด:
 * คอมเมนต์ที่ inbox/page.tsx เขียนไว้เองว่าความหมายเปลี่ยนเป็น "ค้นหาอยู่ที่ header" แล้ว
 * และหน้า /inbox ก็ส่ง `railMode` มาด้วย ⇒ **ตัวจำตำแหน่งไม่เคยทำงานเลยสักครั้ง** โดยไม่มี
 * อะไรฟ้อง (tsc/build/เทสผ่านหมด — มันแค่เงียบ) user ต้องเป็นคนบอกว่ายังเด้งกลับบนสุดเหมือนเดิม
 */
describe('[blocker] เงื่อนไขเปิดตัวจำตำแหน่งรายการแชท', () => {
  const strip = (src: string) =>
    src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')

  it('ใช้ persistScroll ไม่ใช่ railMode', async () => {
    const fs = await import('fs')
    const code = strip(
      fs.readFileSync('src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx', 'utf8'),
    )
    expect(code).toMatch(/const restoreEnabled = persistScroll/)
    expect(code).not.toMatch(/const restoreEnabled = !railMode/)
  })

  it('หน้ารายการเต็มจอ (มือถือ) ส่ง persistScroll มาจริง', async () => {
    const fs = await import('fs')
    const code = strip(fs.readFileSync('src/app/(paces)/seller/(chat)/inbox/page.tsx', 'utf8'))
    expect(code).toMatch(/persistScroll/)
  })
})
