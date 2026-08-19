import { readFileSync } from 'node:fs'
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

/** ลบเนื้อคอมเมนต์แต่คงจำนวนบรรทัด — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const blankComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, (m, indent: string) => indent)

const SELLER = 'src/app/(paces)/seller'
const GATE = /hidePayments|shouldHidePayments|isPaymentRestricted/

describe('[blocker] ทางเข้าหน้าจ่ายเงินต้องมีด่าน app-shell ทุกจุด', () => {
  /**
   * ทุก route ที่ "เข้าไปแล้วเจอราคา/ปุ่มซื้อ" ต้องเด้งออกเมื่อเปิดจากในแอป —
   * ซ่อนเมนูอย่างเดียวไม่พอ เพราะพิมพ์ URL ตรงได้ และเมนูที่ลืมซ่อนจะพาเข้ามาเอง
   */
  const GUARDED_ROUTES = [
    `${SELLER}/(dashboard)/subscriptions/page.tsx`,
    `${SELLER}/(dashboard)/business/page.tsx`,
    `${SELLER}/(dashboard)/business/create/page.tsx`,
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

  it('[blocker] payload ของเมนูสลับบัญชีต้องส่ง hidePayments มาด้วย', () => {
    /**
     * เมนูนี้ถูก mount จากกว่า 10 ที่ — prop-drill = ลืมได้ทีละที่โดยไม่มีอะไรฟ้อง
     * payload เป็นแหล่งเดียวที่มันอ่านอยู่แล้ว จึงเป็นที่ที่ลืมไม่ได้
     */
    const api = blankComments(read('src/app/api/business/context/route.ts'))
    expect(api, 'API ต้องคำนวณและส่งธงนี้').toMatch(/hidePayments:\s*await shouldHidePayments\(\)/)
  })
})
