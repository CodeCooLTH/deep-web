import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] พื้นที่แตะ 44px — `PRODUCT.md` ประกาศเป็น baseline ของทั้งระบบ
 *
 * 🛑 วัดด้วยเบราว์เซอร์จริง 2026-08-30 (12 ความกว้าง × 3 แบบออเดอร์) เจอปุ่ม **8 ตัว**
 * ที่ต่ำกว่าเกณฑ์ **ทุกความกว้าง** — ไม่ใช่แค่มือถือ:
 *   ติดต่อร้านค้า 38 · แจ้งปัญหา 30 · เลือกรูปสลิป 38 · ยกเลิกคำสั่งซื้อ 38
 *   ลิงก์ท้ายหน้า 4 ตัว **22px** (ครึ่งเดียวของเกณฑ์)
 *
 * ที่หนักสุดคือลิงก์ท้ายหน้า เพราะมี **"แจ้งมิจฉาชีพ"** อยู่ด้วย — ทางออกฉุกเฉิน
 * ของคนที่กำลังโดนโกง · ทางออกที่กดยากคือทางออกที่ไม่มีอยู่จริง
 *
 * ไฟล์นี้สแกน **ซอร์ส** (รีโปไม่มี jsdom) — เทียบกับการวัดจริงที่ทำไปแล้ว
 *
 * 🛑 แดง = ห้าม merge
 */
const strip = (raw: string) =>
  raw
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

const page = strip(
  readFileSync(join(process.cwd(), 'src/app/(marketing)/o/[token]/OrderDetailMobile.tsx'), 'utf8'),
)
const footer = strip(
  readFileSync(join(process.cwd(), 'src/views/pages/user-profile/v2/PublicProfileFooter.tsx'), 'utf8'),
)

/** ปุ่มที่เคยวัดได้ต่ำกว่าเกณฑ์ — แต่ละตัวต้องมี `minHeight: 44` ในบล็อกของตัวเอง */
/**
 * 🛑 "ติดต่อร้านค้า" กับ "แจ้งปัญหาคำสั่งซื้อ" **ไม่ใช่ `<Button>` แล้ว** — การ์ดช่วยเหลือ
 * เปลี่ยนเป็นแถวแบบ `/dashboard` (`HelpActionRow`) ตั้งแต่ 2026-08-30 ⇒ ย้ายไปตรวจที่
 * คอมโพเนนต์นั้นแทน (ข้อถัดไป) · ลิสต์นี้เหลือเฉพาะปุ่มที่ยังเป็น `<Button>` จริง
 */
const BUTTONS = ['เลือกรูปสลิป']

