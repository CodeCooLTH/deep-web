import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ด่านรวม AC-SQ-07 — **ทุกจอที่ฟีเจอร์ร้านบริการเพิ่มเข้ามา ต้องกั้นด้วย `vertical`**
 *
 * 🛑 เหตุผลที่ต้องเป็นด่านแยก ไม่ใช่เชื่อว่าเขียนถูกแล้ว: ตอน audit พบว่า 2 จอ
 * (`/o/[token]` และ `/orders/[token]`) กั้นด้วย *"ออเดอร์ใบนี้มีมัดจำไหม"* ซึ่ง
 * **ปลอดภัยเพราะข้อมูลบังเอิญเป็นแบบนั้น** ไม่ใช่เพราะกฎ:
 *   · ONLINE_SALES 269 ใบบน prod — ไม่มีมัดจำเลยสักใบ
 *   · ยังไม่มีร้าน LODGING บน prod — แต่บ้านพัก **เก็บมัดจำทุกใบ** (`booking.service.ts`)
 * ⇒ วันแรกที่มีร้านบ้านพัก การ์ดจะโผล่บนจอที่ไม่ได้ขอ โดยไม่มี gate ไหนฟ้อง
 *
 * "ยังไม่มีใครเดินผ่านเส้นทางนั้น" ไม่ใช่ด่าน (`rule-must-be-enforced-not-described.md`)
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** ทุกจอที่ฟีเจอร์นี้แตะ + นิพจน์ที่ต้องเจอในซอร์ส (ไม่ใช่แค่คำว่า SERVICE_QUEUE ลอย ๆ) */
const GATED: { name: string; path: string; must: RegExp }[] = [
  {
    name: 'แชท — แถบมือถือ',
    path: 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/OrderProgressBar.tsx',
    must: /isService\s*\n?\s*\?\s*computeOrderMoneyFromSerialized/,
  },
  {
    name: 'แชท — แผงขวาเดสก์ท็อป',
    path: 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanel.tsx',
    must: /vertical === 'SERVICE_QUEUE'\s*\n?\s*\?\s*computeOrderMoneyFromSerialized/,
  },
  {
    name: 'แชท — กดค้างบนสลิป',
    path: 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/ChatThread.tsx',
    must: /vertical === 'SERVICE_QUEUE'/,
  },
  {
    /**
     * 🛑 ห้ามผูกกับรูปประโยค — ร่างแรกเขียน `? getMoneyReceivedToday(` ตรง ๆ แล้วแดงทันที
     * ที่โค้ดถูก refactor เป็น `? Promise.all([...])` ทั้งที่ด่านยังอยู่ครบทุกตัวอักษร
     * (พลาดคลาสนี้ 3 ครั้งในวันเดียว — `rule-must-be-enforced-not-described.md`)
     * ตัวจริงที่ต้องบังคับคือ **query เรื่องเงินต้องอยู่หลังด่าน** ซึ่งเช็คด้วยลำดับตำแหน่งด้านล่าง
     *
     * 🛑 ย้ายที่อยู่ 2026-08-23 — ด่านเคยอยู่ที่ `dashboard/page.tsx` ตอนที่เงินรับจริงเป็น
     * "แถวของวันนี้" บนหน้าแรก · ตอนนี้เป็น **คอลัมน์รายวันในตารางชีตยอดขาย** ด่านจึงย้ายไป
     * อยู่กับตัวที่คิดเลข (`getSalesSeries`) ซึ่งเป็นทางผ่านของทั้งหน้าแรกและ API
     */
    name: 'ชุดเงินรายวัน — ตัวคิดเลขของชีตยอดขาย',
    path: 'src/services/dashboard.service.ts',
    must: /vertical === 'SERVICE_QUEUE'/,
  },
  {
    name: 'หน้าออเดอร์ฝั่งร้าน',
    path: 'src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx',
    must: /if \(shop\.vertical !== 'SERVICE_QUEUE'\) return null/,
  },
  {
    name: 'หน้าออเดอร์ฝั่งลูกค้า',
    path: 'src/app/(marketing)/o/[token]/page.tsx',
    must: /if \(order\.shop\.vertical !== 'SERVICE_QUEUE'\) return null/,
  },
]

