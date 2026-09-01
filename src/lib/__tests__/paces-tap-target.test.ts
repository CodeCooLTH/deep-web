import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** ด่านต้องดู *โค้ด* ไม่ใช่คำอธิบาย — ไฟล์เหล่านี้เล่าเหตุผลไว้ยาวและมีชื่อคลาสในคอมเมนต์ */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const OVERRIDES = 'src/assets/css/safepay-overrides.css'
const FORMS = 'src/assets/css/custom/_forms.css'

/**
 * เป้าที่กดได้ฝั่งผู้ขาย (สกิน Paces) = 44px บนมือถือ
 *
 * 🛑 รูที่ทำให้ทั้งฝั่งผู้ขายไม่เคยถูกวัดเลยสักครั้ง — `DESIGN.md` §Do's ประกาศ
 * "tap target ≥44px" เป็นเกณฑ์ **WCAG ของทั้งระบบ** แต่ตัวบังคับที่มีอยู่ผูกกับธีม MUI
 * ฝั่ง buyer อย่างเดียว และกฎทุกข้อใน `theme-guard.sh` เขียน `if [ "$is_paces" = false ]`
 *
 * วัดจอจริง 390px (2026-09-01 · 40 หน้า · 2 ประเภทร้าน): **223 จุด · 30 จาก 32 หน้า**
 * — เยอะกว่าฝั่ง buyer (122) เกือบเท่าตัว และโค้ดเขียนไว้เองว่า "seller ใช้งาน mobile เป็นหลัก"
 *
 * ไม่ใช่ของหลุด แต่เป็นค่าของธีม: `.btn` 37 · `.btn-icon` 37 · `.btn-sm.btn-icon` 30 ·
 * `.page-link` 30 · `.form-switch` 20 · `.form-radio` 18 ⇒ แก้รายจุดไม่มีวันจบ
 */
