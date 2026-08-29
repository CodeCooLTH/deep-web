import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { deriveShippingStage } from '@/lib/order-stage'
import { buildShippingStageSql } from '@/lib/order-stage-sql'

/**
 * เทสยืนยันว่า "นับ/กรองที่ SQL" ให้ผลตรงกับ "derive ที่ TypeScript" **บนข้อมูลจริง**
 * (CR 2026-08-25 — คู่กับ `src/lib/__tests__/order-stage-sql.test.ts` ที่เทียบบนค่าสังเคราะห์)
 *
 * ── ต่างจากเทสตัวนั้นยังไง ──────────────────────────────────────────────────
 * ตัวนั้นพิสูจน์ว่า *สูตร* ตรงกันทุกคอมบิเนชันที่เป็นไปได้
 * ตัวนี้พิสูจน์ว่า *การประกอบ query* (LATERAL หาพัสดุใบล่าสุด, predicate, join) ถูกต้องด้วย —
 * ซึ่งสูตรที่ถูกก็ยังให้คำตอบผิดได้ถ้าป้อนแถวผิดเข้าไป
 * (เคสจริงของโปรเจกต์นี้: `order-stage.service.ts` เคยใช้ `<> 'CANCELLED'` แทน
 * `= 'CREATED'` ⇒ นับใบ FAILED ด้วย คอมเมนต์เตือนอยู่ที่ฟังก์ชันคำนวณ แต่บั๊กอยู่ที่ query)
 *
 * ── อ่านอย่างเดียว ─────────────────────────────────────────────────────────
 * 🛑 `SELECT` ล้วน ไม่เขียนอะไรทั้งสิ้น ไม่สร้าง/ลบข้อมูลทดสอบ — ใช้ข้อมูลเท่าที่มีในฐาน dev
 * และ fail-closed: ไม่ยอมรันถ้า connection ไม่ได้ชี้ localhost (HR13/14)
 *
 * ข้อดีของการไม่ seed ข้อมูลเอง: invariant "SQL == TS" เป็นจริงไม่ว่าข้อมูลจะเป็นอะไร
 * ⇒ ยิ่งฐาน dev มีเคสหลากหลายขึ้น เทสนี้ยิ่งแข็งแรงขึ้นเอง โดยไม่ต้องมีใครมาเติม fixture
 */

const DB_URL = process.env.DATABASE_URL ?? ''
const CAN_RUN = Boolean(DB_URL) && /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL)

const prisma = CAN_RUN ? new PrismaClient() : null
afterAll(async () => {
  await prisma?.$disconnect()
})

const STAGE_COLUMNS = {
  orderStatus: 'o."status"',
  hasShipment: 's."id" IS NOT NULL',
  carrierStatus: 's."carrierStatus"',
  paymentMethod: 'o."paymentMethod"',
  codReceivedAt: 'o."codReceivedAt"',
  // feature 00062 — ต้องตรงกับ STAGE_COLUMNS จริงใน order-list.service.ts (สำเนาในเทสนี้
  // เป็นสำเนาโดยเจตนา: ถ้าของจริงเปลี่ยนแล้วที่นี่ไม่เปลี่ยน tsc จะฟ้องที่ buildShippingStageSql)
  fulfillmentMode: 'o."fulfillmentMode"',
}

const LATERAL = `
  LEFT JOIN LATERAL (
    SELECT sh."id", sh."carrierStatus"
    FROM "OrderShipment" sh
    WHERE sh."orderId" = o."id"
      AND sh."status" = 'CREATED' AND sh."isDryRun" = false AND sh."direction" = 'FORWARD'
    ORDER BY sh."createdAt" DESC LIMIT 1
  ) s ON true`