describe('AC-SQ-07 — ทุกจอของฟีเจอร์ร้านบริการต้องกั้นด้วย vertical', () => {
  for (const g of GATED) {
    it(`[blocker] ${g.name}`, () => {
      expect(stripComments(read(g.path)), `${g.path}: ไม่พบด่าน vertical`).toMatch(g.must)
    })
  }

  it('[blocker] ร้านที่ไม่ใช่ร้านบริการต้องไม่ถูกดึงตาราง OrderPayment มาด้วย', () => {
    /**
     * ด่านข้างบนพิสูจน์แค่ว่า "มีคำว่า SERVICE_QUEUE" — ตัวนี้พิสูจน์ว่า **การดึงข้อมูลเงิน
     * อยู่หลังธงนั้นจริง** ไม่ใช่ดึงมาทุกร้านแล้วค่อยกรองตอน render
     *
     * `payments` เป็น relation ที่มีได้หลายสิบแถวต่อออเดอร์ · ดึงมาให้ร้านขายออนไลน์ที่ไม่มี
     * ทางใช้เลย = จ่าย join ฟรีทุกครั้งที่มีคนเปิดหน้าแรก โดยไม่มีอะไรบนจอบอกว่ากำลังจ่ายอยู่
     */
    const code = stripComments(read('src/services/dashboard.service.ts'))

    // ธงต้องมาจากการเทียบ vertical ตรง ๆ ไม่ใช่รับ boolean มาจากผู้เรียก (ซึ่งโกหกได้)
    expect(code, 'ต้อง derive ธงจาก vertical ในไฟล์นี้').toMatch(
      /isServiceShop\s*=\s*vertical === 'SERVICE_QUEUE'/,
    )

    const at = code.indexOf('payments:')
    expect(at, 'ต้องมีการดึง payments').toBeGreaterThan(-1)
    /* ต้องอยู่ในสาขาของธง — ดูย้อนขึ้นไปในระยะสั้น ๆ ว่ามี `isServiceShop ?` คุมอยู่จริง */
    const before = code.slice(Math.max(0, at - 300), at)
    expect(before, 'payments ต้องอยู่ใต้เงื่อนไข isServiceShop').toContain('isServiceShop')
  })

  it('[blocker] ไม่ใช่ร้านบริการ = ไม่มีคีย์เลย ห้ามส่งอาร์เรย์ศูนย์', () => {
    /**
     * 🛑 `undefined` (ไม่ใช่ร้านบริการ) กับ `[0,0,…]` (เป็นร้านบริการแต่ยังไม่มีเงินเข้า)
     * คนละความหมาย และ **ตารางใช้ตัวนี้ตัดสินว่าจะโชว์คอลัมน์ชุดไหน** — ส่งศูนย์มาเมื่อไหร่
     * ร้านขายออนไลน์จะได้หัวคอลัมน์ "มัดจำ/รับจริง/ค้างรับ" ที่ว่างทั้งตารางแทนต้นทุน/กำไร
     * (คลาสเดียวกับ `0` ที่ถูกใช้แทน "ไม่รู้" — `partial-data-must-be-labeled-or-filled.md`)
     */
    const code = stripComments(read('src/services/dashboard.service.ts'))
    expect(code, 'ต้อง spread แบบมีเงื่อนไข ไม่ใช่ใส่คีย์เสมอ').toMatch(
      /\.\.\.\(depositValues && receivedValues \? \{ depositValues, receivedValues \} : \{\}\)/,
    )
    expect(code, 'อาร์เรย์ต้องถูกสร้างเฉพาะร้านบริการ').toMatch(
      /receivedValues\s*=\s*isServiceShop \? new Array/,
    )
  })

  it('[blocker] ห้ามกั้นด้วย "มีเรื่องเงินไหม" เพียงอย่างเดียวในจอที่เป็นหน้าออเดอร์', () => {
    /**
     * เกณฑ์ `hasMoneyStory()` ยังอยู่ได้ (กันบล็อกว่างเปล่า) แต่ต้องมีด่าน vertical
     * **มาก่อน** เสมอ — ไม่ใช่แทนกัน
     *
     * 🛑 เดิมด่านนี้ค้นหานิพจน์ดิบ `totalReceived === 0 && !m.hasDeposit` แล้วแดงทันทีที่
     * เกณฑ์นั้นถูกยกเป็นฟังก์ชันร่วม ทั้งที่ของยังครบทุกจอ — ด่านที่ผูกกับ *วิธีเขียน* พังเมื่อ
     * refactor (พลาดคลาสนี้มาหลายครั้ง) ตอนนี้ตรวจ **ชื่อเกณฑ์** ซึ่งเป็นสิ่งที่ต้องมีจริง
     */
    for (const rel of [
      'src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx',
      'src/app/(marketing)/o/[token]/page.tsx',
    ]) {
      const code = stripComments(read(rel))
      const vAt = code.search(/vertical !== 'SERVICE_QUEUE'/)
      const dAt = code.search(/hasMoneyStory\(/)
      expect(vAt, `${rel}: ต้องมีด่าน vertical`).toBeGreaterThan(-1)
      expect(dAt, `${rel}: ต้องมีเกณฑ์ "ไม่มีเรื่องเงิน"`).toBeGreaterThan(-1)
      expect(vAt, `${rel}: ด่าน vertical ต้องมาก่อน`).toBeLessThan(dAt)
    }
  })

  /**
   * [blocker] หน้ารายการ `/orders` — ด่านต้องอยู่ที่ **จุดดึงข้อมูล** ไม่ใช่แค่ตอนแสดงผล
   *
   * 🛑 ที่นี่มีกับดักเฉพาะตัวที่จอเดี่ยวไม่มี: การคำนวณเงินกับการดึงแถวเงินเป็นคนละบรรทัด
   * ถ้าสองที่ใช้คนละเงื่อนไข จะเกิดเคส "คำนวณเงินโดยไม่มีแถวเงินอยู่ในมือ" ⇒ ทุกใบอ่านได้ว่า
   * ยังไม่จ่ายสักบาท ทั้งที่ลูกค้าจ่ายครบแล้ว — ค่าที่หายไปตอนดึงอ่านไม่ต่างจากศูนย์จริงเลย
   * และไม่มี `tsc`/build ตัวไหนฟ้อง จึงบังคับให้ทั้งคู่อ่านจาก **สัญลักษณ์ตัวเดียวกัน**
   */
  it('[blocker] /orders — เงื่อนไขดึงแถวเงินกับเงื่อนไขคำนวณต้องเป็นสัญลักษณ์ตัวเดียวกัน', () => {
    const rel = 'src/app/(paces)/seller/(dashboard)/orders/page.tsx'
    const code = stripComments(read(rel))

    // ตัวแปรที่ถือคำตอบ "ร้านนี้เป็นร้านบริการไหม" ต้องถูกประกาศจาก SSOT ไม่ใช่เทียบสตริงเอง
    expect(code, `${rel}: ต้องประกาศ isServiceQueue จาก canUseAppointments`).toMatch(
      /const isServiceQueue = canUseAppointments\(shop\)/,
    )
    const declAt = code.search(/const isServiceQueue = canUseAppointments\(shop\)/)
    const fetchAt = code.search(/withPayments: isServiceQueue/)
    const useAt = code.search(/money: !isServiceQueue/)

    expect(fetchAt, `${rel}: จุดดึงต้องกั้นด้วย isServiceQueue`).toBeGreaterThan(-1)
    expect(useAt, `${rel}: จุดคำนวณต้องกั้นด้วย isServiceQueue`).toBeGreaterThan(-1)
    expect(declAt, `${rel}: ต้องประกาศก่อนจุดดึง ไม่งั้นจุดดึงจะเขียนเงื่อนไขของตัวเอง`).toBeLessThan(
      fetchAt,
    )

    // เกณฑ์ที่สองต้องเป็นตัวเดียวกับหน้ารายละเอียด ไม่ใช่ปล่อยผ่านทุกใบ
    expect(code, `${rel}: ต้องใช้ hasMoneyStory ตัวเดียวกับหน้ารายละเอียด`).toMatch(/hasMoneyStory\(/)
  })
})
