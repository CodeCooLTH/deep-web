/**
 * [blocker] แถบสถานะพัสดุต้องมีคนวาดคนเดียว (2026-08-25)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ทำไมต้องมีด่านนี้
 *
 * ก่อนงานนี้มี **5 จอวาดแถบ 4 จุดของตัวเองแยกกัน** — และมันเคย drift จริง:
 * `ParcelTimeline` (ผู้ซื้อ) ไล่หา stage ในรายชื่อ key คนละชุดกับฝั่งร้าน
 * (`PARCEL_CREATED`/`LABEL_PRINTED`/`DELIVERED` = ค่าของ `OrderStageKey` ไม่ใช่
 * `ShippingStageKey`) ⇒ ตัดกันแค่ `SHIPPING` ค่าเดียว: พัสดุที่ส่งถึงแล้วโชว์
 * "สร้างพัสดุ" และแถบเตือน "พัสดุมีปัญหา" **ไม่เคยขึ้นเลยสักครั้งตั้งแต่วันแรก**
 * `tsc` มองไม่เห็นเพราะ prop ตรงนั้นประกาศเป็น `string`
 *
 * พอแถบกลายเป็น 2 แถว โอกาส drift โตขึ้นอีกหลายเท่า (ทิศทาง · จำนวนจุด · คำ · สี ·
 * ตำแหน่งลูกศร) ⇒ ต้องบังคับที่ระดับซอร์สว่า **ห้ามใครวาดเอง**
 *
 * แดง = ห้าม merge
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { describeReturnLeg } from '../return-timeline'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

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

/**
 * 2 ไฟล์เท่านั้นที่มีสิทธิ์วาดจุดจาก `SHIPMENT_STAGES` เอง
 *
 * แยกเป็น 2 ตัวเพราะ **skin คนละธีมจริง ๆ** ไม่ใช่เพราะขี้เกียจรวม:
 *   ShipmentRail   → Paces (`bg-success`/`size-8`/`end-4`)
 *   ParcelTimeline → Vuexy/MUI — `(marketing)/layout.tsx` โหลด `marketing.css` ซึ่ง
 *                     **ไม่มีนิยาม utility ของ Paces เลย** เขียนไปก็เงียบ ไม่มี error
 *                     มีแต่กล่องไม่มีสี (docs/conventions/reference-vs-theme-source.md)
 * ทั้งคู่ต้องอ่านคำ/จำนวนจุดจาก SSOT ตัวเดียวกัน (`describeReturnLeg`)
 */
const RAIL_RENDERERS = [
  'src/components/safepay/iship/ShipmentRail.tsx',
  'src/app/(marketing)/o/[token]/ParcelTimeline.tsx',
]

/**
 * ข้อยกเว้นเดียว — `MiniShipmentTimeline` วาดจุด 4 จุดเองสำหรับ **ออเดอร์ที่ไม่มีขากลับ**
 * (แถวปกติในตาราง = ไอคอนล้วน ไม่มีคำ) · พอมีขากลับมันส่งต่อให้ `ShipmentRail` ทันที
 *
 * 🛑 ยกเว้นแบบ **มีเงื่อนไขบังคับ** ไม่ใช่เปิดช่องว่าง — เทสด้านล่างบังคับว่าเคสมีขากลับ
 * ต้องเรียก `ShipmentRail` ห้ามวาดแถว 2 เอง (carve-out ที่ไม่มีด่านคุม = ที่ที่ของกลับมาซ่อน
 * — บทเรียน 00037)
 */
const COLLAPSED_RENDERER =
  'src/app/(paces)/seller/(dashboard)/orders/components/MiniShipmentTimeline.tsx'

