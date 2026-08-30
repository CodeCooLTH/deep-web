/**
 * [blocker] ออเดอร์นัดรับที่ยกเลิกแล้วต้องไม่ขึ้น "เสร็จสิ้น" สีเขียว
 * (impeccable critique P1-3, 2026-08-29)
 *
 * ทำไม: `derivePickupStage()` คืน `'DONE'` (tone success สีเขียว) ให้ทั้ง status===CONFIRMED
 * **และ** CANCELLED โดยตั้งใจ (`src/lib/order-pickup.ts` — ห้ามแก้ตัวนี้ ดู comment ในไฟล์นั้น)
 * ⇒ ตัวกันความหมาย "ยกเลิกแล้ว = ไม่มีสาระอะไรให้วาดแถบนัดรับ" ต้องอยู่ที่ผู้อ่านค่านี้
 * (`MiniShipmentTimeline`) ไม่ใช่ที่ตัวคำนวณ — และต้องเช็ค **ก่อน** เข้ากิ่ง pickupStage เสมอ
 * ไม่งั้นแถวเดียวกันจะมี badge "ยกเลิก" คอลัมน์หนึ่ง กับ "เสร็จสิ้น" สีเขียวอีกคอลัมน์
 * (ละเมิด Verified-Means-Green ตรงตัว)
 *
 * ต้นเหตุจริงคือ `OrdersTable.tsx` เรียก `<MiniShipmentTimeline pickupStage={...} plain />`
 * โดยไม่ส่ง `cancelled` เลย — เทสนี้จึงตรวจ 2 จุด: (1) ลำดับเช็คใน component เอง (2) caller
 * ต้องส่ง prop มาจริง ขาดจุดใดจุดหนึ่งก็ทำให้บั๊กนี้กลับมา
 *
 * แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

const MINI = 'src/app/(paces)/seller/(dashboard)/orders/components/MiniShipmentTimeline.tsx'
const TABLE = 'src/app/(paces)/seller/(dashboard)/orders/components/OrdersTable.tsx'

describe('MiniShipmentTimeline: cancelled ต้องกันเข้ากิ่ง pickupStage (P1-3)', () => {
  it('การเช็ค `if (cancelled)` ต้องมาก่อน `if (pickupStage)` เสมอในซอร์ส', () => {
    const src = stripComments(read(MINI))
    const cancelledIdx = src.indexOf('if (cancelled)')
    const pickupIdx = src.indexOf('if (pickupStage)')
    expect(cancelledIdx).toBeGreaterThan(-1)
    expect(pickupIdx).toBeGreaterThan(-1)
    expect(cancelledIdx).toBeLessThan(pickupIdx)
  })

  it('OrdersTable ต้องส่ง cancelled prop เข้าคู่กับ pickupStage เสมอ (จุดที่เคยลืมส่ง)', () => {
    const src = stripComments(read(TABLE))
    const match = src.match(/<MiniShipmentTimeline\s+pickupStage=\{[^}]+\}[\s\S]{0,160}?\/>/)
    expect(match).not.toBeNull()
    expect(match?.[0]).toMatch(/cancelled=\{row\.original\.status === 'CANCELLED'\}/)
  })
})
