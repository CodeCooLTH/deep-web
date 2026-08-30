import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] รางสถานะบน `/o/[token]` — สถานะต้องอ่านออกโดยไม่ต้องพึ่งสี
 *
 * รางนี้คือสิ่งเดียวบนหน้าที่ตอบว่า "ตอนนี้ถึงไหนแล้ว" และมันสื่อด้วย **สีกับรูปร่างของจุด**
 * ล้วน ๆ ⇒ ผู้ใช้ screen reader ได้ยินแค่รายชื่อขั้นเรียงกัน ไม่รู้เลยว่าอยู่ขั้นไหน
 *
 * 🛑 แดง = ห้าม merge
 */
const DIR = 'src/app/(marketing)/o/[token]'

const strip = (raw: string) =>
  raw
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

const src = strip(readFileSync(join(process.cwd(), DIR, 'OrderDetailMobile.tsx'), 'utf8'))
const pill = strip(readFileSync(join(process.cwd(), DIR, 'TrustPill.tsx'), 'utf8'))

describe('[blocker] a11y ของรางสถานะ', () => {
  it('รางต้องประกาศตัวเป็นรายการ และแต่ละขั้นเป็นสมาชิกของรายการ', () => {
    /* `<div>` เปล่าไม่รองรับชื่อจากผู้เขียน (`aria-name-requires-supporting-role.md`)
       — `list`/`listitem` รองรับ จึงเป็น role ที่ทำให้ข้อความสถานะมีผลจริง */
    expect(src, "ราง = role='list'").toMatch(/role='list'/)
    expect(src, "ขั้น = role='listitem'").toMatch(/role='listitem'/)
  })

  it("ขั้นปัจจุบันต้องมี aria-current='step' — และมีได้ขั้นเดียว", () => {
    /* ไม่มีตัวนี้ = screen reader อ่านครบทุกขั้นแต่ไม่มีอะไรบอกว่าอันไหนคือ "ตอนนี้" */
    const at = src.indexOf('aria-current=')
    expect(at, 'ต้องมี aria-current').toBeGreaterThan(-1)
    expect(src.slice(at, at + 90), 'ต้องผูกกับสถานะ cur เท่านั้น').toMatch(/state === 'cur' \? 'step' : undefined/)
  })

  it('ทุกสถานะต้องมีข้อความกำกับ — และบังคับด้วย type ไม่ใช่ความจำ', () => {
    /* 🛑 `Record<TimelineState, string>` ทำให้ tsc ฟ้องเมื่อเพิ่มสถานะใหม่แล้วลืมเขียนคำ
       ถ้าปล่อยเป็น `Partial`/object ธรรมดา สถานะใหม่จะเงียบ (อ่านออกมาเป็น undefined) */
    expect(src, 'ต้องเป็น Record ที่ครบทุกค่า').toMatch(
      /const STEP_STATE_SR_TEXT: Record<TimelineState, string>/,
    )
    for (const state of ['done', 'cur', 'fin', 'cx', 'mute', 'up']) {
      expect(src, `ต้องมีคำของสถานะ ${state}`).toMatch(new RegExp(`\\b${state}:\\s*'[^']+'`))
    }
    expect(src, 'ต้องถูกเรนเดอร์จริง ไม่ใช่ประกาศทิ้งไว้').toMatch(/STEP_STATE_SR_TEXT\[step\.state\]/)
  })

  it('ข้อความสถานะต้องซ่อนด้วยการ clip ไม่ใช่ display:none', () => {
    /* `display:none` ถูก screen reader ข้ามทั้งก้อน ⇒ ใส่แล้วเท่ากับไม่ได้ใส่ */
    const at = src.indexOf('STEP_STATE_SR_TEXT[step.state]')
    const block = src.slice(Math.max(0, at - 400), at)
    expect(block, 'ต้องใช้ clip').toMatch(/clip: 'rect\(0 0 0 0\)'/)
    expect(block, "ห้าม display:'none'").not.toMatch(/display: 'none'/)
  })

  it("ขั้นที่ถูกข้าม (mute) ต้องต่างจากขั้นที่ยังไม่ถึง (up) ด้วย **รูปร่าง** ไม่ใช่ความจางอย่างเดียว", () => {
    /* WCAG 1.4.1 — สองสถานะที่ความหมายต่างกันสิ้นเชิง ("จะไม่เกิดขึ้นแล้ว" vs "กำลังจะถึง")
       ห้ามแยกด้วยสี/ความจางอย่างเดียว */
    expect(src, 'mute ต้องเป็นเส้นประ').toMatch(/borderStyle: state === 'mute' \? 'dashed' : 'solid'/)
  })

  it('จังหวะเต้นของขั้นปัจจุบันต้องหยุดเมื่อผู้ใช้ขอลดการเคลื่อนไหว', () => {
    /* `DESIGN.md` ปฏิเสธ "อนิเมชั่นเร่งเร้า" และคนที่ตั้งค่านี้มักตั้งเพราะการเคลื่อนไหว
       ทำให้เวียนหัวจริง — วงกระเพื่อมไม่มีข้อมูลอยู่ในนั้น ปิดได้โดยไม่เสียอะไร */
    const at = src.indexOf('deepStepPulse')
    expect(at, 'ต้องมีวงกระเพื่อม').toBeGreaterThan(-1)
    const before = src.slice(Math.max(0, at - 900), at)
    expect(before, 'ต้องอยู่ใต้ prefers-reduced-motion: no-preference').toMatch(
      /'@media \(prefers-reduced-motion: no-preference\)'/,
    )
  })
})