describe('[blocker] ห้ามจอไหนวาดแถบเอง', () => {
  it('มีแค่ 3 ไฟล์ที่ map SHIPMENT_STAGES เพื่อวาดจุด', () => {
    const allowed = [...RAIL_RENDERERS, COLLAPSED_RENDERER]
    const offenders = walk('src').filter((f) => {
      if (allowed.includes(f) || f.includes('__tests__')) return false
      return /SHIPMENT_STAGES\.map\(/.test(stripComments(read(f)))
    })
    expect(
      offenders,
      'ใช้ <ShipmentRail> แทน — 5 จอเคยวาดเองแล้ว drift มาแล้วจริง (ParcelTimeline 2026-08-24)',
    ).toEqual([])
  })

  it('แถบจิ๋วที่ได้รับยกเว้น ต้องส่งต่อให้ ShipmentRail เมื่อมีขากลับ ห้ามวาดแถว 2 เอง', () => {
    const src = stripComments(read(COLLAPSED_RENDERER))
    // จับ **การเรียกใช้** ไม่ใช่ชื่อเปล่า ๆ (บรรทัด import ก็ match ชื่อได้)
    expect(src).toContain('describeReturnLeg(')
    /**
     * 🛑 ต้องตรวจ **สาขาของแถวตาราง** (`if (plain)`) ไม่ใช่ทั้งไฟล์
     *
     * รอบแรกเขียน `expect(src).toContain('<ShipmentRail')` เฉย ๆ แล้ว mutation เขียว
     * ทั้งที่ถอด `ShipmentRail` ออกจากสาขาตารางไปหมดแล้ว — เพราะสาขา `inline`
     * (การ์ดมือถือ) ก็เรียกมันเหมือนกัน ⇒ ด่านยืนยันแค่ว่า "ไฟล์นี้เอ่ยชื่อ component"
     * ซึ่งไม่ใช่สิ่งที่กำลังกัน (docs/conventions/mutation-silence-means-weak-corpus.md)
     */
    const plainBranch = src.slice(src.indexOf('if (plain)'), src.indexOf('if (inline)'))
    expect(plainBranch, 'สาขาแถวตารางต้องส่งต่อให้ ShipmentRail เมื่อมีขากลับ').toContain(
      '<ShipmentRail',
    )
    // ห้ามพิมพ์ไอคอน/คำของขากลับเองที่นี่ — ต้องมาจาก `leg` ที่ SSOT คืนมาเท่านั้น
    expect(src).not.toContain("'arrow-back-up'")
    expect(src).not.toContain('truck-return')
    expect(src).not.toContain('กลับถึงร้าน')
  })

  it('ทั้ง 2 ตัววาดต้องอ่านแถวที่ 2 จาก SSOT ตัวเดียวกัน', () => {
    for (const f of RAIL_RENDERERS) {
      const src = stripComments(read(f))
      // ShipmentRail รับ leg มาเป็น prop · ParcelTimeline สร้างเอง — ทั้งคู่ต้องผูกกับ type/ฟังก์ชันกลาง
      expect(src, f).toMatch(/ReturnLeg|describeReturnLeg/)
    }
  })
})

describe('[blocker] ทุกจอที่แสดงแถบต้องรู้จักแถวที่ 2', () => {
  /** 6 surface ที่แสดงสถานะพัสดุให้คนอ่าน — ไล่จากการค้นจริง ไม่ใช่รายชื่อที่จำมา */
  const SURFACES = [
    'src/app/(paces)/seller/(dashboard)/orders/components/ShipmentHoverCard.tsx',
    'src/app/(paces)/seller/(dashboard)/orders/components/MiniShipmentTimeline.tsx',
    'src/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingCard.tsx',
    'src/components/safepay/iship/ShipmentStatusView.tsx',
    'src/app/(paces)/seller/(chat)/_components/ShipmentStepper.tsx',
    'src/app/(marketing)/o/[token]/ParcelTimeline.tsx',
  ]

  it('ทุกจอต้องเรียก describeReturnLeg — ไม่มีจอไหนตกหล่น', () => {
    for (const f of SURFACES) {
      const src = stripComments(read(f))
      // 🛑 จับ **การเรียกใช้** ไม่ใช่ชื่อเปล่า ๆ — บรรทัด import ก็ match ชื่อได้
      expect(src, f).toContain('describeReturnLeg(')
    }
  })

  /**
   * 🛑 ผู้ซื้อต้องอ่านคำคนละชุดกับผู้ขาย — ไม่งั้นเขาจะเห็นคำว่า "ถึงร้านค้า" ซึ่งเขียนจาก
   * มุมร้าน แล้วสับสนว่าของอยู่ไหน (เขายังไม่ได้ของและอาจยังไม่ได้เงินคืน)
   */
  it('จอผู้ซื้อต้องใช้ audience "buyer" · จอร้านต้องใช้ "seller"', () => {
    const buyer = stripComments(read('src/app/(marketing)/o/[token]/ParcelTimeline.tsx'))
    expect(buyer).toMatch(/audience:\s*'buyer'/)
    expect(buyer).not.toMatch(/audience:\s*'seller'/)

    for (const f of SURFACES.filter((x) => !x.includes('(marketing)'))) {
      const src = stripComments(read(f))
      expect(src, f).toMatch(/audience:\s*'seller'/)
      expect(src, f).not.toMatch(/audience:\s*'buyer'/)
    }
  })
})

describe('[blocker] เคส "คืนของ" ต้องเข้าถึงได้จริง ไม่ใช่โค้ดตาย', () => {
  /**
   * 🛑 บทเรียน 2026-08-26: กิ่ง `RETURN` ของ `describeReturnLeg` ถูกเขียนครบทั้งกิ่ง
   * (คำ 3 ชุด · จำนวนจุด 4/3/2 ตาม `trackingSource` · เทส 32 เคส) แล้ว **ไม่มีจอไหนส่ง
   * `orderReturn` เข้ามาเลยสักจอ** ⇒ ครึ่งหนึ่งของขอบเขตที่ user อนุมัติไม่เคยขึ้นจอจริง
   * และเอกสารก็เขียนไว้ต่ำกว่าความจริงว่า "แค่ตารางมองไม่เห็น"
   *
   * `tsc`/build/eslint/เทสเดิมผ่านหมด เพราะโค้ดถูกทุกตัวอักษร — มันแค่ไม่เคยถูกเรียก
   * (คลาสเดียวกับ `docs/conventions/rule-must-be-enforced-not-described.md`)
   */
  it('ต้องมีอย่างน้อย 1 จอที่ส่ง orderReturn เข้า describeReturnLeg', () => {
    const callers = walk('src')
      .filter((f) => /\.tsx$/.test(f) && !f.includes('__tests__'))
      /**
       * 🛑 ต้องเป็น `orderReturn={` (การ **ส่งค่า** ใน JSX) ไม่ใช่ `orderReturn[=:]`
       *
       * รอบแรกใช้ `[=:]` แล้ว mutation เขียว เพราะมันไป match `orderReturn:` ใน **ตัวประกาศ
       * prop ของ `ShippingCard` เอง** ⇒ ถอดการส่งค่าที่ผู้เรียกออกหมด เทสก็ยังเขียว
       * = ด่านที่ยืนยันแค่ว่า "มีคนประกาศ prop ไว้" ซึ่งไม่ใช่สิ่งที่กำลังกัน
       * (docs/conventions/mutation-silence-means-weak-corpus.md)
       */
      .filter((f) => /orderReturn=\{/.test(stripComments(read(f))))
    expect(
      callers.length,
      'กิ่ง RETURN กลายเป็นโค้ดตายอีกแล้ว — เคสคืนของจะไม่มีวันขึ้นจอ',
    ).toBeGreaterThan(0)
  })

  /** เวลาของแถว 2 เคสคืนของต้องมาจากใบคืน ไม่ใช่ค้างเป็น null เหมือนรอบแรก */
  it('เคสคืนของต้องได้เวลาจากใบคืน (createdAt/receivedAt)', () => {
    const src = stripComments(read('src/lib/iship/return-timeline.ts'))
    expect(src).toContain('toDate(ret.createdAt)')
    expect(src).toContain('toDate(ret.receivedAt)')
  })
})

describe('[blocker] แถบตีกลับต้อง invert กับขาไป', () => {
  /**
   * 🛑 ขาไปเดินซ้าย→ขวา (ออกจากร้าน) · ขากลับต้องเดินขวา→ซ้าย (กลับเข้าร้าน)
   *   ขาไป   รอส่งของ → รับเข้าระบบแล้ว → กำลังจัดส่ง → ส่งสำเร็จ
   *   ขากลับ ถึงร้านค้า ← กำลังส่ง ← กำลังตีกลับ ← พัสดุมีปัญหา
   *
   * ทิศเป็น **ความหมาย** ไม่ใช่การตกแต่ง — ซ้าย = ร้าน = ต้นทาง · ของที่กำลังกลับมาหาเรา
   * ต้องเคลื่อนเข้าหาเรา · ผมเคยเขียนเองว่า "ทิศกลับด้านมีความหมายก็ต่อเมื่อมีขาไปให้เทียบ"
   * แล้ววาดเป็นซ้าย→ขวา ซึ่ง user ทักทันทีที่เห็น (2026-08-27)
   */
  const RAIL = 'src/components/safepay/iship/ShipmentRail.tsx'

  it('สาขา standalone ต้องใช้ flex-row-reverse ทั้งแถวจุดและแถวป้าย', () => {
    const src = stripComments(read(RAIL))
    const branch = src.slice(src.indexOf('if (leg.standalone)'), src.indexOf('const n2 =') + 1 || undefined)
    const seg = src.slice(src.indexOf('if (leg.standalone)'))
    const upToNext = seg.slice(0, seg.indexOf('const row2'))
    expect((upToNext.match(/flex-row-reverse/g) ?? []).length, branch && '').toBeGreaterThanOrEqual(2)
  })

  /**
   * 🛑 ด่านนี้เคยบังคับว่า "ต้องมีลูกศร `caret-left-filled`" — ถอดออกแล้ว (2026-08-27)
   *
   * user เห็นทั้งสองแบบแล้วเลือกให้แถบขากลับ **หน้าตาเหมือนขาไปเป๊ะ** (สี/ระยะ/ไม่มีอะไร
   * คั่นระหว่างจุด) เหลือ *ทิศ* เป็นสิ่งเดียวที่ต่าง ⇒ ตัวที่บอกทิศคือลำดับคำ
   * (`ถึงร้านค้า` ซ้ายสุด) และชุดไอคอนที่ mirror กับขาไป
   *
   * ด่านที่ผูกกับ **กลไก** (ชื่อไอคอน) จะแดงทันทีที่ดีไซน์เปลี่ยนทั้งที่เจตนายังอยู่ครบ
   * ⇒ ย้ายไปบังคับสิ่งที่เป็นเจตนาจริง: **4 จุดต้องมี 4 ไอคอนไม่ซ้ำกัน**
   * (รอบแรก `กำลังตีกลับ`/`กำลังส่ง` ใช้ `truck-return` ตัวเดียวกัน ⇒ สองจุดกลางดูเหมือนกันเป๊ะ)
   */
  it('ทุกจุดบนแถบขากลับต้องมีไอคอนไม่ซ้ำกัน', () => {
    const dispatched = '2026-08-24T03:00:00Z'
    for (const code of ['return', 'return_success']) {
      const leg = describeReturnLeg({
        audience: 'seller',
        carrierStatus: code,
        returnDispatchedAt: dispatched,
      })!
      const icons = leg.dots.map((d) => d.icon)
      expect(new Set(icons).size, `${code}: ${icons.join(', ')}`).toBe(icons.length)
    }
  })
})
