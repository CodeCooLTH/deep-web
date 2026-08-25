/**
 * [blocker] ทิศทางพัสดุ (feature 00056 · BR-RT-07)
 *
 * ระบบคืนของเก็บพัสดุ **ขากลับ** ไว้ใน `OrderShipment` ตารางเดียวกับขาไป (เพื่อใช้
 * `createShipment()` ที่ถือตรรกะทั้งหมดของการเปิดพัสดุซ้ำ) ⇒ ทุก query ที่หา "พัสดุของ
 * ออเดอร์นี้" ต้องระบุ `direction` ไม่งั้นจะหยิบพัสดุขากลับมาเป็นพัสดุขาไป แล้ว:
 *   - ออเดอร์ที่คืนของแล้วกลับไปขึ้น "กำลังจัดส่ง"
 *   - ไทล์กองงานนับซ้ำ · ยอดขายเฟ้อ
 *   - ระบบปิดออเดอร์อัตโนมัติว่า "ผู้ซื้อได้รับของแล้ว" ตอนพัสดุขากลับถึงร้าน (ตรงข้ามความจริง)
 * **ทั้งหมดนี้เงียบสนิท** — ไม่มี error ไม่มี type ผิด มีแค่ตัวเลขที่ผิดบนจอ
 *
 * แดง = ห้าม merge
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  ACTIVE_FORWARD_SHIPMENT,
  FORWARD_SHIPMENT,
  LATEST_FORWARD_SHIPMENT,
  RETURN_SHIPMENT,
} from '../shipment-direction'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

describe('ค่ากลาง', () => {
  it('ตัวกรองพัสดุขาไปต้องครบ 3 เงื่อนไข', () => {
    expect(ACTIVE_FORWARD_SHIPMENT).toEqual({
      status: 'CREATED',
      isDryRun: false,
      direction: FORWARD_SHIPMENT,
    })
    expect(FORWARD_SHIPMENT).not.toBe(RETURN_SHIPMENT)
  })

  /**
   * 🛑 `revenueOrderWhere` spread ตัวนี้เข้า `where` ของ Prisma และไฟล์นั้นเขียนเตือนไว้เองว่า
   * readonly object จะทำให้ Prisma assign ไม่ผ่าน แล้ว **TS เลิก infer ทั้ง query — error ลาม
   * ไปถึง select ที่ไม่เกี่ยวเลย** (เจอจริงตอนเขียนรอบนี้)
   */
  it('[blocker] ห้ามเป็น readonly (`as const`) — Prisma จะเลิก infer ทั้ง query', () => {
    const src = stripComments(read('src/lib/shipment-direction.ts'))
    const i = src.indexOf('export const ACTIVE_FORWARD_SHIPMENT')
    // 🛑 ต้องกินบรรทัดปิดวงเล็บด้วย — `as const` อยู่ **หลัง** `}` ไม่ใช่ข้างใน
    // (mutation รอบแรกใส่ `as const` กลับแล้วเทสยังเขียว เพราะ slice ตัดมันทิ้งพอดี)
    const decl = src.slice(i, src.indexOf('\n\n', i))
    expect(decl).not.toContain('as const')
  })
})