describe('[blocker] รางที่จบแล้วต้องเป็นเขียวทั้งเส้น', () => {
  /**
   * 🛑 หัวหน้าเห็นบนจอจริงแล้วบอกว่า "ถ้าเสร็จแล้วสีเขียวสิ กลัวคนสับสน" (2026-08-29)
   *
   * ออเดอร์ที่ปิดงานแล้วเคยขึ้น **ม่วง-ม่วง-เขียว** — สองสีบนรางเดียวอ่านได้ว่า
   * ขั้นแรก ๆ เป็นคนละเรื่องกับขั้นสุดท้าย ทั้งที่ทุกขั้นสำเร็จเหมือนกันหมด
   *
   * ม่วงยังถูกต้อง **ระหว่างทาง** — ตรงกับ Verified-Means-Green:
   * เขียว = "ยืนยันแล้ว" จึงทาได้ก็ต่อเมื่อออเดอร์ถูกยืนยันปิดงานจริง
   */
  it('รางต้องรู้ตัวว่าจบแล้ว โดย derive จากขั้น ไม่ใช่รับมาจากผู้เรียก', () => {
    /* ถ้ารับเป็น prop ผู้เรียกอาจส่งไม่ตรงกับรางที่ตัวเองส่งมา แล้วสีจะไปคนละทางกับจุด */
    expect(src, 'ต้อง derive จาก state ของขั้น').toMatch(
      /const completed = steps\.some\(s => s\.state === 'fin'\)/,
    )
  })

  it('จุดที่ผ่านแล้วต้องเป็นเขียวเมื่อรางจบ และม่วงเมื่อยังไม่จบ', () => {
    const fn = src.slice(src.indexOf('function TimelineDot'), src.indexOf('function connectorColor'))
    expect(fn, 'พื้นจุดต้องผันตาม completed').toMatch(/bgcolor: completed \? VERIFIED_INK : 'primary\.main'/)
    expect(fn, 'วงแหวนต้องผันตามด้วย ไม่งั้นจุดเขียวจะมีวงม่วง').toMatch(
      /ring: completed[\s\S]{0,140}success-lightOpacity[\s\S]{0,80}primary-lightOpacity/,
    )
  })

  it('เส้นเชื่อมต้องผันตาม completed ด้วย — ไม่งั้นจุดเขียวแต่เส้นม่วง', () => {
    expect(src, 'connectorColor ต้องรับ completed').toMatch(
      /function connectorColor\(state: TimelineState, completed = false\)/,
    )
    expect(src, "กิ่ง done ต้องผันตาม completed").toMatch(
      /state === 'done'\) return completed \? 'var\(--mui-palette-success-main\)'/,
    )
  })

  it('ทั้งจุดและเส้นต้องได้รับ completed จริง — ไม่ใช่คำนวณแล้วไม่ส่ง', () => {
    /* `rule-must-be-enforced-not-described.md` — ตัวแปรที่ถูกต้องแต่ไม่มีใครใช้
       เกิดมาแล้วหลายครั้งในงานนี้ */
    expect(src, 'เส้นต้องรับ completed').toMatch(/connectorColor\(step\.state, completed\)/)
    expect(src, 'จุดต้องรับ completed').toMatch(/<TimelineDot[^>]*completed=\{completed\}/)
  })
})

