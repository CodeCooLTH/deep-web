/**
 * [blocker] ขากลับของพัสดุ — เวลาที่ประทับ + ด่านของฐานข้อมูล (2026-08-25)
 *
 * ครอบ 3 เรื่องที่พังเงียบได้ทั้งหมด ไม่มีอันไหนที่ `tsc`/build/detector มองเห็น:
 *
 *   1. `returnLegStampOf()` แมปรหัสสถานะ → คอลัมน์เวลาที่ต้องประทับ
 *      เขียนผิดกิ่งเดียว = พัสดุตีกลับได้เวลาผิดช่อง แล้วไทม์ไลน์แถว 2 เล่าเรื่องกลับหัว
 *
 *   2. **ทุกทางที่เขียน `carrierStatus` ต้องเรียก `stampReturnLeg()`** — มี 3 ทาง
 *      (webhook · รอบ poll · รีเฟรชตอนเปิด traces) ทางไหนลืม = พัสดุที่ตีกลับผ่านทางนั้น
 *      ไม่มีวันเวลาบนไทม์ไลน์ **โดยไม่มี error ให้เห็น** (`deliveredAt` มีบั๊กนี้อยู่จริง
 *      ตอนนี้ — ทางที่ 3 ไม่เคยประทับให้เลย นี่คือหลักฐานว่าคลาสนี้เกิดซ้ำได้)
 *
 *   3. partial unique index ต้องมี `direction` — ถ้าใครลบออก ระบบคืนของจะกลับไปพังทั้งฟีเจอร์
 *      แบบเดิม (P2002 ทุกใบ) ซึ่งเป็นบั๊กที่อยู่บน prod มาโดยไม่มีใครเห็นเพราะยังไม่มีใครกด
 *      🛑 ด่านนี้ผูกกับ **ไฟล์ migration จริง** ไม่ใช่กับความจำ (บทเรียน
 *      docs/conventions/oauth-signup-unique-collisions.md — ด่านต้องผูกกับสคีมาจริง)
 *
 * แดง = ห้าม merge
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { RETURNED_CARRIER_STATUSES, returnLegStampOf } from '../status'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/**
 * 🛑 ต้องตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำ *ถูก* กฎ คือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย
 * ด่านที่ match คำเปล่า ๆ จะเขียวเพราะคอมเมนต์ ไม่ใช่เพราะโค้ด (บทเรียน HR9 grep gate
 * ที่แดงค้างจากคำเตือนของตัวเอง 2026-08-02→03 · และ component-declared-in-render.md)
 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

describe('[blocker] returnLegStampOf — รหัสสถานะ → คอลัมน์เวลาขากลับ', () => {
  it('`return` ประทับเวลา "เริ่มตีกลับ"', () => {
    expect(returnLegStampOf('return')).toBe('returnStartedAt')
  })

  it('`return_success` ประทับเวลา "ถึงร้าน"', () => {
    expect(returnLegStampOf('return_success')).toBe('returnedAt')
  })

  /**
   * 🛑 เคสนี้คือหัวใจ ไม่ใช่เคสประกอบ — ใบที่โผล่มาเป็น `return_success` เลยโดยไม่เคยผ่าน
   * `return` (รอบ poll เห็นแค่สถานะล่าสุด) คือใบที่ **ไม่รู้ว่าเริ่มตีกลับเมื่อไร**
   * เกิดจริง 6 จาก 12 ใบบน prod 2026-08-25
   *
   * ถ้าใครเผลอให้ `return_success` เติม `returnStartedAt` ด้วย จะได้วันที่ที่หน้าตาเหมือน
   * ข้อมูลจริงทุกประการแต่เป็นการเดา — อันตรายกว่าไม่มีวันที่
   * (docs/conventions/partial-data-must-be-labeled-or-filled.md)
   */
  it('`return_success` ต้อง **ไม่** ประทับ returnStartedAt ให้ด้วย', () => {
    expect(returnLegStampOf('return_success')).not.toBe('returnStartedAt')
  })

  it('สถานะนอกสายตีกลับต้องคืน null ทุกตัว', () => {
    // ไล่จากตารางจริงทั้งตาราง ไม่ใช่หยิบมา 2-3 ตัวที่นึกออก
    const NON_RETURN = [
      'order_success', 'picked_up', 'with_branch', 'in_transit', 'progress',
      'delivered', 'payment_success', 'issue', 'cannot_pickup', 'no_courier',
      'cod_refund', 'is_expired', 'cancelled', 'close',
    ]
    for (const code of NON_RETURN) {
      expect(returnLegStampOf(code), code).toBeNull()
    }
    expect(returnLegStampOf(null)).toBeNull()
    expect(returnLegStampOf(undefined)).toBeNull()
    expect(returnLegStampOf('')).toBeNull()
  })

  /** ทั้งสองรหัสของสายตีกลับต้องมีคอลัมน์รองรับครบ — เพิ่มรหัสใหม่แล้วลืมแมปจะแดงที่นี่ */
  it('ทุกรหัสใน RETURNED_CARRIER_STATUSES ต้องแมปได้ ไม่มีตัวไหนตกหล่น', () => {
    for (const code of RETURNED_CARRIER_STATUSES) {
      expect(returnLegStampOf(code), code).not.toBeNull()
    }
  })
})

