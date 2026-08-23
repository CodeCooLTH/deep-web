/**
 * ด่าน "หน้าจอเรื่องเงินของร้านบริการห้ามพูดสิ่งที่ไม่รู้ และห้ามพูดขัดกันเอง"
 *
 * user เจอเองบน prod 2026-08-23 · ยืนยันกับข้อมูลจริงของร้าน BT Premium แล้วทั้งสองข้อ
 *
 * ## ข้อ 1 — ป้ายสองใบขัดกันบนใบเดียว
 *
 * ใบ `DP256908CEB304D4`: `status=PENDING` · `paymentMethod='CASH'` · รับมัดจำ ฿900 เต็มจำนวน
 *
 *   · `resolveServiceOrderBadge` อ่าน `OrderPayment` → **"ชำระเงินแล้ว"** (เขียว)
 *   · `getPaymentBadge` อ่าน `Order.status` + `paymentMethod` เท่านั้น — **ไม่รู้จักตาราง
 *     `OrderPayment` เลย** → `CASH` ไม่อยู่ใน enum ที่มันรู้จัก ตกไป fallback
 *     **"ยังไม่ยืนยันการชำระ"** (เหลือง)
 *
 * ⇒ สองป้ายตอบ *คำถามเดียวกัน* ("ได้เงินหรือยัง") คนละคำตอบ วางติดกัน (HR16)
 *
 * ## ข้อ 2 — ตารางยืนยันสิ่งที่ไม่รู้
 *
 * ใบวันที่ 1 ส.ค. สถานะ `CONFIRMED` (งานปิดแล้ว) แต่ **ไม่มีแถว `OrderPayment` เลย**
 * ⇒ ตารางขึ้น "ค้างรับ ฿300" **สีส้ม** ซึ่งอ่านว่า "ลูกค้ายังไม่จ่าย"
 * ความจริงคือ *ไม่มีใครบันทึกไว้* — ร้านอาจเก็บสดแล้วไม่ได้กด
 *
 * (`partial-data-must-be-labeled-or-filled.md` — มีทางเลือก 2 ทางเท่านั้น: **บอก** หรือ
 * **เติมให้เต็ม** · เติมไม่ได้เพราะข้อมูลไม่มีอยู่จริง ⇒ ต้องบอก)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { computeOrderMoney } from '@/lib/order-payment'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SUMMARY = 'src/app/(paces)/seller/(dashboard)/orders/[token]/components/OrderSummary.tsx'
const SHEET = 'src/app/(paces)/seller/(dashboard)/dashboard/components/SalesChartSheet.tsx'
const SERVICE = 'src/services/dashboard.service.ts'

describe('ป้ายเรื่องเงินบนใบเดียวห้ามขัดกันเอง', () => {
  it('[blocker] ใบจริงที่ user เจอ ต้องอ่านว่าจ่ายครบแล้ว', () => {
    /* ค่าจากฐาน prod ของใบ DP256908CEB304D4 (อ่านอย่างเดียว 2026-08-23) — ยึดค่าจริง
       ไม่ใช่ค่าที่แต่งเองตามข้อสันนิษฐานของโค้ด (`external-payload-schema.md`) */
    const money = computeOrderMoney({
      totalAmount: 900,
      depositAgreed: 900,
      payments: [{ kind: 'DEPOSIT', amount: 900, voidedAt: null }],
    })
    expect(money.fullyPaid, 'รับครบ 900/900 แล้ว').toBe(true)
  })

  it('[blocker] ป้ายของร้านบริการต้องกันป้ายเดิมไม่ให้ขึ้นคู่', () => {
    /**
     * 🛑 ต้องกันที่ **การ render** ไม่ใช่แก้ `getPaymentBadge` ให้รู้จัก `OrderPayment`
     * เพราะฟังก์ชันนั้นถูกใช้โดย vertical อื่นที่ยังไม่มีตารางนั้นเลย — แก้ตรงนั้น
     * = เปลี่ยนพฤติกรรมของร้านขายออนไลน์ทุกใบเพื่อแก้อาการของร้านบริการ
     */
    const code = stripComments(read(SUMMARY))
    expect(code, 'ต้องมี !serviceBadge คุมการ render ป้ายเดิม').toMatch(
      /!isCod && !serviceBadge && paymentBadge/,
    )
  })
})

