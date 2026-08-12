/**
 * [blocker] ด่านของ `type='APPOINTMENT'` — การ์ดสรุปนัดหมาย (ส่วนขยาย 00024, 2026-08-11)
 *
 * แบ่งเป็น 2 ชั้นโดยตั้งใจ:
 *
 *  1. **ชั้นที่รันจริง** — `SendChatMessageSchema` คือด่านแรกและเป็นตัวที่ปฏิเสธ `'when'`
 *     เทสกลุ่มนี้เรียก Valibot จริง ไม่ mock อะไรเลย
 *
 *  2. **ชั้นที่อ่านซอร์ส** — ด่านที่เหลือ (ownership ใน WHERE / ไม่มีนัด / นัดจบแล้ว / vertical)
 *     อยู่ใน handler ที่ import โมดูลฝั่ง server สิบกว่าตัว การ mock ทั้งหมดจะได้เทสที่พิสูจน์
 *     แค่ว่า mock ถูกเรียก ไม่ได้พิสูจน์ว่ากฎถูก (บทเรียน 00038: "เทสที่ mock เพื่อนบ้านทิ้งทั้งตัว
 *     เขียวตลอดไม่ว่าเพื่อนบ้านทำอะไร") — สิ่งที่ตรวจได้และตรงกับความเสี่ยงคือ **ด่านยังอยู่ครบ**
 *     🛑 ชั้นนี้ไม่ได้แทนการทดสอบจริง มันกันการ "ถอดออกเงียบ ๆ" เท่านั้น
 */

import { describe, it, expect } from 'vitest'
import * as v from 'valibot'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SendChatMessageSchema } from '@/lib/validations'
import { APPOINTMENT_CLOSING_MAX } from '@/lib/appointment-summary'

const TOKEN = '11111111-1111-4111-8111-111111111111'
const base = { type: 'APPOINTMENT' as const, orderRefToken: TOKEN }

describe('SendChatMessageSchema — type=APPOINTMENT (ด่านที่รันจริง)', () => {
  it('รับคำขอปกติ', () => {
    const r = v.safeParse(SendChatMessageSchema, { ...base, hiddenSummaryKeys: ['deposit'] })
    expect(r.success).toBe(true)
  })

  it('[สำคัญ] ซ่อน "when" ไม่ได้ — การ์ด "ยืนยันนัดหมาย" ที่ไม่มีวันนัดทำให้ลูกค้ามาผิดวัน', () => {
    const r = v.safeParse(SendChatMessageSchema, { ...base, hiddenSummaryKeys: ['when'] })
    expect(r.success).toBe(false)
  })

  it('คีย์ที่ไม่รู้จักถูกปฏิเสธ (allow-list ไม่ใช่ deny-list)', () => {
    const r = v.safeParse(SendChatMessageSchema, { ...base, hiddenSummaryKeys: ['ทุกอย่าง'] })
    expect(r.success).toBe(false)
  })

  it('ข้อความท้ายยาวเกินเพดานถูกปฏิเสธ ไม่ใช่ตัดเงียบที่ปลายทาง', () => {
    const ok = v.safeParse(SendChatMessageSchema, {
      ...base,
      summaryClosing: 'ก'.repeat(APPOINTMENT_CLOSING_MAX),
    })
    const bad = v.safeParse(SendChatMessageSchema, {
      ...base,
      summaryClosing: 'ก'.repeat(APPOINTMENT_CLOSING_MAX + 1),
    })
    expect(ok.success).toBe(true)
    expect(bad.success).toBe(false)
  })

  it('ส่ง summaryClosing: null ได้ (= ไม่มีบรรทัดปิดท้าย)', () => {
    expect(v.safeParse(SendChatMessageSchema, { ...base, summaryClosing: null }).success).toBe(true)
  })
})