describe('[blocker] ชนิดของ status ต้องไม่ถูกย่อกลับ', () => {
  it('PublicOrderData.status ต้องเป็น OrderStatus จาก SSOT — ห้ามพิมพ์รายชื่อค่าเอง', () => {
    /* 🛑 ของเดิมเขียน 4 ค่าไว้ที่นี่ ขณะที่ SSOT มี 5 แล้ว `page.tsx` แปลงด้วย
       `order.status as PublicOrderData['status']` — คอลัมน์ในฐานเป็น `String` ไม่มี enum กั้น
       ⇒ `'RETURNED'` มาถึงได้จริงแต่ TypeScript ถูกปิดตา

       ผูกกับ **ชนิด** ไม่ใช่กับรายชื่อค่า เพราะรายชื่อจะล้าสมัยอีกครั้งแน่นอน
       — นั่นคือรูปแบบของบั๊กนี้ตั้งแต่แรก */
    expect(src, 'ต้องอ้าง type จาก SSOT').toMatch(/^\s*status: OrderStatus$/m)
    expect(src, 'ห้ามพิมพ์รายชื่อสถานะซ้ำในไฟล์นี้').not.toMatch(
      /status: 'PENDING' \| 'SHIPPED' \| 'CONFIRMED' \| 'CANCELLED'/,
    )
    expect(src, 'ต้อง import ชนิดมาจริง').toMatch(/import type \{[^}]*OrderStatus[^}]*\} from '@\/lib\/order-display'/)
  })
})

describe('[blocker] TrustPill — สีที่ไม่มีอยู่จริงต้องไม่หลุดลง CSS', () => {
  it("tierColor ที่ไม่มี .dark ต้องถอยไปหมึกหลัก ไม่ใช่ต่อสตริงมั่ว", () => {
    /* 🛑 `getTierColor()` คืน `'default'` ให้ร้าน tier B (Deep Silver) ซึ่งเป็นค่าของ `Chip`
       **ไม่ใช่คีย์ใน palette** ⇒ `'default.dark'` ไม่มีอยู่จริง MUI ปล่อยผ่านลง CSS
       เบราว์เซอร์ทิ้งทั้งบรรทัด ป้ายจึงสืบสีจากพ่อ **โดยไม่มี error และหน้าตายังดูใช้ได้**
       เป็นบั๊กที่รอดทุกด่านเพราะไม่มีอะไรผิดรูปแบบเลย */
    expect(pill, 'ต้องมีรายชื่อสีที่มี .dark จริง').toMatch(/TIER_HAS_DARK/)
    expect(pill, "ต้องถอยไป text.primary เมื่อไม่มี .dark").toMatch(
      /TIER_HAS_DARK\.includes\(tierColor\)\s*\?\s*`\$\{tierColor\}\.dark`\s*:\s*'text\.primary'/,
    )
    expect(pill, 'ห้ามต่อ .dark ตรง ๆ อีก').not.toMatch(/tierColor \? `\$\{tierColor\}\.dark`/)
  })

  it("รายชื่อต้องไม่มี 'default' — นั่นคือค่าที่ทำให้เกิดบั๊ก", () => {
    const at = pill.indexOf('TIER_HAS_DARK')
    expect(pill.slice(at, at + 200)).not.toMatch(/'default'/)
  })
})

/**
 * [blocker] คำเรียกสถานะการชำระเงิน — ข้อเท็จจริงเดียว คำเดียว (Hard Rule 16)
 *
 * ป้ายสถานะบนสุดของร้านบริการ derive จาก **เงินก้อนเดียวกัน** กับป้ายบนการ์ดเงิน
 * ⇒ ทั้งสองพูดถึงเรื่องเดียวกันเสมอ และเคยพูดคนละคำ
 */
describe('[blocker] คำเรียกสถานะเงินต้องมาจาก SSOT เดียว', () => {
  const money = strip(readFileSync(join(process.cwd(), DIR, 'PaymentSummaryCard.tsx'), 'utf8'))
  const lib = strip(readFileSync(join(process.cwd(), 'src/lib/order-display.ts'), 'utf8'))

  it('การ์ดเงินต้องอ้าง PAYMENT_STATE_LABEL ไม่ใช่พิมพ์คำเอง', () => {
    expect(money, 'ต้องใช้ SSOT').toMatch(/PAYMENT_STATE_LABEL\.paid/)
    expect(money, 'ต้องใช้ SSOT').toMatch(/PAYMENT_STATE_LABEL\.outstanding/)
    for (const w of ['ชำระครบแล้ว', 'ยังค้างชำระ']) {
      expect(money, `ห้ามพิมพ์ "${w}" เอง — เป็นคำที่เคยขัดกับป้ายบนสุด`).not.toContain(w)
    }
  })

  it('ป้ายสถานะบนสุดต้องอ้าง SSOT ตัวเดียวกัน', () => {
    const fn = lib.slice(lib.indexOf('export function resolveServiceOrderBadge'))
    expect(fn, 'กิ่งจ่ายครบต้องใช้ SSOT').toMatch(/label: PAYMENT_STATE_LABEL\.paid/)
    expect(fn, 'กิ่งยังค้างต้องใช้ SSOT').toMatch(/label: PAYMENT_STATE_LABEL\.outstanding/)
  })

  it('SSOT ต้องไม่มีคำของ "การนัด" ปนมา — คนละคำถามกับเงิน', () => {
    const at = lib.indexOf('export const PAYMENT_STATE_LABEL')
    const block = lib.slice(at, lib.indexOf('} as const;', at))
    expect(block, '"จอง" เป็นสถานะของการนัด ไม่ใช่ของเงิน').not.toContain('จอง')
  })
})