describe('กราฟต้องบอกว่าเส้นคนละหน่วยกับแท่ง', () => {
  it('[blocker] ต้องมีป้ายของเส้นใต้กราฟ และใช้คำเดียวกับหัวคอลัมน์ในตาราง', () => {
    /**
     * 🛑 กราฟวาด **สองหน่วยบนสองแกนที่ซ่อนทั้งคู่**: แท่ง = บาท (แกนซ้าย) · เส้น = จำนวนใบ
     * (แกนขวา `opposite: true`) และ `yaxis` ทุกตัว `show: false` ตามมติ v3
     *
     * เส้นเป็นสิ่งที่เด่นที่สุดบนกราฟ (ลากยาวทั้งเดือน วาดทับแท่ง) แต่ **ไม่มีชื่อกำกับที่ไหนเลย** —
     * แถบสมการเหนือกราฟรับเฉพาะก้อนเงินโดยเจตนา (มันเป็นสมการที่ต้องบวกลบตามได้)
     * ⇒ ผู้อ่านเหลือทางเดียวคือเดาว่าเส้นเป็นยอดขาย แล้วกราฟจะดู "ขัดกับตาราง" ทันที
     * เมื่อวันที่ขายเยอะไม่ใช่วันที่ออเดอร์เยอะ
     *
     * เคสจริงที่ user รายงาน 2026-08-23 (ยืนยันกับฐานแล้ว ตัวเลขถูกทุกช่อง):
     *   วันที่ 13 → 3 ใบ / ฿902   ← เส้นสูงสุด แต่แท่งเตี้ย
     *   วันที่ 23 → 2 ใบ / ฿20,890 ← แท่งสูงสุด แต่เส้นต่ำกว่า
     */
    const code = read(SHEET)
    expect(code, 'ต้องมีป้ายบอกว่าเส้นคืออะไร').toContain('เส้น = จำนวน')
    expect(code, 'ต้องบอกด้วยว่าคนละสเกลกับแท่ง — ไม่งั้นยังเทียบความสูงกันอยู่ดี').toMatch(
      /เส้น = จำนวน\{countNounOf\(isService\)\}[^<]*คนละสเกล/,
    )

    /**
     * 🛑 คำต้องมาจาก **นิยามเดียว** — ของสิ่งเดียวกันเรียกสองชื่อบนจอเดียว = HR16
     * คำนี้โผล่ 3 ที่ (หัวคอลัมน์ · ป้ายใต้กราฟ · tooltip) ตั้งแต่ร้านบริการเรียกว่า "งาน"
     * ⇒ ต้องผ่าน `countNounOf` ทุกที่ ห้าม hardcode ที่ใดที่หนึ่ง
     */
    expect(code, 'หัวคอลัมน์ในตารางต้องใช้ countNounOf').toContain('{countNounOf(isService)}</span>')
    expect(code, 'tooltip ต้องใช้ countNounOf').toMatch(/countNoun = countNounOf\(isServiceChart\)/)

    /**
     * ป้ายต้องอยู่ **ใต้กราฟ** ไม่ใช่ในแถบสมการ — ยัดเข้าไปจะทำให้แถบนั้นเลิกอ่านเป็นสมการ
     *
     * 🛑 ต้องวัดตำแหน่งบนซอร์สที่ **ตัดคอมเมนต์แล้ว** — ประโยค "เส้น = จำนวนคำสั่งซื้อ"
     * ปรากฏในคอมเมนต์ที่อธิบายซีรีส์ตั้งแต่ต้นไฟล์ (บรรทัด ~140) ⇒ `indexOf` บนซอร์สดิบ
     * เจอคอมเมนต์ก่อนตัว JSX จริง แล้วแดงใส่โค้ดที่ทำถูก
     * (รอยเดิมของรีโปข้อนี้: grep gate ของ HR9 2026-08-02→03 · component-declared-in-render
     *  2026-08-12 · ด่าน backHref เมื่อเช้านี้เอง)
     */
    const bare = stripComments(code)
    const chartAt = bare.indexOf('<ApexChart')
    const labelAt = bare.indexOf('เส้น = จำนวน')
    expect(chartAt, 'ต้องมีกราฟ').toBeGreaterThan(-1)
    expect(labelAt, 'ป้ายต้องอยู่หลังกราฟ').toBeGreaterThan(chartAt)
  })
})