describe('route — ด่านที่เหลือยังอยู่ครบ (อ่านซอร์ส)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/api/chat/conversations/[id]/messages/route.ts'),
    'utf8',
  )

  it('[สำคัญ] ownership อยู่ใน WHERE ไม่ใช่ดึงมาเทียบทีหลัง', () => {
    expect(src).toMatch(/where:\s*\{\s*publicToken:\s*orderRefToken!,\s*shopId:\s*conv\?\.shopId\s*\}/)
  })

  it('ปฏิเสธออเดอร์ที่ไม่มีนัด', () => {
    expect(src).toMatch(/if\s*\(!order\.serviceStart\)/)
    expect(src).toContain('คำสั่งซื้อนี้ไม่มีนัดหมาย')
  })

  it('ปฏิเสธนัดที่จบแล้ว (COMPLETED / NO_SHOW)', () => {
    expect(src).toMatch(/isTerminalAppointmentStatus\(order\.appointmentStatus\)/)
    expect(src).toContain('นัดนี้จบแล้ว ส่งสรุปไม่ได้')
  })

  it('ปฏิเสธร้านที่ไม่ได้ใช้ระบบคิวงาน โดยอ่าน vertical ปัจจุบันของร้าน ไม่ใช่ธงบนแถวออเดอร์', () => {
    expect(src).toMatch(/canUseAppointments\(order\.shop\)/)
  })

  it('[สำคัญ] เก็บลงฐานเป็น ORDER ไม่สร้างค่า enum ใหม่ (ไม่มี migration)', () => {
    expect(src).toMatch(/const storedType\s*=\s*type === "APPOINTMENT"\s*\?\s*"ORDER"\s*:\s*type/)
  })

  it('ส่ง text ออกไปเสมอ — ทางถอยของช่องทางที่ไม่รองรับการ์ด', () => {
    expect(src).toMatch(/text:\s*summary\.text/)
  })

  /**
   * [สำคัญ] กันบั๊กที่ขึ้น prod ไปแล้วรอบหนึ่ง (2026-08-11 → แก้ 2026-08-12)
   *
   * route ส่ง `body` เข้าไปจริง แต่ service **บังคับ `body = null` ทุกครั้งที่ `type='ORDER'`**
   * ⇒ ข้อความสรุปถึงลูกค้าจริงแต่ไม่เคยถูกเก็บ ร้านค้นหาไม่เจอ และ preview ตกไปใช้คำของออเดอร์
   * ธงที่ปลดล็อกทั้งสองอย่างคือ `isAppointmentCard` — ถ้าใครถอดออก ทุกอย่างกลับไปพังเงียบ ๆ
   * เหมือนเดิมโดยที่ tsc/build ยังเขียว (บทเรียน: value-fate-decided-at-write-site.md)
   */
  it('[สำคัญ] บอก service ว่านี่คือการ์ดนัด — ทั้งเส้นช่องทางนอกและ DEEP', () => {
    expect(src).toMatch(/isAppointmentCard:\s*true/)
    expect(src).toMatch(/isAppointmentCard:\s*type === "APPOINTMENT"/)
  })
})

/**
 * [blocker] ผลของ /impeccable critique 2026-08-12 — ข้อที่ "ถูกแล้วพังกลับได้เงียบ ๆ"
 *
 * ทั้งสามข้อนี้ tsc/build/detector มองไม่เห็น เพราะโค้ดถูกตามชนิดทุกตัวอักษรทั้งก่อนและหลังแก้
 */
