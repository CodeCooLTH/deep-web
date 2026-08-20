import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * [blocker] สัญญาระหว่าง "การโหลดไทม์ไลน์" กับ "สถานะที่หน้าจอแสดง"
 *
 * บั๊กที่ล็อกไว้ (prod 2026-08-20 TH068661575518): การเปิดโมดัลพัสดุยิง `get_order` แล้ว
 * เขียนสถานะใหม่ลงฐานจริง แต่ endpoint คืนแค่ events และหน้าจออ่านสถานะจาก prop ที่
 * server render ไว้ตอนเปิดหน้า ⇒ ในจอเดียวกัน หัวการ์ดขึ้น "กำลังจัดส่ง" ส่วนรายการ
 * เดินทางใต้มันขึ้น "ส่งคืนสำเร็จ" ห่างกัน 8 วัน โดยที่ tsc/build/เทสเดิมผ่านหมด —
 * เพราะทุกบรรทัด "ถูก" ตามชนิดข้อมูล สิ่งที่ผิดคือ *ค่าไหนคือความจริงล่าสุด*
 *
 * เทสอ่านซอร์สเพราะรีโปนี้ไม่มี jsdom (vitest environment = node) — ตรวจ "ที่มาของค่า"
 * ไม่ได้ตรวจ DOM. 🛑 ต้องตัดคอมเมนต์ก่อนสแกนเสมอ ไม่งั้นไฟล์ที่ทำถูกจะแดงจากคำอธิบาย
 * ของกฎตัวเอง (บทเรียน grep gate ของ HR9 2026-08-02 และ component-declared-in-render)
 */

const ROOT = path.resolve(__dirname, '../../../..')

function sourceWithoutComments(rel: string): string {
  const raw = readFileSync(path.join(ROOT, rel), 'utf8')
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('endpoint การเดินทางต้องคืนสถานะล่าสุดมาด้วย', () => {
  it('[blocker] route คืน `carrier` คู่กับ `events` — ห้ามกลับไปคืน array เปล่า ๆ', () => {
    const src = sourceWithoutComments(
      'src/app/api/seller/iship/shipments/[id]/traces/route.ts',
    )
    expect(src).toMatch(/const\s*\{\s*events\s*,\s*carrier\s*\}\s*=\s*await\s+getTraces\(/)
    expect(src).toMatch(/ishipJson\(\{[\s\S]*\bcarrier\b[\s\S]*\}\)/)
  })

  it('[blocker] getTraces คืนสถานะที่อ่านกลับจากฐาน *หลัง* เขียน ไม่ใช่ค่าที่ถือมาตั้งแต่ต้น', () => {
    const src = sourceWithoutComments('src/services/iship.service.ts')
    // อ่านกลับหลังบล็อกอัปเดต — ถ้าย้ายไปอ่านก่อน หรือถอดออก จะได้ค่าเดิมที่หน้าจอมีอยู่แล้ว
    expect(src).toMatch(/carrier:\s*carrierStateOf\(fresh\s*\?\?\s*row\)/)
  })
})

describe('หน้าจอพัสดุต้องอ่านสถานะจากค่าล่าสุด ไม่ใช่ prop ที่ค้างจากตอนเปิดหน้า', () => {
  const VIEW = 'src/components/safepay/iship/ShipmentStatusView.tsx'

  it('[blocker] ห้ามอ่าน shipment.carrierStatus* ตรง ๆ — ต้องผ่าน carrier ที่รวม live แล้ว', () => {
    const src = sourceWithoutComments(VIEW)
    const direct = src.match(/shipment\.carrierStatus(Text|At)?\b/g) ?? []
    expect(direct).toEqual([])
  })

  it('[blocker] แถบ 4 ขั้นและป้ายสถานะต้องคำนวณจาก carrier ตัวเดียวกัน', () => {
    const src = sourceWithoutComments(VIEW)
    expect(src).toMatch(/describeProgress\(\s*carrier\.status\s*,\s*carrier\.carrierStatus\s*\)/)
    expect(src).toMatch(/const\s+carrier\s*:\s*TraceCarrierState\s*=\s*liveCarrier\s*\?\?\s*shipment/)
  })
})

describe('รอบ sync ต้องตามใบที่หลุดหน้าต่าง query_orders ต่อ', () => {
  it('[blocker] ห้ามปล่อยใบที่ไม่อยู่ในคำตอบยกชุดทิ้งเฉย ๆ (ต้นเหตุสถานะค้าง 8 วัน)', () => {
    const src = sourceWithoutComments('src/services/iship.service.ts')
    expect(src).toMatch(/pickStaleParcelsForLookup\(\s*tracking\s*,/)
    // และต้องถามรายใบจริง ไม่ใช่เลือกมาแล้วไม่ทำอะไรต่อ
    expect(src).toMatch(/for\s*\(\s*const\s+s\s+of\s+staleParcels\s*\)/)
    expect(src).toMatch(/iship\.getOrder\(token,\s*s\.trackingNo!\)/)
  })
})
