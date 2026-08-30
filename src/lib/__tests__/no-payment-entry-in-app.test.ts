import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] ในแอป iOS ต้องไม่มี **ทางเข้า** หน้าจ่ายเงินเหลืออยู่เลย (Guideline 3.1.1)
 *
 * ## บั๊กที่ด่านนี้กัน (หัวหน้าเจอ 2026-08-19 บน TestFlight)
 *
 * เมนู "แพ็กเกจของฉัน" ยังโผล่ในแอป กดแล้วเด้งกลับหน้าแรก — เพราะ `/subscriptions/page.tsx`
 * กันไว้แล้วตั้งแต่รอบที่โดนตีกลับ (2026-08-04) **แต่ไม่มีใครซ่อนทางเข้า**
 *
 * 🛑 "กดแล้วไม่เกิดอะไร" ไม่ใช่การผ่านข้อนี้ — Apple ดูว่า *มีลิงก์ไปหน้าซื้อไหม* ไม่ได้ดูว่า
 * ลิงก์นั้นทำงานไหม และผู้ใช้จริงก็เจอเมนูที่กดแล้วเงียบ ซึ่งแย่กว่าไม่มีเมนู
 *
 * ## ต้นเหตุเชิงโครงสร้าง
 *
 * sidebar กรองถูกมาตลอดผ่าน `applyPaymentRestriction()` แต่ `ShopQuickLinks.tsx`
 * **ก็อปรายการเมนูไปไว้เองอีกชุด** (หัวไฟล์เขียนเองว่าคัดมาจาก `seller-menu.ts` ซึ่งเป็น SSOT)
 * ⇒ ตัวกรองที่เขียนให้ SSOT ไม่มีผลกับสำเนา — Hard Rule 16 ตรงตัว
 *
 * ไล่ทั้งคลาสแล้วเจอเพิ่มอีก 3 จุดที่ไม่มีใครรายงาน: `/business/create` (เข้าถึงได้จากเมนู
 * สลับบัญชี แล้วโชว์ปุ่ม "ไปเลือกแพ็กเกจ") · ราคาแพ็กเกจบนหน้าจัดการพนักงาน · ปุ่มที่
 * **หักเงินทันที** ใน `LockedStateBanner` ("ระบบจะหักเงิน ฿X")
 *
 * 🛑 แดง = ห้าม merge · และห้าม ship แอปโดยไม่รันด่านนี้
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
 *
 * 🛑 ต้องลบ **คอมเมนต์ท้ายบรรทัด** ด้วย ไม่ใช่เฉพาะบรรทัดที่ขึ้นต้นด้วย `//`
 * ไม่งั้นคอมเมนต์ท้ายบรรทัดที่บังเอิญพิมพ์คำว่า `hidePayments` จะทำให้ `GATE` ผ่าน
 * ทั้งที่ในโค้ดจริงไม่มีด่านสักบรรทัด (พบจริงตอนไล่ 2026-08-26: `settings/ai/page.tsx`
 * มีคำว่า "อัพเกรดแพ็กเกจ" อยู่ในคอมเมนต์ท้ายบรรทัด แล้วสแกนเนอร์อ่านเป็นข้อความบนจอ)
 *
 * `(?<!:)` กัน `https://…` ไม่ให้ถูกตัด — `//` ของ URL มี `:` นำหน้าเสมอ
 */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

const SELLER = 'src/app/(paces)/seller'

/**
 * ไล่ไฟล์ทั้งต้นไม้ — ไม่ hardcode รายชื่อ ไฟล์ใหม่จึงถูกตรวจอัตโนมัติ
 *
 * 🛑 ต้องกวาด `.ts` ด้วยไม่ใช่แค่ `.tsx` — ข้อความบนจอของรีโปนี้อยู่ในไฟล์ `.ts` เป็นปกติ
 * (`products/components/data.ts` เก็บ label สินค้า · `notification-data.ts` เก็บรายการแจ้งเตือน)
 * กวาดแค่ `.tsx` = ไฟล์คำพูดทั้งกลุ่มไม่เคยถูกตรวจเลย
 */
function walkTsx(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walkTsx(`${dir}/${e.name}`)
      : (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) && !dir.includes('__tests__')
        ? [`${dir}/${e.name}`]
        : [],
  )
}
const GATE = /hidePayments|shouldHidePayments|isPaymentRestricted/