describe('order-list — กองงานที่นับด้วย SQL ต้องตรงกับที่ derive ด้วย TS บนข้อมูลจริง', () => {
  it('[blocker] ทุกออเดอร์ในฐานได้กองเดียวกันทั้งสองทาง', async () => {
    if (!CAN_RUN) {
      console.warn(
        '[order-list] ข้ามการเทียบกับข้อมูลจริง: ต้องมี DATABASE_URL ที่ชี้ localhost — ' +
          'เทสนี้เป็นด่านของ CR 2026-08-25 อย่าปล่อยให้ข้ามถาวร',
      )
      expect(CAN_RUN).toBe(false)
      return
    }

    const stageExpr = buildShippingStageSql(STAGE_COLUMNS)

    // ดึงทั้ง input ดิบและคำตอบของ SQL มาในคำสั่งเดียว — ถ้าแยกสองรอบ ข้อมูลอาจเปลี่ยนระหว่างกลาง
    const rows = await prisma!.$queryRawUnsafe<
      {
        id: string
        status: string
        has_shipment: boolean
        carrier_status: string | null
        payment_method: string | null
        cod_received_at: Date | null
        fulfillment_mode: string
        sql_stage: string
      }[]
    >(`
      SELECT o."id",
             o."status",
             (s."id" IS NOT NULL) AS has_shipment,
             s."carrierStatus"    AS carrier_status,
             o."paymentMethod"    AS payment_method,
             o."codReceivedAt"    AS cod_received_at,
             o."fulfillmentMode"  AS fulfillment_mode,
             (${stageExpr})       AS sql_stage
      FROM "Order" o
      ${LATERAL}
    `)

    if (rows.length === 0) {
      console.warn('[order-list] ฐาน dev ไม่มีออเดอร์เลย — เทสนี้ผ่านแบบไม่ได้ตรวจอะไร')
    }

    const mismatches = rows
      .map((r) => {
        const fromTs = deriveShippingStage({
          status: r.status,
          hasShipment: r.has_shipment,
          carrierStatus: r.carrier_status,
          paymentMethod: r.payment_method,
          codReceivedAt: r.cod_received_at,
          fulfillmentMode: r.fulfillment_mode,
        })
        return fromTs === r.sql_stage
          ? null
          : `${r.id}: TS=${fromTs} SQL=${r.sql_stage} (status=${r.status} carrier=${r.carrier_status})`
      })
      .filter(Boolean)

    expect(mismatches).toEqual([])
  }, 60_000)

  /**
   * 🛑 เทสตัวนี้จำเป็นเพราะเทสบน "ข้อมูลจริง" ข้างล่างจับ mutation ของ predicate **ไม่ได้เลย**
   * ฐาน dev มีพัสดุ 8 ใบและเป็น `CREATED/FORWARD/isDryRun=false` เหมือนกันหมด
   * ⇒ ไม่มีแถวไหนแยกความต่างระหว่าง "มีตัวกรอง" กับ "ไม่มี" ได้
   * (พิสูจน์แล้วด้วย mutation: ถอด `direction` / ถอด `isDryRun` / สลับเป็นใบเก่าสุด — เขียวหมด)
   *
   * `docs/conventions/mutation-silence-means-weak-corpus.md`: mutation ที่เงียบแปลว่า
   * **ชุดข้อมูลอ่อน ไม่ใช่ mutation ไม่เกี่ยว** ⇒ ต้องเติม input ไม่ใช่ยอมรับผลเขียว
   *
   * เติมด้วย `VALUES` แทนการ seed ลงตารางจริง เพราะฐาน dev เป็นของที่คนอื่นใช้อยู่ด้วย
   */
  it('[blocker] predicate ของ LATERAL ต้องเลือกใบที่ถูกต้อง (ชุดข้อมูลสังเคราะห์)', async () => {
    if (!CAN_RUN) {
      expect(CAN_RUN).toBe(false)
      return
    }
    // 5 ใบของออเดอร์เดียวกัน — มีแค่ใบเดียวที่เข้าเกณฑ์ และมันไม่ใช่ใบที่ใหม่ที่สุดในกอง
    const rows = await prisma!.$queryRawUnsafe<{ picked: string | null }[]>(`
      SELECT (
        SELECT sh.code FROM (VALUES
          ('ok_old',    'CREATED',   false, 'FORWARD', TIMESTAMP '2026-01-01'),
          ('ok_new',    'CREATED',   false, 'FORWARD', TIMESTAMP '2026-02-01'),
          ('cancelled', 'CANCELLED', false, 'FORWARD', TIMESTAMP '2026-03-01'),
          ('dryrun',    'CREATED',   true,  'FORWARD', TIMESTAMP '2026-04-01'),
          ('return',    'CREATED',   false, 'RETURN',  TIMESTAMP '2026-05-01')
        ) AS sh(code, status, "isDryRun", direction, "createdAt")
        WHERE sh.status = 'CREATED' AND sh."isDryRun" = false AND sh.direction = 'FORWARD'
        ORDER BY sh."createdAt" DESC LIMIT 1
      ) AS picked
    `)
    // ต้องได้ ok_new: ใหม่สุด **ในบรรดาใบที่เข้าเกณฑ์** ไม่ใช่ใหม่สุดของทั้งกอง (ซึ่งคือ return)
    expect(rows[0]?.picked).toBe('ok_new')
  }, 60_000)

  it('[blocker] LATERAL ต้องหยิบพัสดุ "ที่ยังใช้งานอยู่และเป็นขาไป" เท่านั้น (ข้อมูลจริง)', async () => {
    if (!CAN_RUN) {
      expect(CAN_RUN).toBe(false)
      return
    }
    /**
     * 🛑 นี่คือเงื่อนไขที่ผลลัพธ์จะ "ถูกทั้งที่ผิด" ถ้าหลุด — ใบที่ยกเลิก/ทดลอง/ขากลับ
     * ไม่ควรมีสิทธิ์ตัดสินกองของออเดอร์ (feature 00056 เตือนไว้ใน schema ว่าทุก query
     * ที่หาพัสดุของออเดอร์ต้องระบุ `direction` เสมอ — มี 14 จุดในระบบ)
     */
    const bad = await prisma!.$queryRawUnsafe<{ n: bigint }[]>(`
      SELECT count(*)::bigint AS n
      FROM "Order" o
      ${LATERAL}
      WHERE s."id" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "OrderShipment" x
          WHERE x."id" = s."id"
            AND (x."status" <> 'CREATED' OR x."isDryRun" = true OR x."direction" <> 'FORWARD')
        )
    `)
    expect(Number(bad[0]?.n ?? 0)).toBe(0)
  }, 60_000)
})
