import { PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

import { deriveShippingStage } from '../order-stage'
import { buildShippingStageSql } from '../order-stage-sql'
import {
  IN_TRANSIT_CARRIER_STATUSES,
  PROBLEM_CARRIER_STATUSES,
  RETURNED_CARRIER_STATUSES,
  TERMINAL_CARRIER_STATUSES,
} from '../iship/status'

/**
 * เทสเทียบผลสองฝั่งของสูตร "กองงานตามสถานะพัสดุ" (CR 2026-08-25 · D-1)
 *
 * 🛑 นี่คือ **ด่าน** ที่ทำให้ D-1 ตัวเลือก (ก) ปลอดภัยพอจะเลือกได้ — ไม่ใช่คอมเมนต์เตือนใจ
 * สูตรเดียวกันมีอยู่ 2 ฉบับ (TypeScript ใน `order-stage.ts` · SQL ใน `order-stage-sql.ts`)
 * เพราะหน้า `/orders` ต้องกรองที่ฐานข้อมูล เทสนี้บังคับให้สองฉบับให้คำตอบตรงกัน **ทุกคอมบิเนชัน**
 * ถ้าใครแก้ฝั่งเดียว เทสนี้แดงทันที
 *
 * ── ทำไมมันไม่อันตราย (Hard Rule 13/14) ────────────────────────────────────
 * มันยิงแค่ `SELECT` บน **ค่าคงที่ที่ประกอบขึ้นเองด้วย `VALUES`** — ไม่แตะตารางไหนเลย
 * ไม่อ่านข้อมูลจริงสักแถว ไม่เขียนอะไรทั้งสิ้น ไม่มี DDL
 * และมีด่านซ้อนอีกชั้น: **ถ้า connection ไม่ได้ชี้ localhost จะไม่ยอมรัน** (fail-closed)
 */

const DB_URL = process.env.DATABASE_URL ?? ''
const IS_LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL)
const CAN_RUN = Boolean(DB_URL) && IS_LOCAL

const prisma = CAN_RUN ? new PrismaClient() : null
afterAll(async () => {
  await prisma?.$disconnect()
})

/** รหัสสถานะทุกตัวที่มีผลต่อการแตกกิ่ง + ตัวที่ไม่รู้จัก + null */
const CARRIER_CODES: (string | null)[] = [
  ...new Set([
    ...RETURNED_CARRIER_STATUSES,
    ...PROBLEM_CARRIER_STATUSES,
    ...TERMINAL_CARRIER_STATUSES,
    ...IN_TRANSIT_CARRIER_STATUSES,
    'order_success',
    'no_courier',
    // รหัสที่ระบบไม่รู้จัก — ต้องตกกิ่งเดียวกันทั้งสองฝั่ง ไม่ใช่ต่างคนต่างเดา
    'a_code_we_have_never_seen',
  ]),
  null,
]

const ORDER_STATUSES = ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED', 'RETURNED']
/**
 * feature 00062 (U6) — ค่าที่ไม่ใช่ `'SHIPPED'` ของ `Order.fulfillmentMode` ที่ต้องตกกิ่ง
 * `NOT_SHIPPING` เสมอ ไม่ว่าแกนอื่นจะเป็นอะไร (`PICKUP`/`NO_SHIPPING` ของจริง +
 * `SOMETHING_NEW` กันค่าที่ยังไม่มีใครนิยาม เพราะเงื่อนไขคือ `<> 'SHIPPED'` ไม่ใช่
 * allow-list ของสองค่าแรก — ค่าที่ 3 ไม่ควรหลุดไปตกกิ่งเดิม)
 */
const NON_SHIPPED_MODES = ['PICKUP', 'NO_SHIPPING', 'SOMETHING_NEW']
/** ครอบทั้งรูปอังกฤษ/ไทย/ตัวพิมพ์เล็ก และค่าที่ร้านพิมพ์เองแบบมีคำ COD ปนอยู่กลางประโยค */
const PAYMENT_METHODS: (string | null)[] = [
  'COD',
  'cod',
  'เก็บเงินปลายทาง',
  'ชำระปลายทาง',
  'TRANSFER',
  'พร้อมเพย์ 081-234-5678',
  null,
]
const COD_RECEIVED: (string | null)[] = [null, '2026-08-01T03:00:00.000Z']

