import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * หน้าออเดอร์ของลูกค้า `/o/[token]` — เรื่องเงิน + เพจต้นทาง (feature 00050 · AC-SQ-06)
 *
 * จอนี้ต่างจากจอฝั่งร้านตรงที่ **ปลายทางเป็น client component** ⇒ ทุกคีย์ที่ใส่ลง props
 * ถูก serialize ลง flight payload และอ่านได้จาก view-source ของคนที่ถือลิงก์
 * ⇒ ความผิดพลาดที่นี่ไม่ใช่ "แสดงผลเพี้ยน" แต่คือ **ข้อมูลหลุด**
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** ตัดเอาเฉพาะเนื้อ `getOrderByToken` — ห้ามสแกนทั้งไฟล์ (order.service.ts มี query อื่นอีกเพียบ) */
function orderByTokenBody(): string {
  const src = stripComments(read('src/services/order.service.ts'))
  const start = src.indexOf('export async function getOrderByToken')
  expect(start, 'ต้องมีฟังก์ชัน getOrderByToken').toBeGreaterThan(-1)
  const next = src.indexOf('\nexport ', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

describe('ข้อมูลที่ส่งลงหน้าลูกค้า ต้องไม่พาความลับติดไปด้วย', () => {
  it('[blocker] shopChannel ต้องเป็น select allow-list ห้าม include — แถวนั้นมี accessTokenEnc', () => {
    /**
     * 🛑 `ShopChannel` เก็บ **page access token** ไว้ในแถวเดียวกัน สคีมาเขียนกำกับเองว่า
     * ห้ามส่งกลับ client ทุกกรณี · `include: { shopChannel: true }` จะพา token ลง flight payload
     * ให้ใครก็ตามที่ถือลิงก์ออเดอร์อ่านได้ แล้วเอาไปโพสต์/อ่านข้อความในเพจของร้านได้ทั้งเพจ
     */
    const body = orderByTokenBody()
    expect(body, 'ต้องมี shopChannel แบบ select').toMatch(/shopChannel:\s*\{\s*select:/)
    expect(body, 'ห้าม include ทั้งแถว').not.toMatch(/shopChannel:\s*(true|\{\s*include)/)
    expect(body, 'ห้ามหลุด accessTokenEnc').not.toContain('accessTokenEnc')
  })

  it('[blocker] payments ที่ส่งให้ลูกค้า ห้ามมีบันทึกภายในของร้าน', () => {
    /**
     * `note` = ข้อความที่พนักงานจดไว้กันเอง ("ลูกค้าต่อราคา" / "โอนมาไม่ครบ รอโอนเพิ่ม")
     * `receivedByUserId` = ตัวตนของพนักงาน — ทั้งคู่ไม่ใช่ข้อมูลของลูกค้า
     */
    const body = orderByTokenBody()
    const m = body.match(/payments:\s*\{[\s\S]*?orderBy[^}]*\}/)
    expect(m, 'ต้องเจอบล็อก payments').toBeTruthy()
    const block = m![0]
    expect(block, 'ห้ามส่ง note ของร้าน').not.toContain('note')
    expect(block, 'ห้ามส่งตัวตนพนักงาน').not.toContain('receivedByUserId')
  })

  it('[blocker] ต้องกรองรายการที่ถูกยกเลิกออกที่ query — เงินโผล่แล้วหายอธิบายไม่ได้', () => {
    const body = orderByTokenBody()
    expect(body).toMatch(/payments:\s*\{\s*where:\s*\{\s*voidedAt:\s*null\s*\}/)
  })
})

describe('การ์ดการชำระเงินบนหน้าลูกค้า', () => {
  const CARD = 'src/app/(marketing)/o/[token]/PaymentSummaryCard.tsx'

  it('[blocker] ห้ามเขียนว่า "จ่ายแล้ว" — ต้องบอกว่าใครทำให้ตัวเลขขยับ (BR-SQ-12)', () => {
    /**
     * 🛑 "การมีสลิป ≠ ได้รับเงิน" — ลูกค้าแนบสลิปที่หน้านี้ได้ แต่ยอดจะไม่ขยับจนกว่าร้านจะกดยืนยัน
     * ถ้าจอเขียนว่า "จ่ายแล้ว ฿0.00" คนที่เพิ่งแนบสลิปไปจะอ่านว่าระบบไม่รับสลิปของเขา
     * แล้ว **โอนซ้ำ** ซึ่งเป็นความเสียหายที่เป็นเงินจริง
     */
    const jsx = stripComments(read(CARD))
    expect(jsx, 'ต้องใช้คำว่า "ร้านยืนยันรับแล้ว"').toContain('ร้านยืนยันรับแล้ว')
    expect(jsx, 'ห้ามมีคำว่า "จ่ายแล้ว" บนจอ').not.toMatch(/>[^<]*จ่ายแล้ว/)
  })

  it('[blocker] ป้ายมัดจำต้องเป็น "มัดจำที่ตกลงไว้" ไม่ใช่ "มัดจำ" เฉย ๆ (BR-SQ-02)', () => {
    /**
     * คำหลังอ่านได้ทั้ง "เก็บแล้ว" และ "ต้องเก็บ" — และเมื่อวางใต้ยอดรวมซึ่งเป็นข้อเท็จจริง
     * ที่เกิดแล้ว น้ำหนักจะเอนไปทาง "เก็บแล้ว" · คำชุดเดียวกับฝั่งร้านเป๊ะ
     */
    const jsx = stripComments(read(CARD))
    expect(jsx).toContain('มัดจำที่ตกลงไว้')
  })

  it('[blocker] ยอดค้างต้องเป็นโทนเตือน ไม่ใช่โทนผิดพลาด', () => {
    /**
     * ค้างอยู่เป็นเรื่องปกติของร้านที่เก็บมัดจำ (ยังไม่ถึงกำหนดก็ค้าง) — สีแดงอ่านเป็น
     * "คุณผิดนัดชำระ" ซึ่งไม่จริงและทำให้ลูกค้าตกใจโอนซ้ำ
     */
    const jsx = stripComments(read(CARD))
    expect(jsx).toMatch(/color=\{money\.fullyPaid \? 'success' : 'warning'\}/)
  })
})

describe('ต้องไม่กระทบออเดอร์ของ vertical อื่น (AC-SQ-07)', () => {
  it('[blocker] ไม่มีเรื่องเงินให้พูดถึง → money เป็น null → DOM เหมือนเดิมทุก node', () => {
    /**
     * ออเดอร์ขายออนไลน์ทั่วไป (ไม่มีมัดจำ ไม่เคยบันทึกรับเงิน) ต้องไม่เห็นการ์ดนี้เลย
     * — ไม่ใช่เห็นการ์ดที่เขียนว่า "รับแล้ว ฿0.00" ซึ่งเป็นบล็อกใหม่บนหน้าที่ไม่ได้ขออะไร
     */
    const page = stripComments(read('src/app/(marketing)/o/[token]/page.tsx'))
    /* 🛑 ตรวจ **ชื่อเกณฑ์** ไม่ใช่นิพจน์ดิบ — เดิมเขียน `m.totalReceived === 0 && !m.hasDeposit`
       ไว้ตรง ๆ แล้วแดงทันทีที่เกณฑ์ถูกยกเป็น `hasMoneyStory()` ที่ใช้ร่วม 3 จอ ทั้งที่ของยังครบ
       ด่านที่ผูกกับ *วิธีเขียน* พังเมื่อ refactor (พลาดคลาสนี้มาหลายครั้งแล้ว) */
    expect(page, 'ต้องคืน null เมื่อไม่มีเรื่องเงินให้พูดถึง').toMatch(
      /if\s*\(!hasMoneyStory\(m\)\) return null/,
    )
    const view = stripComments(read('src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'))
    expect(view, 'ต้อง render แบบมีเงื่อนไข').toMatch(
      /\{order\.money && <PaymentSummaryCard/,
    )
  })

  it('[blocker] การ์ดเงินต้องอยู่นอกเงื่อนไขของการ์ดนัด — walk-in ไม่มีนัดแต่มีเงิน', () => {
    /**
     * 🛑 งาน walk-in ที่ร้านยังไม่กด "เริ่มงานเลย" ไม่มี `appointment` — ถ้าการ์ดเงินซ้อนอยู่
     * ในเงื่อนไขนั้น มันจะหายไปพร้อมกัน ทั้งที่ลูกค้ากำลังจะโอนเงินอยู่พอดี
     * (คลาสเดียวกับ FAB ที่หายไปพร้อม `SellerBottomNav` — `seller-action-placement.md` §5.1)
     */
    /**
     * 🛑 ตรวจ **การซ้อน** ไม่ใช่ **ลำดับ** — ร่างแรกล็อกไว้ว่า "การ์ดเงินต้องมาก่อนการ์ดนัด"
     * แล้วแดงทันทีที่สลับลำดับตามมติเดิมของ feature 00024 (*"นัดวันไหน คือข้อมูลที่ลูกค้า
     * ต้องการที่สุดของหน้านี้"*) ทั้งที่กฎที่ต้องปกป้องจริงคือ *อย่าเอาไปซ้อนในเงื่อนไขนั้น*
     * — ลำดับเป็นเรื่องของ UX ที่เปลี่ยนได้ ส่วนการซ้อนคือบั๊กที่ทำให้ walk-in ไม่เห็นการ์ด
     *
     * วัดด้วย **ระดับการเยื้อง**: อยู่คนละ block ⇒ เยื้องเท่ากัน · ถูกซ้อน ⇒ เยื้องลึกกว่า
     */
    const raw = read('src/app/(marketing)/o/[token]/OrderDetailMobile.tsx')
    const moneyLine = raw.split('\n').find((l) => l.includes('<PaymentSummaryCard'))
    const apptLine = raw.split('\n').find((l) => l.includes('{order.appointment && ('))
    expect(moneyLine, 'ต้องเจอการ์ดเงิน').toBeTruthy()
    expect(apptLine, 'ต้องเจอเงื่อนไขการ์ดนัด').toBeTruthy()
    const indent = (l: string) => l.length - l.trimStart().length
    expect(indent(moneyLine!), 'การ์ดเงินต้องไม่ถูกซ้อนในเงื่อนไขของการ์ดนัด').toBeLessThanOrEqual(
      indent(apptLine!),
    )
  })
})

describe('จอ guest (ก่อนล็อกอิน) ต้องไม่รับของใหม่ติดไปด้วย', () => {
  it('[blocker] buildGuestOrderData ต้องประกอบ object ทีละ field ห้าม spread ทั้งแถว', () => {
    /**
     * 🛑 `getOrderByToken` เป็น query **ที่ใช้ร่วมกันทั้งจอ guest และจอที่ล็อกอินแล้ว** —
     * feature 00050 เพิ่ม `shopChannel` (แถวเดียวกับ page access token) และ `payments`
     * เข้าไปในนั้น ถ้าวันไหนมีคนเปลี่ยน `buildGuestOrderData` ให้ `{ ...order }` เพื่อความสะดวก
     * ของใหม่ทั้งชุดจะไหลลง flight payload ของ **หน้าที่ยังไม่ต้องล็อกอิน** ทันที
     *
     * เทสเดิมในโฟลเดอร์นั้นตรวจ "ค่าที่รู้จัก 3 ตัว" (slip/accessUrl/ชื่อผู้ซื้อ) ซึ่งจับ
     * ของใหม่ที่ยังไม่มีใครนึกถึงไม่ได้ — ด่านนี้จึงตรวจ **รูปแบบการประกอบ** แทนรายชื่อค่า
     */
    const src = stripComments(read('src/app/(marketing)/o/[token]/guest-order-data.ts'))
    expect(src, 'ห้าม spread order ทั้งก้อน').not.toMatch(/\.\.\.\s*order\b/)
    expect(src, 'ห้ามส่ง payments ต่อ').not.toContain('payments')

    /**
     * 🛑 **ผ่อนจาก "ห้ามมีคำว่า shopChannel" มาเป็น "ห้ามให้ทั้งแถวไหลออก" (2026-08-30)**
     *
     * จอ guest ต้องรู้ว่าออเดอร์ใบนี้คุยกันที่เพจไหน (ไปเป็นป้าย "คุยกันที่นี่") ซึ่งต้องอ่าน
     * 2 คีย์จากแถวนี้ — การแบนคำทั้งคำจึงห้ามของที่ปลอดภัยไปด้วย
     *
     * สิ่งที่ต้องปกป้องจริงคือ **`accessTokenEnc` และเพื่อนบ้านในแถวเดียวกัน** ไม่ใช่ชื่อคอลัมน์
     * ⇒ ย้ายไปบังคับที่ **รูปร่างของ type** ซึ่งแข็งกว่าการ grep คำ เพราะ `tsc` แดงตั้งแต่
     * compile ถ้ามีคนอ่านคีย์นอก allow-list (grep จับได้แค่ตอนคนเขียนคำนั้นตรง ๆ)
     *
     * 🛑 ห้ามยุบกลับไปเป็น `not.toContain('shopChannel')` — จะแดงถาวรทั้งที่ไม่มีใครทำผิด
     * (คลาสเดียวกับ grep gate ของ HR9 ที่แดงค้างจากคอมเมนต์ของตัวเองเมื่อ 2026-08-02→03)
     */
    expect(src, 'ห้าม spread ทั้งแถว shopChannel').not.toMatch(/\.\.\.\s*order\.shopChannel\b/)
    /* ทุกจุดที่แตะ `order.shopChannel` ต้องตามด้วย `.`/`?.` (หยิบคีย์) หรือ `?` (เช็คว่ามีไหม)
       🛑 `??` ต้องถูกจับเป็นการยกทั้งแถว — ร่างก่อนหน้าอนุญาต `?` ลอย ๆ เผื่อเทอร์นารี
       แล้ว `order.shopChannel ?? null` ลอดไปได้ (mutation เขียว 14/14 ทั้งที่แถวหลุดออกไปแล้ว)
       ⇒ alternation ต้องลอง `??` ก่อนเสมอ */
    for (const m of src.matchAll(/order\.shopChannel\s*(\?\?|.)/g)) {
      expect(m[1], `ห้ามยกทั้งแถวไปเป็นค่าที่ส่งออก — ต้องหยิบทีละคีย์ (เจอ "${m[0]}")`).toMatch(
        /^[.?]$/,
      )
    }
    /* type คือ allow-list ตัวจริง — คีย์ไหนไม่อยู่ในนี้ `tsc` ห้ามอ่านตั้งแต่ compile */
    const decl = src.match(/shopChannel\?:\s*\{([^}]*)\}/)
    expect(decl, 'ต้องประกาศรูปร่าง shopChannel ไว้ชัด ไม่ใช่ปล่อยเป็น any/unknown').toBeTruthy()
    const keys = [...decl![1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]).sort()
    expect(keys, 'จอ guest อ่านได้แค่ provider กับ name เท่านั้น').toEqual(['name', 'provider'])
  })
})

describe('ร้านต้องไม่รู้น้อยกว่าลูกค้าบนจอของตัวเอง', () => {
  it('[blocker] หน้าออเดอร์ฝั่งร้านต้องแสดงเงินที่รับแล้ว ด้วยเกณฑ์เดียวกับหน้าลูกค้า', () => {
    /**
     * 🛑 ช่องโหว่ที่เจอตอน audit: หน้า `/o/[token]` ของลูกค้าบอกยอดที่รับแล้วและยอดค้าง
     * แต่ `/orders/[token]` ของร้านบอกได้แค่ "มีสลิปไหม" ⇒ **ผู้ขายรู้น้อยกว่าลูกค้า**
     * บนจอของตัวเอง แล้วต้องเปิดแชทหาทุกครั้งที่ลูกค้าถาม
     *
     * เกณฑ์ "แสดงหรือไม่" ต้องเหมือนกันเป๊ะทั้งสองจอ — ไม่งั้นร้านเห็นบล็อกที่ลูกค้าไม่เห็น
     * (หรือกลับกัน) แล้วคุยกันคนละเรื่องโดยไม่มีใครรู้ว่าอีกฝ่ายเห็นอะไร
     */
    const sellerPage = stripComments(
      read('src/app/(paces)/seller/(dashboard)/orders/[token]/page.tsx'),
    )
    expect(sellerPage, 'ต้องคำนวณด้วย SSOT ตัวเดียวกัน').toContain('computeOrderMoneyFromSerialized(')
    /* เกณฑ์ต้องเหมือนหน้าลูกค้าเป๊ะ — บังคับได้จริงตั้งแต่ยกเป็นฟังก์ชันร่วม: ทั้งสองจอ
       เรียกสัญลักษณ์ตัวเดียวกัน จึงไม่มีทางแยกจากกันโดยที่เทสยังเขียว

       🛑 ไม่ผูกกับ `if (` นำหน้า — จอฝั่งร้านแยก `serviceMoney` (กั้นด้วย vertical อย่างเดียว
       ป้อนปุ่ม "รับเงินแล้ว") ออกจาก `orderMoney` (กั้นเพิ่มด้วย hasMoneyStory ป้อนการ์ด) แล้ว
       ตัวหลังจึงเขียนเป็น `!m || !hasMoneyStory(m)` — **เกณฑ์การแสดงผลยังเป็นตัวเดียวกันเป๊ะ**
       ที่เปลี่ยนคือรูปประโยค ซึ่งคือคลาสที่คอมเมนต์บรรทัด 101 ของไฟล์นี้เตือนไว้เอง
       (ด่านที่ผูกกับ *วิธีเขียน* พังเมื่อ refactor ทั้งที่ของยังครบ) */
    expect(sellerPage, 'เกณฑ์ต้องเหมือนหน้าลูกค้าเป๊ะ').toMatch(
      /!hasMoneyStory\(m\)\) return null/,
    )
    expect(sellerPage, 'ต้องส่งลงการ์ดการชำระเงิน').toMatch(/money=\{orderMoney\}/)
  })

  it('[blocker] จอร้านเห็นแถวที่ยกเลิกด้วย · จอลูกค้าไม่เห็น', () => {
    /**
     * ตั้งใจให้ต่างกัน **ตรงจุดนี้จุดเดียว**: ประวัติเงินที่ถูกยกเลิกเป็นข้อมูลที่ร้านต้องตรวจสอบ
     * ย้อนหลังได้ (ใครกรอกผิด กี่โมง เพราะอะไร) แต่สำหรับลูกค้ามันคือเงินที่โผล่แล้วหาย
     * ซึ่งอธิบายไม่ได้ · เขียนไว้ให้ชัดว่าเป็นเจตนา ไม่ใช่ความไม่สม่ำเสมอ
     */
    const shopQuery = stripComments(read('src/services/order.service.ts'))
    const start = shopQuery.indexOf('export async function getOrderForShop')
    const fn = shopQuery.slice(start, shopQuery.indexOf('\nexport ', start + 1))
    expect(fn, 'จอร้าน: ไม่กรอง voidedAt').not.toMatch(/payments:\s*\{\s*where:\s*\{\s*voidedAt/)
    expect(fn, 'จอร้าน: ดู note ได้').toMatch(/payments:[\s\S]{0,200}note:\s*true/)
  })
})

describe('คำบนหน้าลูกค้าต้องตรงกับประเภทร้าน (หัวหน้า: "order detail ดูไม่รู้เรื่อง")', () => {
  const VIEW = 'src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'

  it('[blocker] ร้านบริการต้องไม่เห็นคำว่า "สินค้า" ในหัวรายการ', () => {
    /**
     * ลูกค้าที่จ้างล้างแอร์เปิดหน้านี้แล้วเห็น "รายการสินค้า" — คำที่ไม่ตรงกับสิ่งที่เขาซื้อ
     * คือจุดแรกที่ทำให้หน้า "ดูไม่รู้เรื่อง"
     */
    const code = stripComments(read(VIEW))
    expect(code).toMatch(/isServiceShop \? 'รายการบริการ' : 'รายการสินค้า'/)
  })

  it('[blocker] ปุ่มยืนยันของร้านบริการต้องพูดว่า "รับบริการ" ไม่ใช่ "ได้รับ"', () => {
    const code = stripComments(read(VIEW))
    expect(code).toContain('ยืนยันว่ารับบริการแล้ว')
  })

  it('[blocker] ธงเลือกคำต้องแยกจากธงเรื่องเงิน — ห้ามใช้ money แทน', () => {
    /**
     * 🛑 วันนี้ `money !== null` กับ `isServiceShop` จริงพร้อมกันเสมอ แต่ตอบคนละคำถาม:
     * `money` = "มีเรื่องเงินให้พูดถึงไหม" · `isServiceShop` = "เรียกของในบิลว่าอะไร"
     * ร้านบริการที่เปิดบิลเปล่า (ยอด 0 ไม่มีมัดจำ) จะได้ `money = null` แต่คำก็ยังต้องถูก
     * — ผูกคำไว้กับเงินคือบั๊กที่รอเกิด
     */
    const page = stripComments(read('src/app/(marketing)/o/[token]/page.tsx'))
    expect(page, 'ต้อง derive จาก vertical ตรง ๆ').toMatch(
      /isServiceShop: order\.shop\.vertical === 'SERVICE_QUEUE'/,
    )
    const code = stripComments(read(VIEW))
    expect(code, 'ห้ามใช้ money ตัดสินคำ').not.toMatch(/order\.money \? 'รายการบริการ'/)
  })
})