describe('[blocker] ทุกปุ่มบนหน้าออเดอร์ต้องมีพื้นที่แตะ 44px', () => {
  it.each(BUTTONS)('%s', (label) => {
    const at = page.indexOf(label)
    expect(at, `ต้องมีปุ่ม "${label}"`).toBeGreaterThan(-1)
    /* 🛑 หา `<Button` ที่ใกล้ที่สุดก่อนข้อความ — ห้ามใช้หน้าต่างความยาวคงที่
       (ไฟล์นี้แทนคอมเมนต์ด้วยช่องว่างยาวเท่าเดิม · พลาดมาแล้ว 7 ครั้งในงานนี้) */
    const btn = page.lastIndexOf('<Button', at)
    expect(btn, `ต้องเป็น <Button`).toBeGreaterThan(-1)
    expect(page.slice(btn, at), `"${label}" ต้องมี minHeight: 44`).toMatch(/minHeight: 44/)
  })

  it('🛑 แถวการกระทำในการ์ดช่วยเหลือ — ทั้งแถวต้องเป็นพื้นที่แตะ', () => {
    /* แถวแบบ `/dashboard` กินพื้นที่มากกว่าปุ่ม จึงต้องกดได้ทั้งแถว ไม่ใช่แค่ตัวอักษร
       56 > 44 โดยตั้งใจ — เป็นแถวที่มีสองบรรทัด (ชื่อ + คำอธิบาย) */
    const at = page.indexOf('function HelpActionRow')
    expect(at, 'ต้องมีคอมโพเนนต์แถวการกระทำ').toBeGreaterThan(-1)
    const close = page.indexOf('</Box>', at)
    expect(page.slice(at, close), 'ต้องมี minHeight ≥ 44').toMatch(/minHeight: (4[4-9]|[5-9]\d)/)
    /* และต้องมีผู้เรียกจริง — คอมโพเนนต์ที่ถูกต้องแต่ไม่มีใครเรียกคือของที่ไม่มีอยู่
       (`rule-must-be-enforced-not-described.md`) */
    expect(page, 'ต้องถูกใช้กับปุ่มติดต่อร้าน').toMatch(/<HelpActionRow[\s\S]{0,400}ติดต่อร้านค้า/)
    expect(page, 'ต้องถูกใช้กับปุ่มแจ้งปัญหา').toMatch(/<HelpActionRow[\s\S]{0,400}แจ้งปัญหาคำสั่งซื้อ/)
  })

  it('ปุ่มยืนยัน (CTA) — ปุ่มที่กดแล้วย้อนไม่ได้ ต้องไม่เล็กกว่าปุ่มที่ย้อนได้', () => {
    /* 🛑 หาปุ่มนี้ด้วยข้อความไม่ได้ 2 ชั้น: คำบนปุ่มมาจากตัวแปร `ctaLabel` (ผันตาม vertical)
       และ `{ctaLabel}` เองก็โผล่ **ก่อนหน้า** ในกล่องคำอธิบายที่ไม่ใช่ปุ่ม
       ⇒ ยึด `onClick` ซึ่งเป็นสิ่งที่ทำให้มันเป็นปุ่ม CTA จริง ๆ ไม่ใช่คำที่มันแสดง */
    const at = page.indexOf('onClick={() => setConfirmDialogOpen(true)}')
    expect(at, 'ต้องมีปุ่ม CTA').toBeGreaterThan(-1)
    const btn = page.lastIndexOf('<Button', at)
    expect(btn).toBeGreaterThan(-1)
    /* 🛑 ห้ามปิดช่วงด้วย `indexOf('>', at)` — `>` ตัวแรกหลัง onClick คือลูกศรของ `() =>`
       ไม่ใช่จุดปิดแท็ก (แดงมาแล้วด้วยเหตุนี้) · ปิดที่ `{ctaLabel}` ซึ่งเป็นลูกของปุ่ม */
    const close = page.lastIndexOf('{ctaLabel}')
    expect(close).toBeGreaterThan(btn)
    expect(page.slice(btn, close), 'CTA ต้องมี minHeight: 44').toMatch(/minHeight: 44/)
  })

  it('ปุ่มยกเลิกคำสั่งซื้อ — กดพลาดยังถอยได้ แต่ "กดไม่โดน" ก็เป็นปัญหา', () => {
    const at = page.indexOf('setCancelDialogOpen(true)')
    expect(at).toBeGreaterThan(-1)
    const btn = page.lastIndexOf('<Button', at)
    expect(btn).toBeGreaterThan(-1)
    /**
     * 🛑 ห้ามปิดช่วงด้วย `indexOf('>', at)` — `>` ตัวแรกหลัง `onClick` ไม่ใช่จุดปิดแท็กเสมอ
     * (พอปุ่มมี `endIcon={<Icon … />}` มันไปเจอ `/>` ของไอคอนก่อน)
     *
     * 🛑 และห้ามปิดที่ **ข้อความบนปุ่ม** ด้วย — พอปุ่มได้ `aria-label='ยกเลิกคำสั่งซื้อ'`
     * (ตอนย้ายไปแถบล่างแล้วมือถือเหลือแต่ไอคอน) คำเดียวกันโผล่ *ก่อน* `sx` ⇒ ตัดก่อนถึง
     * `minHeight` แล้วแดงทั้งที่ของยังอยู่ครบ
     *
     * ปิดที่ `</Button>` ซึ่งเป็นจุดจบของอิลิเมนต์จริง — ทนต่อทุก prop และทุกลูกที่เพิ่มมา
     */
    const close = page.indexOf('</Button>', at)
    expect(close, 'ต้องเจอจุดปิดปุ่ม').toBeGreaterThan(btn)
    expect(page.slice(btn, close), 'ต้องมี minHeight: 44').toMatch(/minHeight: 44/)
  })

  it('ลิงก์ท้ายหน้า (ใช้ร่วม 4 หน้าสาธารณะ) ต้องมีพื้นที่แตะ 44px', () => {
    /* ขยาย **พื้นที่แตะ** โดยไม่ขยายตัวอักษร — footer ต้องยังเบาเหมือนเดิม */
    expect(footer, 'ต้องมี minHeight: 44').toMatch(/minHeight: 44/)
    expect(footer, 'ต้องเป็น inline-flex + จัดกึ่งกลาง ไม่งั้นตัวอักษรลอยบนสุด').toMatch(
      /display: 'inline-flex'[\s\S]{0,80}alignItems: 'center'/,
    )
  })
})
