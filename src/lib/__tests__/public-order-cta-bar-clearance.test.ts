import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] แถบ CTA ล่างจอเป็น `position: fixed` ⇒ **ต้องมีบล็อกกันที่ท้าย flow เสมอ**
 *
 * อาการที่วัดได้บนจอจริง 2026-08-30 (iPhone 390×844 เลื่อนสุดหน้าแล้ว):
 *
 *     แถบ CTA เริ่มที่ y = 786
 *     "© 2569 Deep" จบที่ y = 857      ← เกินขอบจอ (844) และเลื่อนต่อไม่ได้แล้ว
 *
 * ⇒ ท้าย footer 71px จมอยู่ใต้แถบ **ถาวร** — ไม่ใช่แค่ตอนเลื่อนผ่าน แต่คือมองไม่เห็นเลย
 * ทั้งที่ลิงก์ "แจ้งมิจฉาชีพ" อยู่แถวนั้น
 *
 * ทำไมผูกกับ "ต้องวัดความสูง" ไม่ใช่ "ต้องมี paddingBottom สักค่า":
 * แถบสูงไม่เท่ากันตามเบรกพอยต์ (จอกว้างปุ่มยกเลิกมีข้อความ) และยังบวก safe-area ของเครื่อง
 * ที่มี home indicator ⇒ ค่าคงที่ตัวเดียวผิดอย่างน้อยหนึ่งเคสเสมอ
 *
 * 🛑 แดง = ห้าม merge
 */
const FILE = join(__dirname, '..', '..', 'app', '(marketing)', 'o', '[token]', 'OrderDetailMobile.tsx')

describe('[blocker] ที่ว่างใต้แถบ CTA ของหน้า /o/[token]', () => {
  const src = readFileSync(FILE, 'utf8')

  it('แถบ fixed ต้องถูกวัดด้วย ref (ไม่ใช่ฮาร์ดโค้ดความสูง)', () => {
    expect(src).toContain('ref={ctaBarRef}')
    expect(src).toContain('new ResizeObserver')
  })

  it('🛑 ต้องมีบล็อกกันที่ท้าย flow ที่สูงเท่าแถบจริง', () => {
    expect(src).toContain('sx={{ height: ctaBarHeight }}')
  })

  it('บล็อกกันที่ต้องขึ้น/ลงพร้อมแถบ — เงื่อนไขเดียวกัน (canConfirm)', () => {
    /* ถ้าเงื่อนไขสองฝั่งหลุดจากกัน จะได้ช่องว่างค้างอยู่ตอนไม่มีแถบ (ท้ายหน้าโหว่)
       หรือแถบทับ footer ตอนมีแถบ — พังคนละทางแต่มาจากรากเดียวกัน */
    expect(src).toContain('{canConfirm && <Box aria-hidden sx={{ height: ctaBarHeight }} />}')
  })

  it('บล็อกกันที่ต้องอยู่ **หลัง** footer ไม่ใช่ก่อน', () => {
    const footer = src.indexOf('<PublicProfileFooter />')
    const spacer = src.indexOf('{canConfirm && <Box aria-hidden')
    expect(footer).toBeGreaterThan(-1)
    expect(spacer).toBeGreaterThan(footer)
  })
})