describe('[blocker] เป้าที่กดได้ฝั่งผู้ขาย = 44px บนมือถือ', () => {
  it('🛑 พื้นถูกยกที่ธีม — ครบทุก primitive ที่วัดแล้วว่าเตี้ย', () => {
    const css = read(OVERRIDES)
    /* ตรวจ **ชื่อ selector** ไม่ใช่ทั้งบล็อก — ด่านที่ผูกกับรูปประโยคพังตอนจัดรูปแบบใหม่
       (พลาดคลาสนี้มาแล้วหลายครั้ง — ดู service-queue-vertical-gate.test.ts) */
    for (const sel of [
      'button.btn',
      'button.btn.btn-icon',
      '.page-item .page-link',
      'button.badge',
      'input.form-switch',
      'input.form-radio',
      '.apexcharts-legend-series',
    ]) {
      expect(css, `ยังไม่ได้ยกพื้นให้ \`${sel}\``).toContain(sel)
    }
    expect(css, 'ต้องมี media query ของมือถือ').toMatch(/@media \(max-width: 1023\.98px\)/)
  })

  it('🛑 ต้องเป็น 44px และผูกกับเส้น 1024px เท่านั้น — ห้ามดันบนเดสก์ท็อป', () => {
    /* คอนโซลผู้ขายเป็น Operate surface ที่ความหนาแน่นมีค่า · เกณฑ์ 44px มีเหตุผลจาก "นิ้วโป้ง"
       ซึ่งไม่ใช่บริบทของเมาส์ (WCAG 2.5.8 สำหรับเมาส์ = 24px · 37px ผ่านสบาย)
       1024px = เส้นเดียวกับ seller mobile shell ที่ระบบใช้อยู่แล้ว ไม่ใช่เลขใหม่ */
    const css = read(OVERRIDES)
    const block = css.slice(css.indexOf('@media (max-width: 1023.98px)'))
    expect(block).toContain('2.75rem')
    expect(block, 'ห้ามใช้เลขอื่นแทน 44px').not.toMatch(/min-height:\s*(2\.5|3)rem/)
  })

  it('🛑 ต้องเจาะจงชนิด element — `span`/`div` ที่ใช้ .btn เป็นป้ายไอคอนต้องไม่โดนยืด', () => {
    /* `<span class="btn btn-icon bg-light size-6!">` เป็นแพตเทิร์นของแถวข้อมูลในการ์ด
       (CustomerDetails · AppointmentCard · AuctionInfoCard · ShippingAddress · OrderReviewCard)
       เขียนกฎเป็น `.btn { min-height }` เฉย ๆ = ป้ายพวกนั้นสูง 44px แล้วการ์ดพัง */
    const block = read(OVERRIDES).slice(read(OVERRIDES).indexOf('@media (max-width: 1023.98px)'))
    const lines = stripComments(block)
      .split('\n')
      .filter((l) => /^\s*\.btn[,{ ]|^\s*\.btn\.btn-icon/.test(l))
    expect(lines, `กฎที่ไม่เจาะจง element:\n${lines.join('\n')}`).toEqual([])
  })

  it('🛑 กติกาเดียวกับ `.form-input` — ห้ามให้สองที่ตอบไม่ตรงกัน (HR16)', () => {
    /* `.form-input` ใช้ `h-11 lg:h-9.25` มาก่อนตั้งแต่ impeccable audit P2-3
       บล็อกใหม่ต้องอ้างอิงกันไป-มา ไม่งั้นวันที่ใครเปลี่ยนเส้น 1024px จะแก้ที่เดียว */
    expect(read(FORMS), '`_forms.css` ต้องชี้ไปที่บล็อกใหม่').toContain('safepay-overrides.css')
    expect(read(FORMS)).toMatch(/h-11 lg:h-9\.25/)
  })

  it('🛑 กฎต้องอยู่ใน media query เท่านั้น — ห้ามรั่วไปดันเดสก์ท็อป', () => {
    /* 🛑 เดิมด่านนี้เขียนว่า "ทุก `min-h-11` ในหน้าผู้ขายต้องมี `lg:` คู่" แล้วแดงทันที
       เพราะงานก่อนหน้า **จงใจ** เลือก 44px ทุกจอในบางจุด (เช่น `RescheduleAppointmentSheet`
       ที่เขียนเหตุผลกำกับไว้เอง) — 44px บนเดสก์ท็อปไม่ใช่บั๊ก แค่หนาแน่นน้อยกว่าที่ตั้งใจ
       ด่านที่บังคับรสนิยมจะถูกปิดทิ้ง ⇒ ตรวจเฉพาะสิ่งที่ **ผิดจริง**: กฎระดับธีมรั่วออกนอก
       media query เมื่อไหร่ = ดันทั้งระบบรวมถึงเดสก์ท็อป ซึ่งขัดเจตนาที่เขียนไว้ในบล็อกเอง */
    /* 🛑 สแกนเฉพาะ **บล็อกของกฎนี้** ไม่ใช่ทั้งไฟล์ — ร่างแรกสแกนทั้งไฟล์แล้วแดงทันที
       เพราะ `.choices__inner` ใช้ท่า **mobile-first** (ตั้ง 44px เป็นฐาน แล้ว override เป็น 37px
       ที่ `@media (min-width:1024px)`) ซึ่ง *ถูกต้องเหมือนกัน* แค่คนละรูปประโยค
       ⇒ ด่านที่ไม่รู้ขอบเขตของตัวเอง จะไปตัดสินของที่ไม่ได้อยู่ในความรับผิดชอบ */
    const css = read(OVERRIDES)
    const head = css.indexOf('เป้าที่กดได้ = 44px บนมือถือ')
    expect(head, 'ไม่เจอหัวข้อของกฎนี้').toBeGreaterThan(-1)
    const at = css.indexOf('@media (max-width: 1023.98px)', head)
    expect(at, 'ไม่เจอ media query ของกฎนี้').toBeGreaterThan(-1)
    /* ระหว่างหัวข้อกับ media query ต้องมีแต่คอมเมนต์ — มีกฎโผล่เมื่อไหร่ = รั่วไปดันเดสก์ท็อป */
    const between = css.slice(head, at).split('*/').pop() ?? ''
    expect(between.trim(), `มีกฎอยู่นอก media query:\n${between}`).toBe('')
  })
})