describe('[blocker] ทุกจุดที่กรองพัสดุต้องระบุ direction', () => {
  /** ไฟล์ที่ query พัสดุของออเดอร์ — ไล่จากการค้นจริง ไม่ใช่รายชื่อที่จำมา */
  const PRISMA_SITES = [
    'src/lib/order-revenue.ts',
    'src/lib/public-order-count.ts',
    'src/services/badge.service.ts',
    'src/services/buyer-reputation.service.ts',
    // 🛑 ตกรอบมาแล้ว **2 ครั้ง** (นิยาม CREATED+isDryRun 2026-08-06 · direction 2026-08-24)
    // ทั้งที่คอมเมนต์ในไฟล์อ้างว่าใช้นิยามร่วมอยู่ตลอด — ผูกไว้ที่นี่ไม่ให้ตกเป็นครั้งที่ 3
    'src/services/customer-behavior.service.ts',
    'src/services/line-rich-menu-reply.service.ts',
    'src/services/order-auto-confirm.service.ts',
    'src/services/order.service.ts',
    'src/services/shop.service.ts',
  ]

  it('จุด Prisma ต้องใช้ ACTIVE_FORWARD_SHIPMENT ไม่ใช่พิมพ์ object เอง', () => {
    for (const p of PRISMA_SITES) {
      const src = stripComments(read(p))
      // 🛑 ต้องจับ **การใช้งาน** ไม่ใช่ชื่อเปล่า ๆ — `toContain('ACTIVE_FORWARD_SHIPMENT')` เฉย ๆ
      // match บรรทัด `import` ด้วย ⇒ ลบ `where:` ที่ใช้จริงทิ้งแล้วเทสยังเขียว (พิสูจน์ด้วย
      // mutation 2026-08-25: คืน `{ status: { not: 'CANCELLED' } }` กลับไป → 7/7 เขียวหมด)
      // สองรูปแบบที่ใช้จริงในรีโป: `where: ACTIVE_FORWARD_SHIPMENT` และ `...ACTIVE_FORWARD_SHIPMENT`
      expect(src, `${p}: ต้อง *ใช้* ACTIVE_FORWARD_SHIPMENT ไม่ใช่แค่ import`).toMatch(
        /(where:\s*ACTIVE_FORWARD_SHIPMENT|\.\.\.ACTIVE_FORWARD_SHIPMENT)/,
      )
      // object ที่พิมพ์เองห้ามกลับมา — มันจะขาด direction เงียบ ๆ
      expect(src, p).not.toMatch(/status: ['"]CREATED['"],\s*\n?\s*isDryRun: false,\s*\n?\s*carrierStatus/)
    }
  })

  /**
   * ทะเบียนลูกค้า (feature 00057) เป็น "จุดที่กรองพัสดุ" จุดใหม่ที่เกิดหลัง 00056 —
   * แต่มันอยู่ใน PRISMA_SITES ไม่ได้ เพราะ **จงใจไม่ใส่ `where` ใน query**: มันต้องได้พัสดุ
   * ทุกใบเพื่อให้ `countsAsRevenue()` ทำ `.some()` ได้ครบ แล้วค่อยคัดใบขาไปในหน่วยความจำ
   * สำหรับตัดสินพฤติกรรมลูกค้า ⇒ ด่านของมันคือการคัดในหน่วยความจำนั้น
   *
   * 🛑 ถ้าคัดออกไป: `find` จะหยิบพัสดุขากลับ (ซึ่งถูกสร้างทีหลังเสมอ) มาเป็นพัสดุของออเดอร์
   * แล้ว `carrierStatus` ของมันไปบัง `return_success` ของใบขาไป ⇒ **ป้าย "ตีกลับ" หายไปจาก
   * ลูกค้าที่ตีกลับจริง** ซึ่งเป็นกลุ่มเดียวที่ป้ายนี้มีไว้เตือน
   */
  it('[blocker] ทะเบียนลูกค้าต้องคัดพัสดุขาไปตอนตัดสินพฤติกรรม', () => {
    const src = stripComments(read('src/services/customer-directory.service.ts'))
    // จับ **การใช้งานจริง** ไม่ใช่ชื่อเปล่า ๆ (บรรทัด import ก็ match คำนั้น)
    expect(src).toContain('direction === FORWARD_SHIPMENT')
    // และต้อง select `direction` มาด้วย ไม่งั้นค่าเป็น undefined แล้วเงื่อนไขเป็นเท็จตลอด
    expect(src).toContain('direction: true')
  })

  it('[blocker] จุด raw SQL ต้องมี direction ในเงื่อนไขเดียวกับ isDryRun', () => {
    for (const p of ['src/services/chat.service.ts', 'src/services/order-stage.service.ts']) {
      const src = stripComments(read(p))
      const hits = src.match(/"isDryRun" = false[^\n]*/g) ?? []
      expect(hits.length, p).toBeGreaterThan(0)
      for (const line of hits) {
        expect(line, `${p}: ${line}`).toContain('"direction" = \'FORWARD\'')
      }
    }
  })

  /**
   * 🛑 ปิดออเดอร์อัตโนมัติเป็นจุดที่พลาดแล้วเสียหายที่สุด — พัสดุขากลับที่ส่งถึง *ร้าน* แล้ว
   * จะถูกอ่านว่า "ผู้ซื้อได้รับของแล้ว" ⇒ ระบบปิดออเดอร์ให้ทั้งที่ของอยู่ในมือร้าน
   */
  it('[blocker] ตัวปิดออเดอร์อัตโนมัติต้องนับเฉพาะพัสดุขาไป', () => {
    const src = stripComments(read('src/services/order-auto-confirm.service.ts'))
    // 🛑 ต้องจับ **การใช้งาน** (`...ACTIVE_FORWARD_SHIPMENT`) ไม่ใช่ชื่อเปล่า ๆ — บรรทัด
    // `import` ก็ match คำนั้น (mutation รอบแรกเปลี่ยนไปพิมพ์เงื่อนไขเองแล้วเทสยังเขียว
    // docs/conventions/mutation-silence-means-weak-corpus.md)
    expect(src).toContain('...ACTIVE_FORWARD_SHIPMENT')
    expect(src).not.toMatch(/status: ['"]CREATED['"],\s*isDryRun: false/)
  })

  it('[blocker] countsAsRevenue ต้องบังคับ direction เป็น field ที่ขาดไม่ได้', () => {
    const src = stripComments(read('src/lib/order-revenue.ts'))
    // optional เมื่อไร ผู้เรียกที่ลืม select จะได้ undefined เงียบ ๆ แล้วยอดขายเพี้ยนทั้งระบบ
    expect(src).not.toMatch(/direction\?:/)
    expect(src).toMatch(/direction: string/)
    expect(src).toContain(`s.direction === "FORWARD"`)
  })
})

/**
 * [blocker] 2026-08-25 — ด่านใหม่หลังปลดล็อก partial unique index
 *
 * 🛑 index เดิม `ON ("orderId") WHERE status <> 'CANCELLED'` บังคับว่าออเดอร์หนึ่งมีพัสดุที่
 * ยังไม่ยกเลิกได้ **ใบเดียว** ⇒ ทุกจุดที่เขียน `where: { status: { not: 'CANCELLED' } }`
 * + `take: 1` แล้วเรียกผลว่า "พัสดุของออเดอร์นี้" **ถูกโดยบังเอิญ** มาตลอด
 *
 * พอ index กลายเป็น `("orderId","direction")` เพื่อปลดล็อกระบบคืนของ ข้อสมมตินั้นหายไป และ
 * เพราะเรียง `createdAt desc` **พัสดุขากลับซึ่งเกิดทีหลังเสมอจะชนะทุกครั้ง** ⇒ เลขพัสดุในการ์ด
 * แชท · สถานะที่ตัดสินพฤติกรรมลูกค้า · ใบที่ถูกพิมพ์ตอนสั่งพิมพ์ยกชุด กลายเป็นของ *ขากลับ*
 * ทั้งหมด โดยไม่มี error ไม่มี type ผิด มีแค่ข้อมูลที่ผิดบนจอ
 *
 * เทสนี้สแกน **ทั้ง `src/`** ไม่ใช่รายชื่อไฟล์ที่จำมา — จุดใหม่ที่ใครเพิ่มทีหลังต้องโดนด้วย
 */
describe('[blocker] ห้ามถาม "พัสดุของออเดอร์นี้" โดยไม่ระบุทิศทาง', () => {
  const walk = (dir: string): string[] => {
    const out: string[] = []
    for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) out.push(...walk(p))
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
    return out
  }

  it('ไม่มีไฟล์ไหนเขียน `status: { not: \'CANCELLED\' }` เปล่า ๆ ในตัวกรองพัสดุ', () => {
    const offenders: string[] = []
    for (const f of walk('src')) {
      // ข้ามไฟล์ที่ *อธิบาย* กฎนี้เอง — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนไว้ด้วย
      // (คลาสเดียวกับ HR9 grep gate ที่แดงค้างจากคอมเมนต์ของตัวเอง 2026-08-02→03)
      if (f.endsWith('shipment-direction.ts') || f.includes('__tests__')) continue
      const src = stripComments(read(f))
      if (/where: \{ status: \{ not: ['"]CANCELLED['"] \} \}/.test(src)) offenders.push(f)
    }
    expect(
      offenders,
      `ใช้ LATEST_FORWARD_SHIPMENT แทน — ไม่งั้นพัสดุขากลับ (ซึ่งใหม่กว่าเสมอ) จะชนะ take:1`,
    ).toEqual([])
  })

  it('ตัวกรองใหม่ต้องมีทั้ง status และ direction', () => {
    expect(LATEST_FORWARD_SHIPMENT).toEqual({
      status: { not: 'CANCELLED' },
      direction: FORWARD_SHIPMENT,
    })
  })
})
