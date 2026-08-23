import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ด่าน AC-SQ-07 — ของใหม่ของ feature 00050 ต้อง **ไม่กระทบ** `ONLINE_SALES` และ `LODGING`
 *
 * 🛑 BRD เขียนไว้ตรงตัวว่า "ต้องมีเทสยืนยัน ไม่ใช่แค่ตั้งใจ"
 * (`docs/conventions/rule-must-be-enforced-not-described.md` — กฎที่เขียนไว้ ≠ กฎที่บังคับได้)
 *
 * ทั้งสอง vertical มีลูกค้าใช้จริงบน prod อยู่แล้ว: ร้านขายออนไลน์ใช้ `Order.slipFileId`
 * สำหรับสลิปโอนเงินค่าสินค้า · บ้านพักใช้ `Order.depositAmount` + สลิปสำหรับมัดจำห้อง
 * ถ้าของใหม่ไปแตะสองช่องนี้ ของเดิมพังทันทีโดยไม่มีอะไรฟ้อง (ชนิดถูกทุกตัวอักษร)
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const MIGRATION = 'prisma/migrations/20260815190000_service_queue_order_payment/migration.sql'

describe('feature 00050 ต้องไม่กระทบ vertical อื่น', () => {
  const sql = read(MIGRATION)

  it('[blocker] migration ต้อง additive ล้วน — ห้ามแตะคอลัมน์/ตารางเดิม', () => {
    /**
     * คำสั่งที่เปลี่ยนของเดิมได้ ห้ามมีแม้แต่คำเดียวในไฟล์นี้ — ร้านที่ใช้จริงมีข้อมูลอยู่แล้ว
     * (ร้านอ้างอิง BT Premium มี 8 ออเดอร์) migration ที่ทำให้ข้อมูลเดิมอ่านไม่ได้
     * คือความเสียหายที่ย้อนกลับไม่ได้
     */
    for (const forbidden of [
      'DROP TABLE',
      'DROP COLUMN',
      'ALTER COLUMN',
      'RENAME',
      'TRUNCATE',
      'DELETE FROM',
      'UPDATE "Order"',
    ]) {
      expect(sql.toUpperCase(), `migration ห้ามมีคำสั่ง ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('[blocker] migration ห้ามแตะตาราง Order เลยแม้แต่คำสั่งเดียว', () => {
    /**
     * 🛑 ร่างแรกของเทสนี้ห้าม **สตริง** `"slipFileId"` ทั้งไฟล์ — แล้วแดงทันที เพราะตารางใหม่
     * `OrderPayment` มีคอลัมน์ชื่อเดียวกันโดยชอบธรรม (สลิปของก้อนเงินนั้น)
     * กฎจริงคือ **ห้ามแตะตาราง `Order`** ไม่ใช่ห้ามใช้คำว่า slipFileId
     * (ด่านต้องตรวจ *สิ่งที่ห้าม* ไม่ใช่ *การสะกด* — บทเรียนซ้ำจาก HR9 grep gate)
     */
    expect(sql, 'ห้ามมีคำสั่งใด ๆ ที่แก้ตาราง Order').not.toMatch(/ALTER TABLE\s+"Order"/)
    // ยืนยันว่าคำสั่ง ALTER ที่มี แตะเฉพาะตารางใหม่ของเราเอง
    for (const m of sql.matchAll(/ALTER TABLE\s+"(\w+)"/g)) {
      expect(m[1], 'ALTER ได้เฉพาะตารางที่ feature นี้สร้างเอง').toBe('OrderPayment')
    }
    // ยืนยันว่ายังมีอยู่ในสคีมาตามเดิม (ไม่ได้ถูกลบไปที่อื่น)
    const schema = read('prisma/schema.prisma')
    const order = schema.match(/^model Order \{[\s\S]*?^\}/m)?.[0] ?? ''
    expect(order, 'Order.slipFileId ต้องยังอยู่').toContain('slipFileId')
    expect(order, 'Order.depositAmount ต้องยังอยู่').toContain('depositAmount')
  })

  it('[blocker] ไม่มี backfill — ห้ามเดาย้อนหลังว่าใบไหนจ่ายแล้ว', () => {
    /**
     * ระบบไม่เคยรู้เรื่อง "ได้รับเงินแล้ว" มาก่อน ⇒ ไม่มีข้อมูลให้ย้าย
     * การเดาว่า "มี slipFileId = จ่ายแล้ว" คือการแต่งข้อเท็จจริงทางการเงินขึ้นมาเอง
     * และขัดกับกฎข้อแรกของฟีเจอร์นี้เอง ("มีสลิป ≠ ได้รับเงิน")
     */
    expect(sql.toUpperCase()).not.toContain('INSERT INTO "ORDERPAYMENT"')
    expect(sql.toUpperCase()).not.toContain('INSERT INTO')
  })

  it('[blocker] CHECK ต้องเป็นของตัวเอง ไม่ใช่แก้ CHECK เดิมแบบรายชื่อค่า', () => {
    /**
     * บทเรียน migration 20260806120000: สอง branch แก้ CHECK ตัวเดียวกันแบบ hardcode รายชื่อ
     * แล้วตัวที่รันทีหลังลบค่าของอีกฝั่งเงียบ ๆ (migrate สำเร็จทุกไฟล์ ไม่มี error)
     * ⇒ CHECK ใหม่ต้องผูกกับตารางใหม่และมีชื่อเฉพาะเจาะจง
     */
    expect(sql).toContain('OrderPayment_amount_positive')
    // ห้ามมี DROP CONSTRAINT ของใคร — นั่นคือรูปร่างของบั๊กนั้น
    expect(sql.toUpperCase()).not.toContain('DROP CONSTRAINT')
  })

  it('[blocker] ตัวคำนวณเงินต้องไม่อ่านคอลัมน์ที่ vertical อื่นใช้อยู่', () => {
    /**
     * `computeOrderMoney` รับเฉพาะ totalAmount / depositAgreed / payments —
     * ห้ามแอบไปอ่าน `slipFileId` มาตีความว่าจ่ายแล้ว ซึ่งจะทำให้ออเดอร์ของร้านขายออนไลน์
     * ที่แนบสลิปไว้ กลายเป็น "จ่ายแล้ว" ในสายตาของระบบใหม่ทันทีทั้งที่ไม่มีใครยืนยัน
     */
    const lib = read('src/lib/order-payment.ts')
    expect(lib).not.toContain('slipFileId')
  })

  it('[blocker] service ต้อง scope ด้วย shopId ทุก query ที่รับ input ภายนอก', () => {
    /**
     * 🛑 ร่างแรกของด่านนี้ **นับหัว** — นับจำนวน `prisma.x.findFirst(` เทียบกับจำนวน
     * `shopId: args.shopId` แล้วขอให้ฝั่งหลังไม่น้อยกว่า **ซึ่งผ่านแบบบังเอิญพอดีตัว 6 ชน 6**:
     *   · `listPayments` มี `orderPayment.findMany({ where: { orderId } })` ที่ **ไม่มี** shopId
     *     (ถูกต้องตามเจตนา — orderId มาจากการอ่านที่ scope แล้ว)
     *   · `sumReceivedInRange` (ถูกลบไปแล้ว 2026-08-23) **มี** shopId แต่ใช้ `groupBy`
     *     ซึ่ง regex ไม่ได้นับเป็น query
     * สองอย่างนี้หักกลบกันพอดี ⇒ ถ้ามีใครเขียน query ที่ไม่ scope จริง ๆ เพิ่มเข้ามา
     * ด่านก็ยังเขียวตราบใดที่มี `shopId` ว่าง ๆ เหลืออยู่ที่อื่นในไฟล์
     *
     * ด่านที่ถูกต้องต้องผูก **คำสั่งกับ where ของคำสั่งนั้น** ไม่ใช่ยอดรวมของทั้งไฟล์
     * (คลาสเดียวกับ `rule-must-be-enforced-not-described.md` — ด่านที่ผ่านได้โดยไม่ต้องถูก)
     */
    const svc = read('src/services/order-payment.service.ts')

    /** ดึงคำสั่ง prisma ทีละตัวพร้อมเนื้อในวงเล็บ (จับคู่วงเล็บเอง ไม่ใช้ regex ข้ามบรรทัด) */
    const calls: { name: string; body: string }[] = []
    const re = /prisma\.(\w+)\.(\w+)\(/g
    let m: RegExpExecArray | null
    while ((m = re.exec(svc)) !== null) {
      let depth = 0
      let i = re.lastIndex - 1
      for (; i < svc.length; i++) {
        if (svc[i] === '(') depth++
        else if (svc[i] === ')' && --depth === 0) break
      }
      calls.push({ name: `${m[1]}.${m[2]}`, body: svc.slice(re.lastIndex, i) })
    }

    expect(calls.length, 'ต้องเจอคำสั่ง prisma ในไฟล์').toBeGreaterThan(0)

    for (const call of calls) {
      // คำสั่งที่เงื่อนไขมาจากผู้เรียกเท่านั้นที่ต้อง scope — ตัวที่ใช้ id ที่อ่านมาแล้วไม่ต้อง
      if (!call.body.includes('args.')) continue
      expect(
        call.body,
        `${call.name}: query ที่รับ input จากผู้เรียกต้องมี shopId — ร้านอื่นต้อง "หาไม่เจอ" ไม่ใช่ "เจอแล้วถูกปฏิเสธ"`,
      ).toContain('shopId')
    }
  })

  it('[blocker] route ของเงินต้องรับ ?shopId= จากกล่องแชท ห้ามเชื่อ activeShopId อย่างเดียว', () => {
    /**
     * 🛑 ปุ่มเรื่องเงินอยู่ใน**กล่องแชท** ซึ่งเปิดเธรดของร้าน B ได้ขณะ active อยู่ร้าน A (BR-UNI-07)
     * ถ้า guard ใช้ `activeShopId` อย่างเดียว query จะ scope ผิดร้าน → "หาไม่เจอ" → **ปุ่มที่กด
     * กี่ครั้งก็ไม่มีวันผ่าน** (บทเรียน iShip retry 2026-08-06 · เหตุผลเดียวกับที่ `requireGeneralShop`
     * งอก `opts.shopId` มาที่ 00037) และพี่น้องทุกตัวในโฟลเดอร์แชทส่ง `?shopId=` กันหมดแล้ว
     * (`ProductPickerPanel` · `QuickMessageBar` · `AiSuggestPanel` — `sibling-surface-parity`)
     *
     * ด่านนี้ตรวจ **การส่งค่าเข้า guard** ไม่ใช่แค่ว่ามีคำว่า shopId อยู่ในไฟล์
     */
    for (const rel of [
      'src/app/api/orders/[token]/payments/route.ts',
      'src/app/api/orders/[token]/payments/[paymentId]/route.ts',
    ]) {
      const src = read(rel)
      const bare = src.match(/requireShopMember\(\s*\)/g) ?? []
      expect(bare.length, `${rel}: ห้ามเรียก requireShopMember() เปล่า — ต้องส่ง shopId ของเธรดเข้าไป`).toBe(0)
      expect(src, `${rel}: ต้องอ่าน shopId จาก query string`).toMatch(/searchParams\.get\('shopId'\)/)
    }
  })

  it('[blocker] ยกเลิกรายการรับเงินต้องผูกกับออเดอร์ใน URL ไม่ใช่แค่ร้านตรง', () => {
    /**
     * `DELETE /api/orders/{ออเดอร์ B}/payments/{รายการของออเดอร์ A}` ต้องไม่สำเร็จ —
     * ไม่งั้นยอดของใบที่ผู้ใช้กำลังดูอยู่ไม่ขยับ ส่วนอีกใบเปลี่ยนโดยไม่มีใครรู้
     * (client ถือ token ค้างจากจอก่อนหน้าเป็นเรื่องปกติในกล่องแชทที่สลับเธรดไปมา)
     */
    const svc = read('src/services/order-payment.service.ts')
    /**
     * 🛑 ตัดตั้งแต่หัวฟังก์ชันจนถึง `export` ตัวถัดไป — **ห้ามใช้ `[\s\S]*?\n}`**
     * เพราะมันหยุดที่วงเล็บปิดของ *ชนิด args* (ซึ่งอยู่คอลัมน์ 0 เหมือนกัน) ได้แค่ลายเซ็น
     * ไม่ใช่เนื้อฟังก์ชัน ⇒ ด่านแดงค้างโดยที่โค้ดถูกอยู่แล้ว (คลาสเดียวกับ `^\s+` ที่กิน `\n`)
     */
    const start = svc.indexOf('export async function voidPayment')
    expect(start, 'ต้องมีฟังก์ชัน voidPayment').toBeGreaterThan(-1)
    const nextExport = svc.indexOf('\nexport ', start + 1)
    const fn = svc.slice(start, nextExport === -1 ? undefined : nextExport)
    expect(fn, 'voidPayment ต้องรับ orderToken').toContain('orderToken')
    expect(fn, 'ต้องกรองด้วย publicToken ของออเดอร์ใน where ไม่ใช่เทียบทีหลัง').toMatch(
      /order:\s*\{[^}]*publicToken:\s*args\.orderToken/,
    )
  })

  it('[blocker] ออเดอร์ในแชทต้องมี payments ทั้งชุดแรกและชุดที่ lazy-load ต่อ', () => {
    /**
     * 🛑 ออเดอร์ในกล่องแชทมาจาก **2 query คนละไฟล์**: `page.tsx` ดึง 20 ใบแรก ส่วนใบที่ 21
     * ขึ้นไปมาจาก `getOrdersByCustomer()` — คอมเมนต์ในทั้งสองไฟล์เตือนเรื่องนี้ไว้เองมาตั้งแต่
     * feature 00024 แต่**ไม่เคยมีด่านจริง** (กฎที่เขียนไว้ ≠ กฎที่บังคับได้)
     *
     * ถ้าชุดหลังขาด `payments` ออเดอร์ใบที่ 21 ขึ้นไปจะอ่านเป็น "ยังไม่มีใครกดยืนยันการรับเงิน"
     * ทั้งที่รับครบแล้ว ⇒ ปุ่ม "รับเงินแล้ว" โผล่ซ้ำ และร้านเก็บเงินซ้ำได้จริง — เงียบสนิท
     * เพราะ `payments?: []` เป็น optional ที่ `tsc` ยอมทุกทาง
     */
    for (const rel of [
      'src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx',
      'src/services/order.service.ts',
    ]) {
      const src = read(rel)
      expect(src, `${rel}: ต้อง select payments มาพร้อมออเดอร์`).toMatch(
        /payments:\s*\{\s*select:\s*\{[^}]*kind[^}]*amount[^}]*voidedAt/,
      )
      expect(src, `${rel}: ต้อง serialize voidedAt เป็น ISO ไม่ใช่ส่ง Date ข้าม boundary`).toMatch(
        /voidedAt:\s*p\.voidedAt\s*\?\s*p\.voidedAt\.toISOString\(\)\s*:\s*null/,
      )
    }
  })

  it('[blocker] ห้ามมีฟังก์ชันแก้ยอดเงินที่รับไปแล้ว', () => {
    /**
     * หัวหน้ายืนยัน 2026-08-15: "จ่ายมาแล้ว แก้ไม่ได้"
     * แก้ได้ทางเดียวคือยกเลิกรายการ (`voidPayment`) แล้วบันทึกใหม่
     */
    const svc = read('src/services/order-payment.service.ts')
    expect(svc, 'ห้ามมี orderPayment.update() ที่แก้ amount').not.toMatch(
      /orderPayment\.update\(\s*\{[\s\S]{0,200}amount:/,
    )
    expect(svc, 'ต้องมีทางยกเลิกรายการแทน').toContain('voidPayment')
  })
})