type Row = {
  i: number
  status: string
  hasShipment: boolean
  carrierStatus: string | null
  paymentMethod: string | null
  codReceivedAt: string | null
  fulfillmentMode: string
}

function buildCorpus(): Row[] {
  const rows: Row[] = []
  let i = 0
  // SHIPPED — คงคอมบิเนชันเดิมทั้งหมดไว้เป๊ะ (ไม่ทำให้เทสช้าลงจากที่เคยเป็น)
  for (const status of ORDER_STATUSES)
    for (const hasShipment of [true, false])
      for (const carrierStatus of CARRIER_CODES)
        for (const paymentMethod of PAYMENT_METHODS)
          for (const codReceivedAt of COD_RECEIVED)
            rows.push({
              i: i++,
              status,
              hasShipment,
              carrierStatus,
              paymentMethod,
              codReceivedAt,
              fulfillmentMode: 'SHIPPED',
            })

  /**
   * ไม่มีการจัดส่งเลย (feature 00062) — ตาม `deriveShippingStage()` เงื่อนไขนี้เป็นเงื่อนไข
   * *แรกสุด* ⇒ แกน payment/cod ไม่มีทางมีผล ไม่ต้อง cross ทุกคอมบิเนชัน (จะทำให้คอร์ปัสโต 4
   * เท่าโดยไม่ได้พิสูจน์อะไรเพิ่ม) แค่ยืนยันว่า status/hasShipment/carrierStatus ทุกค่า
   * ไม่ทำให้หลุดออกจากกิ่งนี้ไปได้
   */
  for (const fulfillmentMode of NON_SHIPPED_MODES)
    for (const status of ORDER_STATUSES)
      for (const hasShipment of [true, false])
        for (const carrierStatus of CARRIER_CODES)
          rows.push({
            i: i++,
            status,
            hasShipment,
            carrierStatus,
            paymentMethod: 'COD',
            codReceivedAt: null,
            fulfillmentMode,
          })
  return rows
}