describe('ชีตส่งสรุปนัด — ข้อที่ critique จับได้ ห้ามหลุดกลับ', () => {
  const sheet = readFileSync(
    join(process.cwd(), 'src/app/(paces)/seller/(chat)/_components/AppointmentSummarySheet.tsx'),
    'utf8',
  )

  it('[สำคัญ] ปุ่มเรียกทั้ง 3 จุดต้อง ≥44px — action เดียวกันไม่ควรมี 3 ขนาด', () => {
    /** anchor ที่ระบุ "ปุ่มเปิดชีต" ของแต่ละไฟล์ได้แน่นอน แล้วดู className ที่ตามมาในบล็อกเดียวกัน */
    const anchors: [string, string][] = [
      [
        'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanel.tsx',
        'aria-label="ส่งสรุปนัดเข้าแชท"',
      ],
      [
        'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/OrderProgressBar.tsx',
        'aria-label={`ส่งสรุปนัดของ',
      ],
      [
        'src/app/(paces)/seller/(dashboard)/orders/[token]/components/AppointmentCard.tsx',
        'onClick={() => setSummaryOpen(true)}',
      ],
    ]
    for (const [f, anchor] of anchors) {
      const src2 = readFileSync(join(process.cwd(), f), 'utf8')
      const i = src2.indexOf(anchor)
      expect(i, `ไม่พบ anchor ใน ${f}`).toBeGreaterThan(-1)
      expect(src2.slice(i, i + 400), f).toContain('min-h-11')
    }
  })

  it('[สำคัญ] ปลายทางแสดงเสมอ ไม่ผูกกับ targets.length > 1 — การส่งที่ถอนคืนไม่ได้ต้องบอกว่าส่งหาใคร', () => {
    // เคสห้องเดียวต้องมีสาขาแสดงชื่อ ไม่ใช่ซ่อนทั้ง section
    expect(sheet).toMatch(/loaded\?\.targets\[0\] \? \(/)
    // ห้ามกลับไปห่อทั้ง section ด้วยเงื่อนไข > 1
    expect(sheet).not.toMatch(/\{\(loaded\?\.targets\.length \?\? 0\) > 1 && \(/)
  })

  it('[สำคัญ] ช่องข้อความปิดท้ายใช้ form-textarea — form-input ทับ rows ทิ้งเพราะ _forms.css ไม่ห่อ @layer', () => {
    const textarea = sheet.match(/<textarea[\s\S]*?\/>/)?.[0] ?? ''
    expect(textarea).toContain('form-textarea')
    expect(textarea).not.toContain('form-input')
  })

  it('[สำคัญ] มีทางออกที่ไม่ใช่การส่ง — ปุ่มยกเลิกใน footer + ปุ่มปิด 44px', () => {
    expect(sheet).toContain('ยกเลิก')
    expect(sheet).toMatch(/size-11!/)
    // ปุ่มส่งต้องไม่ต่ำกว่า 44px เช่นกัน
    expect(sheet).toMatch(/min-h-11 flex-\[2\]/)
  })

  it('โฟกัสถูกย้ายเข้า ขังไว้ และคืนที่เดิม (aria-modal ไม่ได้ทำอะไรกับคีย์บอร์ด)', () => {
    expect(sheet).toMatch(/restoreRef\.current\?\.focus\?\.\(\)/)
    expect(sheet).toMatch(/e\.key !== 'Tab'/)
  })

  /**
   * [blocker] ผลของ critique รอบ 2 — ทั้งหมดเป็นข้อที่ "แก้ไปแล้วรอบหนึ่งแต่ตกหล่นพี่น้อง"
   * ซึ่งคือแพตเทิร์นที่ convention `value-fate-decided-at-write-site.md` เตือนไว้เอง
   */
  it('[สำคัญ] form-select ต้องมี min-h-11 — ตกกับดัก h-11 lg:h-9.25 เดียวกับ form-input', () => {
    // ยึด className ตรง ๆ: regex ที่ไล่จาก `<select` ถึง `>` ตัวแรกจะถูก `=>` ใน onChange ตัดเร็ว
    expect(sheet).toMatch(/className="form-select[^"]*\bmin-h-11\b/)
  })

  it('[สำคัญ] หัวข้อพรีวิวกับหัวข้อ checkbox ต้องไม่ใช้ก้านคำเดียวกัน', () => {
    // เคยเป็น "ข้อมูลที่จะส่ง" กับ "เลือกข้อมูลที่จะส่ง" — ต่างกันคำเดียว วางติดกัน
    const headings = [...sheet.matchAll(/font-semibold">([^<]+)<\/p>/g)].map((m) => m[1])
    const dupStem = headings.filter((h) => h.includes('ข้อมูลที่จะส่ง'))
    expect(dupStem.length).toBeLessThanOrEqual(1)
  })

  it('[สำคัญ] บอกว่าเคยส่งไปแล้ว + เปลี่ยนป้ายปุ่ม (ไม่มี idempotent guard โดยตั้งใจ)', () => {
    expect(sheet).toMatch(/loaded\?\.lastSentAt &&/)
    expect(sheet).toMatch(/loaded\?\.lastSentAt \? 'ส่งอีกครั้ง' : 'ส่งเข้าแชท'/)
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/orders/[token]/appointment-summary/route.ts'),
      'utf8',
    )
    // ตัวแยกการ์ดนัดออกจากการ์ดออเดอร์คือ body ไม่ใช่ type (ทั้งคู่เป็น type='ORDER')
    expect(route).toMatch(/body: \{ not: null \}/)
    expect(route).toMatch(/conversation: \{ shopId: order\.shopId \}/)
  })

  it('โหลดพังแบบ transient ต้องมีปุ่มลองใหม่ · แบบ permanent ต้องไม่มี', () => {
    expect(sheet).toMatch(/retryable: res\.status >= 500/)
    expect(sheet).toMatch(/loadError\.retryable && \(/)
  })
})

describe('service — ธง isAppointmentCard ต้องมีผลจริงที่จุดเขียน (อ่านซอร์ส)', () => {
  const deep = readFileSync(join(process.cwd(), 'src/services/chat.service.ts'), 'utf8')
  const outbound = readFileSync(
    join(process.cwd(), 'src/services/channel-chat.service.ts'),
    'utf8',
  )

  it('[สำคัญ] DEEP: การ์ดนัดไม่ถูกล้าง body ทิ้งเหมือนการ์ดออเดอร์', () => {
    expect(deep).toMatch(
      /params\.type === 'ORDER' && !params\.isAppointmentCard/,
    )
  })

  it('[สำคัญ] ช่องทางนอก: ทั้ง 2 เส้น (LINE + Meta) ยกเว้น body ให้การ์ดนัด', () => {
    const hits = outbound.match(/isOrder && !params\.isAppointmentCard/g) ?? []
    expect(hits.length).toBe(2)
  })

  it('[สำคัญ] คำใน preview มาจาก SSOT ตัวเดียว ไม่มีใครพิมพ์เอง', () => {
    for (const src2 of [deep, outbound]) {
      const code = src2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code).toContain('APPOINTMENT_CARD_PREVIEW')
      expect(code).not.toContain('[สรุปนัด]')
    }
  })
})

describe('route — GET /api/orders/[token]/appointment-summary (อ่านซอร์ส)', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/app/api/orders/[token]/appointment-summary/route.ts'),
    'utf8',
  )

  it('[สำคัญ] scope ด้วย shopId ของออเดอร์เสมอ — Customer เป็นตารางระดับทั้งระบบ', () => {
    expect(src).toMatch(/shopId:\s*order\.shopId/)
  })

  it('ตรวจสิทธิ์เข้าถึงร้านของออเดอร์ ไม่ใช่ activeShopId', () => {
    expect(src).toMatch(/canAccessShop\(order\.shopId,\s*userId\)/)
    // ตัดคอมเมนต์ก่อนค้น: หัวไฟล์ *พูดถึง* `activeShopId` เพื่ออธิบายว่าทำไมถึงไม่ใช้มัน
    // (บทเรียน HR9 2026-08-02→08-03: gate ที่ match คำเปล่า ๆ จะแดงตลอดกาลกับไฟล์ที่ทำถูกกฎ
    //  แล้วถูกบันทึกเป็น "หนี้" ทั้งที่ไม่มีการละเมิดเลย)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/activeShopId/)
  })

  it('ไม่มี customerId → คืนรายการว่าง ไม่ใช่ error (หน้าจอต้องแยก "ยังไม่มีห้อง" จาก "ระบบพัง")', () => {
    expect(src).toMatch(/order\.customerId\s*\?/)
    expect(src).toMatch(/:\s*\/\/[\s\S]*?\[\]/)
  })

  it('[สำคัญ] คืนสรุปนัดจาก server ไม่ให้ชีตรับเป็น prop — เบอร์ลูกค้าห้ามอยู่ใน flight payload', () => {
    expect(src).toMatch(/phone:\s*order\.buyerContact/)
    // ฟอร์แมตเงินที่ server ด้วยสูตรกลาง ไม่ปล่อยให้ client คิดเอง (HR16)
    expect(src).toMatch(/formatBaht\(Number\(order\.totalAmount\)\)/)
  })

  it('[สำคัญ] ชีตต้อง fetch ไม่รับ prop ที่มีข้อมูลนัด (กัน PII หลุดลง flight payload)', () => {
    const sheet = readFileSync(
      join(
        process.cwd(),
        'src/app/(paces)/seller/(chat)/_components/AppointmentSummarySheet.tsx',
      ),
      'utf8',
    )
    expect(sheet).toMatch(/fetch\(`\/api\/orders\/\$\{orderToken\}\/appointment-summary`\)/)
    // props ต้องมีแค่ open/onClose/orderToken/onSent — ห้ามมี data/targets/shopId กลับมา
    // (ตรวจเฉพาะบล็อก props ไม่ใช่ทั้งไฟล์: ชนิดของ "ของที่ fetch มา" ก็ชื่อ data เหมือนกัน
    //  ซึ่งถูกต้องแล้ว — สิ่งที่ห้ามคือ "รับเข้ามาจากข้างนอก")
    const props = sheet.match(/export interface AppointmentSummarySheetProps \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(props).not.toBe('')
    expect(props).toContain('orderToken')
    expect(props).not.toMatch(/\bdata\b\s*:/)
    expect(props).not.toMatch(/\btargets\b\s*:/)
    expect(props).not.toMatch(/\bshopId\b\s*:/)
  })

  it('ครอบห้องแชท DEEP ด้วย (ผูกผ่าน Customer.userId ไม่ใช่ ExternalContact)', () => {
    expect(src).toMatch(/buyerUserId:\s*order\.customer\.userId/)
  })

  /**
   * [สำคัญ] `Order.conversationId` (main เพิ่ม 2026-08-12) คือห้องต้นทางจริงของออเดอร์
   * schema เขียนไว้เองที่ index ว่ามีไว้ "แทนการเดาจาก Customer" — ถ้าเลิกใช้แล้วกลับไปเรียงด้วย
   * `lastMessageAt` อย่างเดียว ค่าตั้งต้นจะเลือกผิดห้องทันทีที่ลูกค้าทักมาสองเพจ
   */
  it('[สำคัญ] ใช้ห้องต้นทางจาก Order.conversationId และดันขึ้นเป็นตัวแรก', () => {
    expect(src).toMatch(/conversationId:\s*true/)
    expect(src).toMatch(/order\.conversationId \? \[\{ id: order\.conversationId \}\]/)
    expect(src).toMatch(/isOrigin:\s*c\.id === order\.conversationId/)
  })
})