describe('[blocker] ทุกทางที่เขียน carrierStatus ต้องประทับเวลาขากลับ', () => {
  const SRC = stripComments(read('src/services/iship.service.ts'))

  /**
   * นับ "ทาง" จากการเขียนคอลัมน์จริง (`carrierStatus:` ใน `data`) ไม่ใช่จากรายชื่อฟังก์ชัน
   * ที่จำมา — วิธีหลังจะไม่เห็นทางใหม่ที่ใครเพิ่มทีหลัง ซึ่งเป็นเคสที่ด่านนี้มีไว้กันพอดี
   *
   * `carrierStatus: code` / `carrierStatus: status` = การเขียนจริง
   * (`carrierStatus: true` คือ select · `carrierStatus: { in: ... }` คือ where — ไม่นับ)
   */
  it('มีทางเขียน carrierStatus อย่างน้อย 3 ทาง และทุกทางอยู่ในไฟล์เดียวกับ stampReturnLeg', () => {
    const writes = SRC.match(/carrierStatus: (?!true|\{)[A-Za-z_$][\w$]*/g) ?? []
    expect(writes.length).toBeGreaterThanOrEqual(3)
    expect(SRC).toContain('async function stampReturnLeg(')
  })

  /**
   * 🛑 เช็ค **การเรียกใช้** (`stampReturnLeg(`) ไม่ใช่ชื่อเปล่า ๆ — บรรทัดประกาศฟังก์ชัน
   * ก็ match ชื่อเปล่าได้ ด่านที่นับชื่อจะเขียวแม้ไม่มีใครเรียกมันเลยสักที่
   * (บทเรียน docs/conventions/rule-must-be-enforced-not-described.md)
   */
  it('ต้องมีการ "เรียก" stampReturnLeg ครบทุกทาง (ไม่ใช่แค่ประกาศไว้)', () => {
    // ตัดบรรทัดประกาศออกก่อน เหลือเฉพาะจุดที่เรียกใช้จริง
    const calls = SRC.replace(/async function stampReturnLeg\(/, '').match(/stampReturnLeg\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3)
  })

  /** ต้องเป็น write-once — เขียนทับได้เมื่อไร วันที่จะขยับทุกครั้งที่ขนส่งพยายามส่งใหม่ */
  it('ต้อง updateMany + WHERE <col> IS NULL ทั้งสองคอลัมน์ (write-once)', () => {
    expect(SRC).toMatch(/returnStartedAt: null/)
    expect(SRC).toMatch(/returnedAt: null/)
    // ห้ามใช้ update ธรรมดาที่ไม่มีเงื่อนไข null — นั่นคือการเขียนทับ
    expect(SRC).not.toMatch(/data: \{ returnStartedAt: occurredAt \},\s*\}\);\s*await prisma\.orderShipment\.update\(/)
  })
})

describe('[blocker] partial unique index ต้องแยกตามทิศทาง', () => {
  /**
   * อ่านจากไฟล์ migration จริง ไม่ใช่จาก schema.prisma (Prisma DSL ประกาศ partial unique
   * ไม่ได้ ⇒ ตัวจริงเป็น unmanaged SQL ที่มีอยู่ในไฟล์ migration เท่านั้น)
   *
   * ไล่ทุกไฟล์แล้วเอา **นิยามล่าสุด** เพราะ index ตัวนี้ถูก DROP แล้วสร้างใหม่
   */
  const latestIndexDef = () => {
    const dir = 'prisma/migrations'
    const files = readdirSync(join(process.cwd(), dir))
      .filter((d) => /^\d{14}_/.test(d))
      .sort()
    let def: string | null = null
    for (const f of files) {
      let sql: string
      try {
        sql = read(join(dir, f, 'migration.sql'))
      } catch {
        continue
      }
      const m = sql.match(
        /CREATE UNIQUE INDEX "OrderShipment_active_order_key"[\s\S]*?;/g,
      )
      if (m) def = m[m.length - 1]
    }
    return def
  }

  it('นิยามล่าสุดต้องมีทั้ง orderId และ direction', () => {
    const def = latestIndexDef()
    expect(def, 'ไม่พบ OrderShipment_active_order_key ในไฟล์ migration ใด ๆ').not.toBeNull()
    expect(def).toContain('"orderId"')
    // 🛑 บรรทัดนี้คือสิ่งที่กันไม่ให้ระบบคืนของกลับไปพังทั้งฟีเจอร์
    expect(def).toContain('direction')
    expect(def).toMatch(/WHERE\s+"status"\s*<>\s*'CANCELLED'/)
  })

  /**
   * 🛑 ต้องเช็ค **ทุกที่** ที่เอ่ยชื่อ index ไม่ใช่ที่แรกที่เจอ — ตอนเขียนเทสนี้รอบแรกใช้
   * `.find()` แล้วมันไปเจอคอมเมนต์บนโมเดล `Order` (คนละที่กับนิยาม) ซึ่งยังเขียนว่า
   * "active ได้ใบเดียว" ค้างอยู่ **คอมเมนต์ในสคีมาคือที่ที่คนถัดไปอ่านก่อนแก้โค้ด**
   * ถ้ามันเล่าของเก่า คนจะแก้ผิดโดยสุจริตแล้วไม่มีอะไรฟ้อง
   */
  it('ทุกคอมเมนต์ใน schema.prisma ที่เอ่ยถึง index ต้องเล่านิยามใหม่ (กันคอมเมนต์ล้าสมัย)', () => {
    const schema = read('prisma/schema.prisma')
    const lines = schema
      .split('\n')
      .filter((l) => l.includes('OrderShipment_active_order_key'))
    expect(lines.length, 'schema.prisma ไม่ได้พูดถึง index ตัวนี้เลย').toBeGreaterThan(0)
    for (const l of lines) {
      expect(l, l.trim()).toContain('direction')
    }
  })
})