const sqlLit = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`)

describe('สูตรกองงานตามสถานะพัสดุ — TypeScript กับ SQL ต้องให้ผลตรงกัน', () => {
  it('[blocker] ตรงกันทุกคอมบิเนชันของ input', async () => {
    if (!CAN_RUN) {
      // ไม่เงียบ — เวิร์กทรีที่ไม่มี .env จะเห็นข้อความนี้แทนการผ่านไปเฉย ๆ
      console.warn(
        '[order-stage-sql] ข้ามการเทียบกับ SQL จริง: ต้องมี DATABASE_URL ที่ชี้ localhost ' +
          `(ค่าปัจจุบัน ${DB_URL ? 'ไม่ใช่ localhost' : 'ไม่ได้ตั้ง'}) — ` +
          'เทสนี้เป็นด่านของ CR 2026-08-25 อย่าปล่อยให้ข้ามถาวร',
      )
      expect(CAN_RUN).toBe(false) // บันทึกไว้ว่าข้ามจริง ไม่ใช่ผ่าน
      return
    }

    const corpus = buildCorpus()
    const values = corpus
      .map(
        (r) =>
          `(${r.i}, ${sqlLit(r.status)}, ${r.hasShipment}, ${sqlLit(r.carrierStatus)}, ` +
          `${sqlLit(r.paymentMethod)}, ${r.codReceivedAt === null ? 'NULL' : `TIMESTAMP ${sqlLit(r.codReceivedAt.replace('T', ' ').replace('Z', ''))}`}, ` +
          `${sqlLit(r.fulfillmentMode)})`,
      )
      .join(',\n')

    const stageExpr = buildShippingStageSql({
      orderStatus: 't.order_status',
      hasShipment: 't.has_shipment',
      carrierStatus: 't.carrier_status',
      paymentMethod: 't.payment_method',
      codReceivedAt: 't.cod_received_at',
      fulfillmentMode: 't.fulfillment_mode',
    })

    // SELECT บนค่าคงที่ล้วน — ไม่มีชื่อตารางจริงปรากฏใน query นี้เลยแม้แต่ตัวเดียว
    const sql = `SELECT t.i, ${stageExpr} AS stage FROM (VALUES\n${values}\n) AS t(i, order_status, has_shipment, carrier_status, payment_method, cod_received_at, fulfillment_mode) ORDER BY t.i`

    const result = await prisma!.$queryRawUnsafe<{ i: number; stage: string }[]>(sql)
    expect(result).toHaveLength(corpus.length)

    const mismatches: string[] = []
    for (const row of result) {
      const input = corpus[Number(row.i)]
      const fromTs = deriveShippingStage({
        status: input.status,
        hasShipment: input.hasShipment,
        carrierStatus: input.carrierStatus,
        paymentMethod: input.paymentMethod,
        codReceivedAt: input.codReceivedAt ? new Date(input.codReceivedAt) : null,
        fulfillmentMode: input.fulfillmentMode,
      })
      if (fromTs !== row.stage) {
        mismatches.push(
          `status=${input.status} hasShipment=${input.hasShipment} ` +
            `carrier=${input.carrierStatus} pay=${input.paymentMethod} cod=${input.codReceivedAt} ` +
            `fulfillment=${input.fulfillmentMode} ` +
            `→ TS=${fromTs} SQL=${row.stage}`,
        )
      }
    }
    expect(mismatches).toEqual([])
  }, 60_000)
})

describe('รายชื่อสถานะใน SQL ต้องมาจาก SSOT ไม่ใช่พิมพ์เอง', () => {
  const sql = buildShippingStageSql({
    orderStatus: 'o.status',
    hasShipment: 'h',
    carrierStatus: 'cs',
    paymentMethod: 'pm',
    codReceivedAt: 'cod',
    fulfillmentMode: 'fm',
  })

  it('[blocker] ทุกรหัสใน 4 ชุดของ iship/status.ts ต้องโผล่ใน SQL', () => {
    // ด่านนี้ทำงานเสมอแม้ไม่มีฐานข้อมูล — จับเคสที่มีคนเพิ่มสถานะใหม่แล้วลืมตามมาแก้ SQL
    for (const code of [
      ...RETURNED_CARRIER_STATUSES,
      ...PROBLEM_CARRIER_STATUSES,
      ...TERMINAL_CARRIER_STATUSES,
      ...IN_TRANSIT_CARRIER_STATUSES,
    ]) {
      expect(sql).toContain(`'${code}'`)
    }
  })

  it('[blocker] กิ่ง "ตีกลับ" ต้องมาก่อนกิ่ง "ปลายทาง"', () => {
    /**
     * `return_success` อยู่ **ทั้งชุดตีกลับและชุด terminal** ⇒ ลำดับสองกิ่งนี้ตัดสินผลจริง
     * ถ้าเช็ค terminal ก่อน ของที่กลับมาถึงร้านแล้วจะกลายเป็น `DONE` (หรือ `AWAITING_COD`
     * ถ้าเป็นใบ COD) แล้วหายจากทุกไทล์ — บั๊กที่เคยเกิดจริงและ `PROBLEM_STAGE_CARRIER_STATUSES`
     * ถูกสร้างมาอุด
     *
     * 🛑 จงใจ **ไม่** ตรวจลำดับระหว่าง "ตีกลับ" กับ "มีปัญหา" — สองชุดนั้นไม่ทับกันเลย
     * (คอมเมนต์ใน `deriveShippingStage` ระบุไว้เอง + เทสเทียบผลข้างบนพิสูจน์แล้วว่าสลับ
     * แล้วผลไม่เปลี่ยน) การตรวจลำดับที่ไม่มีผลคือเทสที่จะแดงตอนคนอื่น refactor โดยไม่มีอะไรผิด
     */
    const posReturned = sql.indexOf("THEN 'RETURNED'")
    const posTerminal = sql.indexOf("'AWAITING_COD'")
    expect(posReturned).toBeGreaterThan(-1)
    expect(posTerminal).toBeGreaterThan(-1)
    expect(posReturned).toBeLessThan(posTerminal)
  })
})