describe('ทั้งหน้าของร้านบริการต้องใช้ "แกนเงิน" แกนเดียว (user เคาะ 2026-08-23)', () => {
  /**
   * ที่มา: user ถามว่าทำไม "ยืนยันแล้ว 20,290" บนหัว กับ "รับจริง 20,890" ในตาราง ไม่ตรงกัน
   * — คำตอบคือมัน **ต่างกัน 2 ชั้น** (ทั้งเดือน vs วันเดียว · แกนลูกค้ายืนยัน vs แกนเงิน)
   * และไม่มีวันเท่ากัน · ต้นเหตุคือจอเดียวมีสองแกนพูดคนละภาษา
   *
   * ⇒ ย้ายทั้งหน้ามาใช้แกนเงิน: hero · แถบสมการ · แท่งในกราฟ · ตาราง พูดเรื่องเดียวกันหมด
   * ส่วนแกน "งานถึงขั้นไหน" ย้ายไปเป็นแถวสถานะงาน ซึ่งตอบตรงกว่าและนับใบที่ยกเลิกได้ด้วย
   */

  it('[blocker] แท่งในกราฟของร้านบริการต้องเป็น รับจริง/ค้างรับ', () => {
    /* ถ้ากราฟยังเป็น ยืนยันแล้ว/รอยืนยัน ขณะที่ตารางเป็นแกนเงิน = กลับไปมีสองแกนบนจอเดียว
       ซึ่งเป็นต้นเหตุเดิมเป๊ะ ๆ */
    const code = stripComments(read(SHEET))
    expect(code, 'ต้องมีซีรีส์ รับจริง/ค้างรับ ใต้เงื่อนไข isServiceChart').toMatch(
      /isServiceChart[\s\S]{0,400}name: 'รับจริง'[\s\S]{0,200}name: 'ค้างรับ'/,
    )
    /* ร้าน vertical อื่นต้องไม่ถูกแตะ — ซีรีส์เดิมต้องยังอยู่ในสาขา else */
    expect(code, 'ร้านอื่นต้องยังได้ ยืนยันแล้ว/รอยืนยัน เหมือนเดิม').toMatch(
      /name: 'ยืนยันแล้ว'[\s\S]{0,200}name: 'รอยืนยัน'/,
    )
  })

  it('[blocker] tooltip/แกน y ต้องเปลี่ยนชื่อตามซีรีส์ที่วาดจริง', () => {
    /**
     * 🛑 สองจุดนี้ลืมง่ายที่สุดเพราะไม่เห็นจนกว่าจะแตะกราฟ:
     *   · tooltip ที่ยังเขียน "ยืนยันแล้ว" จะอ่านเลขถูกแต่ **เรียกชื่อผิด** ซึ่งแย่กว่าไม่มี
     *     tooltip เพราะผู้ขายจะเชื่อชื่อ
     *   · `yaxis.seriesName` ที่ชี้ชื่อที่ไม่มีอยู่ ทำให้ ApexCharts ให้ซีรีส์นั้นใช้แกนของตัวเอง
     *     ⇒ **สเกลแท่งเพี้ยนทั้งกราฟ** โดยไม่มี error
     */
    const code = stripComments(read(SHEET))

    /**
     * 🛑 ต้องตัดเฉพาะ **บล็อก tooltip** ก่อนตรวจ — ร่างแรกตรวจทั้งไฟล์ด้วย regex
     * `isServiceChart ? 'รับจริง' : 'ยืนยันแล้ว'` แล้ว **ไม่แดงตอน mutation** เพราะบรรทัด
     * `barAxisName = isServiceChart ? …` match regex เดียวกันพอดี ⇒ ด่านถูกทำให้ผ่านโดย
     * โค้ดคนละบรรทัดกับที่มันอ้างว่ากัน (`mutation-silence-means-weak-corpus.md`)
     */
    const tipAt = code.indexOf('custom: (')
    expect(tipAt, 'ต้องมี custom tooltip').toBeGreaterThan(-1)
    const tip = code.slice(tipAt, code.indexOf('},', code.indexOf('</div>`', tipAt)))
    expect(tip, 'tooltip ต้องเลือกชื่อตาม isServiceChart').toMatch(
      /isServiceChart \? 'รับจริง' : 'ยืนยันแล้ว'/,
    )
    expect(tip, 'tooltip ต้องเลือกคำของ "ค้างรับ" ตาม vertical ด้วย').toMatch(
      /isServiceChart \? 'ค้างรับ' : 'รอยืนยัน'/,
    )

    expect(code, 'แกน y ของแท่งต้องผูกกับชื่อที่เปลี่ยนตาม vertical').toMatch(
      /barAxisName = isServiceChart \? 'รับจริง' : 'ยืนยันแล้ว'/,
    )
    expect(code, 'yaxis ต้องใช้ barAxisName ไม่ hardcode').toMatch(/seriesName: barAxisName/)
  })

  it('[blocker] ตัวเลขใหญ่ของร้านบริการต้องเป็นเงินที่รับจริง ไม่ใช่ "กำไร"', () => {
    /**
     * 🛑 ไม่ใช่แค่เรื่องคำ — ร้านบริการไม่มีต้นทุนสินค้าและถูกล็อก NO_SHIPPING
     * ⇒ กำไร = ยอดขาย **เป๊ะทุกบาท** (ร้านตัวอย่าง ส.ค. 2569: 22,393 = 22,393)
     * คำว่า "กำไร" จึงไม่ได้ให้ข้อมูลเพิ่มเลย มันแค่เรียกยอดขายด้วยชื่อที่ผิด
     */
    const code = stripComments(read(SHEET))
    expect(code, 'hero ต้องเป็น receivedTotal เมื่อเป็นร้านบริการ').toMatch(
      /heroValue = isService \? receivedTotal/,
    )
    expect(code, 'ป้ายต้องเป็น "เงินที่รับจริง"').toMatch(/heroLabel = isService \? 'เงินที่รับจริง'/)
    expect(code, 'ชื่อหน้าต้องไม่พูดถึงกำไรกับร้านบริการ').toMatch(
      /isService \? 'ยอดขายและการเก็บเงิน' : 'ยอดขายและกำไร'/,
    )
  })

  it('[blocker] แถบสมการของร้านบริการต้องเป็น รับจริง + ค้างรับ = ยอดขาย', () => {
    const code = stripComments(read(SHEET))
    const at = code.indexOf('label="รับจริง"')
    expect(at, 'ต้องมีช่อง "รับจริง" ในแถบสมการ').toBeGreaterThan(-1)
    const bar = code.slice(at, at + 600)
    expect(bar, 'ต้องตามด้วย ค้างรับ').toContain('label="ค้างรับ"')
    expect(bar, 'ต้องปิดท้ายด้วย ยอดขาย').toContain('label="ยอดขาย"')
    /* ช่อง "ยอดขาย" ต้องไม่มีจุดสี — มันเป็นผลรวมของสองแท่ง ไม่ใช่ซีรีส์ในกราฟ
       (กติกาเดิมของไฟล์: จุดสี = ซีรีส์ 1:1 ดู v5 หัวไฟล์) */
    expect(bar, 'ช่อง "ยอดขาย" ห้ามมีจุดสี').toMatch(/<LegendCell label="ยอดขาย"/)
  })

  it('[blocker] ต้องมีแถวสถานะงาน และเป็นที่เดียวที่นับใบที่ยกเลิก', () => {
    /**
     * 🛑 ทุกตัวเลขอื่นในหน้านี้ตัด `CANCELLED` ทิ้งตั้งแต่ query ⇒ ถ้าไม่มีแถวนี้
     * ร้านจะไม่มีทางรู้เลยว่าเดือนนี้ยกเลิกไปกี่งาน (ร้านตัวอย่าง ส.ค.: ยกเลิก 2 จาก 10)
     * การซ่อนงานที่ยกเลิกคือการรายงานเดือนที่ดูดีกว่าความจริง
     */
    const code = stripComments(read(SHEET))
    for (const label of ['งานทั้งหมด', 'เสร็จแล้ว', 'นัดไว้', 'ยกเลิก']) {
      expect(code, `แถวสถานะต้องมี "${label}"`).toContain(label)
    }
    expect(code, 'ต้องผูกกับ jobStatusCounts').toMatch(/const jobs = series\.jobStatusCounts/)
    /* "ไม่มาตามนัด" ขึ้นเฉพาะเมื่อมีจริง — ช่องที่เป็น 0 ตลอดไม่ได้บอกอะไร มันแค่กินที่ */
    expect(code, 'ไม่มาตามนัดต้องมีเงื่อนไข > 0').toMatch(/jobs\.noShow > 0/)

    const svc = stripComments(read(SERVICE))
    expect(svc, 'groupBy ของสถานะงานต้อง **ไม่** ตัด CANCELLED ทิ้ง').toMatch(
      /by: \['status', 'appointmentStatus'\],\s*where: \{ shopId, createdAt: \{ gte, lt \} \}/,
    )
  })

  it('[blocker] 4 กลุ่มของสถานะงานต้องไม่ทับกันและบวกได้ total', () => {
    /* ลำดับ if/else คือสิ่งที่ทำให้ไม่ทับกัน — ยกเลิกต้องชนะก่อนเสมอ ไม่งั้นใบที่
       `CANCELLED` + `COMPLETED` (มีจริงบนฐาน) จะถูกนับสองรอบแล้วผลรวมเกิน total */
    const svc = stripComments(read(SERVICE))
    const at = svc.indexOf('acc.total += n')
    expect(at, 'ต้องมีตัวรวมสถานะงาน').toBeGreaterThan(-1)
    const body = svc.slice(at, at + 400)
    const order = ["status === 'CANCELLED'", "'COMPLETED'", "'NO_SHOW'", 'acc.upcoming']
      .map((t) => body.indexOf(t))
    expect(order.every((x) => x > -1), 'ต้องมีครบทั้ง 4 สาขา').toBe(true)
    expect([...order].sort((a, b) => a - b), 'ยกเลิกต้องถูกเช็คก่อน แล้วค่อยเสร็จ/ไม่มา/ที่เหลือ').toEqual(
      order,
    )
  })

  it('[blocker] ห้ามส่ง payload ที่ไม่มีใครอ่านแล้ว', () => {
    /* `depositValues`/`receivedConfirmedValues` ถูกถอดพร้อมคอลัมน์ที่มันเลี้ยง —
       ปล่อยไว้ = จ่าย query + ขนาด flight payload ทุกครั้งที่เปิดหน้า เพื่อของที่ไม่มีใครแสดง */
    const svc = stripComments(read(SERVICE))
    for (const dead of ['depositValues', 'receivedConfirmedValues']) {
      expect(svc, `${dead} ไม่มีผู้อ่านแล้ว ต้องไม่ถูกคำนวณ/ส่งต่อ`).not.toContain(dead)
    }
  })
})