describe('[blocker] ทางเข้าหน้าจ่ายเงินต้องมีด่าน app-shell ทุกจุด', () => {
  /**
   * ทุก route ที่ "เข้าไปแล้วเจอราคา/ปุ่มซื้อ" ต้องเด้งออกเมื่อเปิดจากในแอป —
   * ซ่อนเมนูอย่างเดียวไม่พอ เพราะพิมพ์ URL ตรงได้ และเมนูที่ลืมซ่อนจะพาเข้ามาเอง
   */
  const GUARDED_ROUTES = [
    `${SELLER}/(dashboard)/subscriptions/page.tsx`,
    `${SELLER}/(dashboard)/business/page.tsx`,
    // 🛑 `business/create/page.tsx` **ไม่อยู่ในชุดนี้โดยตั้งใจ** — มันต้องกันแบบแคบ
    // (เฉพาะกิ่งที่มีปุ่มไปจ่ายเงิน) ดูเทส "ห้ามกันกว้างเกิน" ด้านล่าง
  ]

  for (const rel of GUARDED_ROUTES) {
    it(`${rel.split('/').slice(-2).join('/')} — ต้อง redirect เมื่อเปิดจากในแอป`, () => {
      const code = blankComments(read(rel))
      expect(code, 'ต้องเรียก shouldHidePayments()').toMatch(/shouldHidePayments\(\)/)
      expect(code, 'ต้อง redirect ออก ไม่ใช่แค่เรียกแล้วไม่ทำอะไร').toMatch(
        /shouldHidePayments\(\)\)\s*redirect\(/,
      )
    })
  }

  /**
   * surface ที่ **แสดงลิงก์/ปุ่ม** ไปหน้าจ่ายเงิน — ต้องอ่านธงมาตัดสินเอง
   *
   * 🛑 `ShopQuickLinks` คือจุดที่พลาดจริง: มันไม่ได้ import อะไรจาก seller-menu.ts เลย
   * จึงไม่มีอะไรโยงให้ใครนึกได้ว่าต้องมากรองที่นี่ด้วย
   */
  const LINK_SURFACES = [
    `${SELLER}/(dashboard)/shop/components/ShopQuickLinks.tsx`,
    `${SELLER}/(dashboard)/business/components/LockedStateBanner.tsx`,
    `${SELLER}/(dashboard)/business/[shopId]/invites/page.tsx`,
    `${SELLER}/(dashboard)/settings/ai/AiSettingForm.tsx`,
    `${SELLER}/(chat)/inbox/[conversationId]/components/AiSuggestPanel.tsx`,
    /**
     * 🛑 เจอทีหลังเพราะสแกนรอบแรกมองแค่ลิงก์ `/business` กับ `/subscriptions`
     * ตัวนี้ชี้ `/inventory` ⇒ ตกสำรวจ — บทเรียน: คัดจาก **คำเชิญบนจอ** ด้วย ไม่ใช่จาก
     * รายชื่อ URL ที่นึกออกตอนนั้น (ดู PURCHASE_CTA_WORDS ท้ายไฟล์)
     */
    `${SELLER}/(dashboard)/products/components/ProductStockCardV2.tsx`,
    'src/layouts/components/TopBar/components/UserDropdownDetailed.tsx',
  ]

  for (const rel of LINK_SURFACES) {
    it(`${rel.split('/').pop()} — ต้องอ่านธง hidePayments`, () => {
      expect(blankComments(read(rel)), `${rel}: ลิงก์ไปหน้าซื้อต้องหายในแอป`).toMatch(GATE)
    })
  }

  it('[blocker] ShopQuickLinks ต้องกรอง /subscriptions ออกจริง ไม่ใช่แค่รับ prop', () => {
    /**
     * 🛑 รับ prop แล้วไม่ใช้ = เขียวโดยไม่ทำอะไร ซึ่งเป็นรูปแบบที่ `rule-must-be-enforced-
     * not-described.md` เตือนไว้ตรงตัว (prop `_shopId` ที่ส่งมาแล้วไม่ถูกใช้)
     */
    const code = blankComments(
      read(`${SELLER}/(dashboard)/shop/components/ShopQuickLinks.tsx`),
    )
    expect(code, 'ต้องมีชุด url ที่ถือว่าเป็นทางเข้าจ่ายเงิน').toMatch(/PAYMENT_LINK_URLS/)
    expect(code, "'/subscriptions' ต้องอยู่ในชุดนั้น").toMatch(
      /PAYMENT_LINK_URLS[\s\S]{0,120}\/subscriptions/,
    )
    /**
     * 🛑 `[^)]*` ใช้ไม่ได้ — มันหยุดที่วงเล็บปิดของ `(l) =>` ซึ่งมาก่อนชื่อชุดเสมอ
     * (ร่างแรกของด่านนี้แดงใส่โค้ดที่ถูกอยู่แล้ว) ต้องเป็น lazy window ข้ามอักขระได้ทุกตัว
     */
    expect(code, 'ต้องเอาชุดนั้นไปกรองรายการจริง').toMatch(
      /\.filter\([\s\S]{0,80}?PAYMENT_LINK_URLS/,
    )
  })

  it('[blocker] ธงของ ShopQuickLinks ห้ามมีค่าเริ่มต้น — ผู้เรียกที่ลืมส่งต้องแดงที่ tsc', () => {
    /**
     * `hidePayments = false` เป็นค่าตั้งต้น = หน้าที่ลืมส่งจะ "โชว์ทุกอย่าง" เงียบ ๆ
     * ซึ่งคือรูปร่างของบั๊กที่ prop นี้ถูกสร้างมาแก้พอดี
     */
    const code = blankComments(
      read(`${SELLER}/(dashboard)/shop/components/ShopQuickLinks.tsx`),
    )
    expect(code, 'ต้องเป็น required prop').toMatch(/hidePayments:\s*boolean/)
    expect(code, 'ห้ามตั้ง default ให้ธงนี้').not.toMatch(/hidePayments\s*=\s*false/)
  })

  it('[blocker] ห้ามกันกว้างเกินจนถอดฟีเจอร์ที่ลูกค้าจ่ายเงินมาแล้ว', () => {
    /**
     * 🛑 ด่านนี้กันทิศ **ตรงข้าม** กับด่านอื่นในไฟล์นี้ — กันการกันมากเกินไป
     *
     * ร่างแรกของการแก้รอบนี้ `redirect` ทั้งหน้า `/business/create` เมื่อเปิดจากในแอป
     * ⇒ ผู้ขายที่จ่ายค่าแพ็กเกจไปแล้วและยังมีโควตาเหลือ **สร้างธุรกิจในแอปไม่ได้เลย**
     * ทั้งที่ตรงนั้นไม่มีการจ่ายเงินเกิดขึ้น (user ทักท้วง)
     *
     * Apple ห้าม "ขายในแอป" ไม่ได้ห้าม "ใช้ของที่ซื้อไปแล้ว" (3.1.3(b)) — และ App Review
     * Notes ของเราเขียนไว้เองว่าผู้ขายที่มีแพ็กเกจอยู่แล้วยังใช้ฟีเจอร์ที่ซื้อไปได้ต่อ
     * ⇒ กันกว้างกว่านั้น = ทำให้เอกสารที่เราส่งให้ Apple กลายเป็นคำอ้างที่ไม่ตรงกับของจริง
     *
     * เกณฑ์: `shouldHidePayments()` ต้องไม่ถูกใช้ redirect ที่ **ต้นฟังก์ชัน** ของหน้านี้
     * แต่ต้องอยู่ในกิ่งที่การ์ดปฏิเสธถูก render (ซึ่งมีแต่ปุ่มไปจ่ายเงิน)
     */
    const code = blankComments(read(`${SELLER}/(dashboard)/business/create/page.tsx`))
    const body = code.slice(code.indexOf('export default async function'))
    const guardAt = body.indexOf('if (hidePayments) redirect(')
    const firstGate = body.indexOf("sub.status !== 'ACTIVE'")
    expect(guardAt, 'ต้องมี redirect ในกิ่งการ์ดปฏิเสธ').toBeGreaterThan(-1)
    expect(
      guardAt > firstGate,
      'ห้าม redirect ที่ต้นฟังก์ชัน — คนที่มีแพ็กเกจแล้วต้องสร้างธุรกิจได้ในแอป',
    ).toBe(true)
    expect(body, 'ต้องอ่านธงไว้ก่อน แล้วค่อยใช้ในกิ่ง').toMatch(
      /const hidePayments = await shouldHidePayments\(\)/,
    )
  })

  it('[blocker] เมนูสลับบัญชีต้องแยก "ซ่อนการจ่ายเงิน" ออกจาก "สร้างได้จริงไหม"', () => {
    const dd = blankComments(read('src/layouts/components/TopBar/components/UserDropdownDetailed.tsx'))
    expect(dd, 'ต้องยอมให้คนที่สร้างได้ เห็นปุ่มแม้อยู่ในแอป').toMatch(
      /!context\.hidePayments \|\| context\.canCreateBusiness/,
    )
    const api = blankComments(read('src/app/api/business/context/route.ts'))
    expect(api, 'API ต้องคำนวณ canCreateBusiness จากแพ็กเกจ+โควตา').toMatch(/canCreateBusiness\s*=/)
  })

  it('[blocker] payload ของเมนูสลับบัญชีต้องส่ง hidePayments มาด้วย', () => {
    /**
     * เมนูนี้ถูก mount จากกว่า 10 ที่ — prop-drill = ลืมได้ทีละที่โดยไม่มีอะไรฟ้อง
     * payload เป็นแหล่งเดียวที่มันอ่านอยู่แล้ว จึงเป็นที่ที่ลืมไม่ได้
     */
    const api = blankComments(read('src/app/api/business/context/route.ts'))
    expect(api, 'API ต้องคำนวณธงจาก request จริง').toMatch(
      /const hidePayments = await shouldHidePayments\(\)/,
    )
    /**
     * 🛑 เช็คว่า "ส่งออกไปจริง" ไม่ใช่แค่ "คำนวณไว้" — ตัวแปรที่คำนวณแล้วไม่ถูกใส่ลง payload
     * คือรูปแบบที่ `rule-must-be-enforced-not-described.md` เตือนไว้ (คำนวณแล้วทิ้ง)
     */
    const payload = api.slice(api.indexOf('NextResponse.json('))
    expect(payload, 'ต้องอยู่ใน payload').toMatch(/\bhidePayments,/)
    expect(payload, 'ต้องส่ง canCreateBusiness ไปด้วย').toMatch(/\bcanCreateBusiness,/)
  })

  /**
   * 🛑 ด่านกวาด — คัดจาก **คำเชิญให้ซื้อที่ผู้ใช้เห็นบนจอ** ไม่ใช่จากรายชื่อ URL
   *
   * รอบแรกผมสแกนแค่ลิงก์ `/business` + `/subscriptions` แล้วประกาศว่าครบ — ตกไป 1 จุด
   * (`ProductStockCardV2` ชี้ `/inventory`) ซึ่งโผล่อยู่ในสกรีนช็อตที่กำลังจะส่งให้ Apple พอดี
   *
   * รายการ ALLOWLIST คือที่ที่ของกลับมาซ่อนได้ — ต่อท้ายเมื่อไรต้องเขียนเหตุผลกำกับเสมอ
   */
  it('[blocker] ไม่มีคำเชิญให้ซื้อในหน้า seller ที่ไม่มีด่าน', () => {
    /**
     * 🛑 คัดจาก **ประเภทของสิ่งที่ต้องกัน** ไม่ใช่จากตัวอย่างที่บังเอิญเจอตอนเขียน
     *
     * รอบก่อนลิสต์ไว้แค่คำที่มีคำว่า "แพ็กเกจ" ห้อยอยู่ ⇒ **แกนกระเป๋าเงิน/เครดิตหลุดทั้งแกน**
     * และมันคือรายได้อีกเส้นหนึ่งของระบบ (เครดิตก้อนเดียวจ่ายทั้ง SMS และ AI)
     * ผลคือหน้าตั้งค่า ChatBot ขึ้นคำว่า **"เติมเงินก่อน"** ในแอปมาตลอดโดยด่านนี้เขียวสนิท
     * — เจอตอนไล่ระบบด้วยมือ 2026-08-26 ไม่ใช่เจอเพราะเทสแดง
     *
     * Apple นับแม้แต่ "หน้าสมัครบัญชี" ว่าเป็นทางเข้าไปจ่ายเงินภายนอก (จดหมาย 2026-08-23)
     * ⇒ ประโยคที่ **สั่งให้ไปจ่าย** ชัดกว่านั้นอีก ถึงจะไม่มีลิงก์ก็ตาม
     * (3.1.3(f): "no calls to action for purchase outside of the app")
     *
     * เพิ่มคำใหม่เมื่อไร ให้ถามว่า "มันสั่งให้ผู้ใช้จ่ายเงิน หรือชี้ไปหน้าที่จ่ายเงินไหม"
     * ไม่ใช่ "เคยเห็นคำนี้ในสกรีนช็อตไหม"
     */
    const CTA = new RegExp(
      [
        // แกนแพ็กเกจ — กริยาใดก็ได้ที่ห้อยกับคำว่าแพ็กเกจ
        '(อัพเกรด|อัปเกรด|สมัคร|เลือก|ต่ออายุ|ซื้อ|ไปหน้า)แพ็กเกจ',
        // แกนแพ็กเกจแบบไม่มีคำว่าแพ็กเกจต่อท้าย
        'อัพเกรดเลย|อัปเกรดเลย|อัพเกรดเพื่อ|อัปเกรดเพื่อ',
        // แกนกระเป๋าเงิน/เครดิต — ตัวที่หลุดไปทั้งแกนรอบก่อน
        'เติมเงิน|เติมเครดิต|เพิ่มเครดิต|เติมยอด',
      ].join('|'),
    )
    /** ที่ที่คำนี้ปรากฏได้โดยไม่ต้องมีด่านของตัวเอง — ทุกบรรทัดต้องมีเหตุผล */
    const ALLOWLIST = [
      // อยู่ใต้ route /business ซึ่ง page.tsx ของมันเด้งออกให้แล้ว
      `${SELLER}/(dashboard)/business/`,
      // อยู่ใต้ /inventory ซึ่งเด้งออกเมื่อยังไม่สมัคร (คนสมัครแล้วเห็นได้ ถูกต้องตาม 3.1.3(b))
      `${SELLER}/(dashboard)/inventory/`,
      // อยู่ใต้ /wallet ซึ่งซ่อนปุ่มเติมเงิน+โมดัล+ตารางคำขอเมื่ออยู่ในแอป (ยอดคงเหลือยังแสดง)
      `${SELLER}/(dashboard)/wallet/`,
      // อยู่ใต้ /subscriptions ซึ่ง page.tsx เด้งออกให้แล้ว
      `${SELLER}/(dashboard)/subscriptions/`,
      /* การ์ดแพ็กเกจในเมนูข้าง — ตัวมันเองไม่มีด่าน แต่ (dashboard)/layout.tsx เรนเดอร์มัน
         หลัง `!hidePayments` · ข้ออ้างนี้ถูกตรวจด้วยเทสตัวถัดไป ไม่ได้เชื่อคอมเมนต์นี้ */
      `${SELLER}/(dashboard)/_shared/ShopPackageSidenavCard.tsx`,
      /* รายการแจ้งเตือนตัวอย่าง — เป็นโค้ดตายแล้ว (หน้า /notifications ใช้ข้อมูลจริง)
         ข้ออ้าง "ไม่มีใครใช้" ถูกตรวจด้วยเทสตัวถัดไป ถ้ามีคนต่อกลับมาใช้จะแดงทันที */
      `${SELLER}/(dashboard)/notifications/components/notification-data.ts`,
      // หน้าแอดมิน ไม่ได้อยู่ในแอปผู้ขาย
      'src/app/(paces)/admin/',
      // เว็บฝั่งผู้ซื้อ/landing — Apple ไม่มีอำนาจกับเว็บ
      'src/views/front-pages/',
      'src/components/pricing/',
    ]
    const files = walkTsx('src/app/(paces)/seller').concat(walkTsx('src/layouts'))
    const offenders: string[] = []
    for (const f of files) {
      if (ALLOWLIST.some((a) => f.startsWith(a))) continue
      const code = blankComments(readFileSync(join(ROOT, f), 'utf8'))
      if (!CTA.test(code)) continue
      if (GATE.test(code)) continue
      offenders.push(f.replace(`${SELLER}/`, ''))
    }
    expect(offenders, 'คำเชิญให้ซื้อต้องอยู่หลังด่าน hidePayments').toEqual([])
  })

  /**
   * 🛑 ข้ออ้างของ ALLOWLIST ต้องถูกตรวจ ไม่ใช่เชื่อคอมเมนต์
   *
   * หัวไฟล์นี้เขียนเองว่า "รายการ ALLOWLIST คือที่ที่ของกลับมาซ่อนได้" — แล้ววิธีเดียวที่จะ
   * ไม่ให้มันเป็นที่ซ่อนจริง ๆ คือผูกทุกบรรทัดเข้ากับเงื่อนไขที่เครื่องตรวจได้
   */
  it('[blocker] การ์ดแพ็กเกจในเมนูข้างต้องถูกกั้นที่ layout — ข้ออ้างของ ALLOWLIST', () => {
    const layout = blankComments(read(`${SELLER}/(dashboard)/layout.tsx`))
    expect(layout, 'layout ต้องยังเรนเดอร์การ์ดนี้').toContain('ShopPackageSidenavCard')

    // ตัดเอาเฉพาะบล็อกที่เรนเดอร์การ์ด แล้วดูว่ามี !hidePayments คุมอยู่จริง
    const at = layout.indexOf('<ShopPackageSidenavCard')
    const guardWindow = layout.slice(Math.max(0, at - 400), at)
    expect(guardWindow, 'ต้องเรนเดอร์หลัง !hidePayments เท่านั้น').toMatch(/!hidePayments/)
  })

  it('[blocker] รายการแจ้งเตือนตัวอย่างต้องยังไม่มีใครใช้ — ข้ออ้างของ ALLOWLIST', () => {
    /* ไฟล์นี้มีคำว่า "เติมเงิน ฿200 สำเร็จ" อยู่ในข้อมูลตัวอย่าง — ยกเว้นได้เพราะไม่ถูกเรนเดอร์
       (หน้า /notifications เปลี่ยนไปใช้ข้อมูลจริงตั้งแต่ T8) ถ้ามีคนต่อกลับมาใช้ ต้องแดงทันที
       เพราะข้อมูลนั้นจะกลายเป็นข้อความบนจอในแอป — และเป็นข้อมูลปลอมด้วย */
    /* 🛑 นับเฉพาะ **value import** — `import type { … }` ถูกลบตอน compile จึงพาสตริงขึ้นจอไม่ได้
       (`NotificationTimeline.tsx` import แค่ type ของมัน และตัวเองก็ไม่มีใครเรียก)
       ถ้าเช็ครวม type import จะแดงตลอดกาลโดยไม่มีอะไรผิดจริง = ด่านที่ถูกปิดเสียงทิ้งในที่สุด */
    const users = walkTsx(SELLER).filter((f) => {
      if (f.endsWith('notification-data.ts')) return false
      const code = blankComments(read(f))
      /* 🛑 ต้องผูกกับ "บรรทัดเดียว" — รีโปนี้ไม่ใส่ `;` ท้าย import ⇒ `[^;]*` จะไหลข้ามบรรทัด
         ไปคาบ `import` ตัวก่อนหน้า แล้ว lookahead `(?!type)` ไปตกที่ import คนละตัว
         (ผลคือแดงทั้งที่ของถูก — เจอตอนรันจริง 2026-08-26) */
      return /^\s*import\s+(?!type\b)[^\n]*from\s+['"][^'"]*notification-data['"]/m.test(code)
    })
    expect(users, 'notification-data ต้องไม่มีผู้ใช้ (ถ้าจะใช้ ต้องถอดออกจาก ALLOWLIST ก่อน)').toEqual([])
  })

  /**
   * บั๊กที่เพิ่งแก้ 2026-08-26 — ปักหมุดพฤติกรรม ไม่ใช่ปักหมุดถ้อยคำ
   *
   * เช็ค 2 อย่างที่ต่างกัน: (1) ข้อความแยกตาม `hidePayments` จริง (2) กิ่งของแอปไม่มีคำสั่งให้จ่าย
   * ถ้าเช็คแค่ข้อ 1 คนแก้อาจสลับสองกิ่งแล้วยังเขียว
   */
  it('[blocker] หน้าตั้งค่า ChatBot: กิ่งของแอปต้องไม่สั่งให้ไปเติมเงิน', () => {
    const rel = `${SELLER}/(dashboard)/settings/chatbot/ChatbotClient.tsx`
    const code = blankComments(read(rel))

    expect(code, 'ต้องอ่านธงจาก context ตัวเดียวกับที่อื่น').toMatch(/useHidePayments\(\)/)

    // เตือน "เงินหมด" ต้องยังอยู่ — ตัดทิ้งคือ AI เงียบโดยไม่มีคำอธิบาย (บั๊กคนละข้อ)
    expect(code, 'ต้องยังบอกสาเหตุว่าเครดิตหมด').toContain('AI ยังไม่ทำงาน')

    // กิ่งที่ใช้ตอนอยู่ในแอป = ฝั่ง true ของเทอร์นารีที่ผูกกับ hidePayments
    const m = /hidePayments\s*\?\s*'([^']+)'\s*:\s*'([^']+)'/.exec(code)
    expect(m, 'ต้องมีทางแยกตาม hidePayments ไม่ใช่ข้อความเดียวใช้ทั้งสองที่').not.toBeNull()
    const [, inApp, onWeb] = m!
    expect(inApp, 'กิ่งในแอปห้ามสั่งให้ไปจ่ายเงิน').not.toMatch(/เติมเงิน|เติมเครดิต/)
    expect(onWeb, 'กิ่งบนเว็บต้องยังบอกทางออกตามเดิม').toMatch(/เติมเงิน/)
  })
})
