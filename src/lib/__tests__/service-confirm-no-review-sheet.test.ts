/**
 * [blocker] 00082 ext (ทีมขอ 2026-10-23) — ร้านบริการ: ลูกค้ากด "ยืนยันรับบริการ" แล้ว **ไม่เด้งแผ่นให้คะแนน**
 * (ลูกค้ากดผิดตอนจอสลับ) — รีวิวได้จากการ์ดบนหน้าเหมือนเดิม · ร้านอื่นยังเด้งแบบเดิม (แบบ Grab)
 *
 * ตรวจจากซอร์ส (แบบเดียวกับ order-origin-row.test.ts) — ตัวตัดสินอยู่ใน handleConfirm ของ client component
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(join(process.cwd(), 'src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'), 'utf8')
const CLIENT = readFileSync(join(process.cwd(), 'src/app/(marketing)/o/[token]/PublicOrderClient.tsx'), 'utf8')

const handleConfirm = (() => {
  const start = SRC.indexOf('const handleConfirm = async () => {')
  const end = SRC.indexOf('  }\n', SRC.indexOf('} finally {', start))
  return SRC.slice(start, end)
})()

describe('[blocker] หลังยืนยัน — ร้านบริการไม่เด้งแผ่นให้คะแนน', () => {
  it('ร้านบริการ: refresh หน้า (ใบเสร็จ/การ์ดรีวิวขึ้น) และไม่เปิดแผ่น · ร้านอื่น: เปิดแผ่นเหมือนเดิม', () => {
    const lines = handleConfirm.split('\n').map((l) => l.trim()).filter((l) => !l.startsWith('//'))
    const svc = lines.findIndex((l) => l === 'if (order.isServiceShop) router.refresh()')
    const other = lines.findIndex((l) => l === 'else if (!order.hasReview) setReviewSheetOpen(true)')
    expect(svc).toBeGreaterThan(-1)
    expect(other).toBe(svc + 1)
    // ไม่มีทางอื่นใน handleConfirm ที่เปิดแผ่นให้ร้านบริการ
    expect(lines.filter((l) => l.includes('setReviewSheetOpen(true)'))).toHaveLength(1)
  })

  it('การ์ดรีวิวบนหน้ายังอยู่ (รีวิวได้โดยไม่ต้องมีแผ่น)', () => {
    expect(SRC).toMatch(/const canReview = !order\.hasReview && \(order\.status === 'CONFIRMED' \|\| reviewConfirms\)/)
    expect(SRC).toMatch(/<ReviewForm token=\{order\.publicToken\} confirmsOnSubmit=\{reviewConfirms\} \/>/)
  })

  it('ร้านบริการได้ toast บอกผลเสมอ (ไม่มีหัวแผ่นพูดแทนแล้ว)', () => {
    expect(CLIENT).toContain('if (orderState.hasReview || orderState.isServiceShop)')
  })
})