describe('ตารางรายวันห้ามยืนยันสิ่งที่ไม่รู้', () => {
  it('[blocker] service ต้องส่งชุด "ใบที่ยังไม่เคยบันทึกรับเงิน" มาด้วย', () => {
    /* ถ้าไม่มีชุดนี้ หน้าจอจะแยก "รู้ว่าค้าง" ออกจาก "ไม่รู้" ไม่ได้เลย แล้วก็ไม่มีทางเลือก
       นอกจากทาสีเตือนให้ทุกแถวที่ยังไม่มีเงินเข้า ซึ่งคือรูปร่างของบั๊กนี้ */
    const code = stripComments(read(SERVICE))
    expect(code, 'ต้องมี unrecordedValues').toMatch(/unrecordedValues/)
    expect(
      code,
      'ต้องนับจากจำนวนแถว payments ไม่ใช่จากยอดรวมเป็น 0 — บันทึกรับ ฿0 คือ "รู้" ไม่ใช่ "ไม่รู้"',
    ).toMatch(/payments\?\.length \?\? 0\) === 0/)
  })

  it('[blocker] สีเตือนของ "ค้างรับ" ต้องใช้เฉพาะตอนมีบันทึกรับเงินแล้วบางส่วน', () => {
    /**
     * 🛑 `r.received > 0` คือส่วนที่ขาดไปตอนแรก — ถ้าไม่มีเงื่อนไขนี้ แถวที่ยังไม่เคยบันทึก
     * รับเงินเลยจะได้สีส้มเหมือนแถวที่ *รู้แน่* ว่าเก็บไม่ครบ ⇒ จอยืนยันสิ่งที่ไม่รู้
     */
    const code = stripComments(read(SHEET))
    expect(code, 'ต้องมีเงื่อนไข received > 0 คู่กับสีเตือน').toMatch(
      /r\.value - r\.received > 0 && r\.received > 0[\s\S]{0,80}text-warning-ink/,
    )
  })

  it('[blocker] ต้องมีหมายเหตุบอกทั้งสองเรื่อง และขึ้นเฉพาะร้านบริการ', () => {
    /**
     * ตัวเลขอย่างเดียวปิดความเข้าใจผิดสองข้อนี้ไม่ได้:
     *   1. "มัดจำ" เป็นส่วนหนึ่งของ "รับจริง" ไม่ใช่ก้อนบวกเพิ่ม (ชีตนี้ออกแบบให้ไล่บวกลบตามได้)
     *   2. ยอดค้างรับที่มาจากใบที่ไม่เคยบันทึก = เพดานบน ไม่ใช่ยอดที่ยืนยันแล้ว
     *
     * 🛑 ต้องกั้น `isService` — ร้านขายออนไลน์ไม่มีคอลัมน์ "มัดจำ/รับจริง" เลย
     * ข้อความนี้บนจอเขาคือประโยคที่ไม่มีอะไรรองรับ (คำอธิบายที่อ้างของที่ไม่มีอยู่)
     */
    const code = read(SHEET)
    /* 🛑 ตรวจ *ความหมาย* ไม่ใช่ถ้อยคำเป๊ะ — ร่างแรกปักหมุดประโยค "มัดจำนับรวมอยู่ใน" ตรง ๆ
       แล้วแดงทันทีที่ปรับถ้อยคำตอนเพิ่มคอลัมน์ ทั้งที่หมายเหตุยังบอกเรื่องเดิมครบ
       (รอยเดิมของรีโปข้อนี้ — ด่านที่ผูกกับวิธีเขียนพังตอน refactor แล้วคนถัดไปจะปิดมันทิ้ง) */
    /* 🛑 เกณฑ์เปลี่ยนตามคอลัมน์: ตั้งแต่ 2026-08-23 ตารางเหลือแกนเงินแกนเดียว
       หมายเหตุจึงเขียนสมการของแถวตรง ๆ แทนการอธิบายว่าคอลัมน์ไหนบวกไม่ได้ */
    expect(code, 'ต้องเขียนสมการของแถวไว้ให้ไล่ตามได้').toMatch(
      /รับจริง&rdquo; \+ &ldquo;ค้างรับ&rdquo; = &ldquo;ยอดขาย/,
    )
    expect(code, 'ต้องบอกว่ายอดค้างรับเป็นเพดานบนเมื่อยังไม่ได้บันทึก').toContain(
      'บางรายการยังไม่ได้บันทึกการรับเงิน',
    )

    const at = code.search(/รับจริง&rdquo; \+ &ldquo;ค้างรับ/)
    const before = code.slice(Math.max(0, at - 700), at)
    expect(before, 'หมายเหตุต้องอยู่ใต้เงื่อนไข isService').toContain('{isService && (')

    /* ประโยคที่สองต้องขึ้นเฉพาะเมื่อมีใบแบบนั้นจริง — ขึ้นตลอดเวลาจะกลายเป็นข้อความประจำ
       ที่ไม่มีใครอ่าน แล้ววันที่มันสำคัญจริงก็จะถูกมองข้ามไปด้วย */
    expect(stripComments(code), 'ต้องผูกกับ hasUnrecorded').toMatch(/\{hasUnrecorded && \(/)
  })
})