/**
 * [blocker] น้ำหนักปุ่มปิดงาน + คอนทราสต์ของข้อความจาง
 */
describe('[blocker] ปุ่มที่ย้อนไม่ได้ ต้องไม่เด่นที่สุดตอนที่ยังไม่ควรกด', () => {
  const lib = strip(readFileSync(join(process.cwd(), 'src/lib/order-display.ts'), 'utf8'))

  it('ความเด่นของปุ่มต้องผูกกับรางที่เรนเดอร์อยู่จริง', () => {
    expect(lib, 'ต้องมีตัวตัดสินเป็นฟังก์ชันบริสุทธิ์').toMatch(
      /export function isFinalStepReady\(steps: TimelineStep\[\]\): boolean/,
    )
    expect(src, 'หน้าจอต้องเรียกจริง').toMatch(/isFinalStepReady\(timeline\)/)
    expect(src, 'variant ต้องผันตาม').toMatch(/variant=\{ctaReady \? 'contained' : 'tonal'\}/)
  })

  it('🛑 ต้อง "ลดน้ำหนัก" ไม่ใช่ "ปิดปุ่ม"', () => {
    /* รางอิงเวลานัด + สถานะที่ร้านกด — ร้านที่ลืมกดปิดผลนัดจะทำให้ลูกค้าที่ได้รับบริการ
       จริงแล้วกดปิดงานไม่ได้เลย (กติกาเดียวกับ BR-RSV-18: เตือนได้ แต่ห้ามบล็อก) */
    const at = src.indexOf("variant={ctaReady ? 'contained' : 'tonal'}")
    expect(at).toBeGreaterThan(-1)
    expect(src.slice(at, at + 320), 'ห้าม disable ปุ่มด้วย ctaReady').not.toMatch(/disabled=\{[^}]*ctaReady/)
  })

  it('ร้านที่ไม่ใช่ร้านบริการต้องได้พฤติกรรมเดิมทุกประการ', () => {
    expect(src, 'ต้องลัดวงจรด้วย !isServiceShop').toMatch(
      /const ctaReady = !order\.isServiceShop \|\| isFinalStepReady\(timeline\)/,
    )
  })
})

describe('[blocker] ข้อความจางต้องอ่านออก', () => {
  const files = ['OrderDetailMobile.tsx', 'PaymentSummaryCard.tsx', 'ReviewForm.tsx', 'PhoneVerifyPrompt.tsx']

  it("ห้ามใช้ color='text.disabled' กับข้อความ — 2.30:1 ตก AA", () => {
    /* 🛑 `text.disabled` = หมึกที่ opacity 0.4 → 2.30:1 บนพื้นขาว ต่ำกว่าเกณฑ์ 4.5:1 เกือบเท่าตัว
       `text.secondary` = 5.22:1 ผ่าน AA และยังจางกว่าหมึกหลักอยู่ดี ⇒ ได้ลำดับชั้นเหมือนเดิม
       (`contrast-fix-keeps-hue.md`: แก้ได้แค่ *ความเข้ม* ของสีเดิม ห้ามสลับเฉด — นี่คือหมึกตัวเดียวกัน)

       ไอคอนตกแต่งที่มีข้อความกำกับอยู่แล้วไม่อยู่ใต้กฎนี้ (WCAG 1.4.11 ยกเว้น) จึงตรวจเฉพาะ
       รูปแบบที่เป็น "สีของข้อความ" ตรง ๆ */
    for (const f of files) {
      const code = strip(readFileSync(join(process.cwd(), DIR, f), 'utf8'))
      expect(code, `${f} ห้ามมี color='text.disabled'`).not.toMatch(/color='text\.disabled'/)
    }
  })
})
