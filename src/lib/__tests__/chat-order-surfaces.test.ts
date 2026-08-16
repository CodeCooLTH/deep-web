import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * ด่าน parity ของ "แถวปุ่มบนการ์ดงานบริการในแชท" (feature 00050)
 *
 * ปุ่มชุดเดียวกันโผล่ **2 จอ** ที่ไม่เคยเห็นหน้ากัน:
 *   · `OrderProgressBar` — มือถือ/แท็บเล็ต (<1280px)
 *   · `CustomerPanel`    — แผงขวาเดสก์ท็อป (≥1280px)
 *
 * 🛑 ทั้งคู่ถูก **render คนละ breakpoint** ⇒ คนทดสอบบนจอเดียวจะไม่มีวันเห็นอีกจอเลย
 * ถ้าจอหนึ่งเขียนเงื่อนไข `money.outstanding > 0` ของตัวเอง วันหนึ่งปุ่มจะโผล่บนมือถือ
 * แต่หายบนเดสก์ท็อป โดยไม่มี `tsc`/build/theme-guard ตัวไหนฟ้อง — เพราะทุกเงื่อนไข "ถูก"
 * ในตัวเอง (`sibling-surface-parity.md` + `ui-boolean-needs-a-testable-home.md`)
 *
 * ด่านนี้ตรวจว่า **ทั้งสองจอถามคำถามเดียวกันกับ symbol เดียวกัน** ไม่ได้ตรวจว่าหน้าตาเหมือนกัน
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const SURFACES = [
  {
    name: 'แถบสถานะในแชท (มือถือ)',
    path: 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/OrderProgressBar.tsx',
  },
  {
    name: 'แผงลูกค้าด้านขวา (เดสก์ท็อป)',
    path: 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanel.tsx',
  },
] as const

/**
 * ตัดคอมเมนต์ก่อนสแกน — ไฟล์ที่ **ทำถูก** คือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย
 * (บทเรียนซ้ำจาก HR9 grep gate 2026-08-02→03 และด่าน component-in-render 2026-08-12)
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('ปุ่มบนการ์ดงานบริการในแชท ต้องมาจากแหล่งเดียวกันทั้งสองจอ', () => {
  for (const s of SURFACES) {
    const code = stripComments(read(s.path))

    it(`[blocker] ${s.name} — ต้องเรียก chatOrderActions() ไม่ใช่ตัดสินเอง`, () => {
      expect(code, 'ต้องเรียกตัวตัดสินกลาง').toContain('chatOrderActions(')
    })

    it(`[blocker] ${s.name} — ต้องคำนวณเงินด้วย computeOrderMoneyFromSerialized()`, () => {
      /**
       * ตัวแปลงตัวเดียวคือที่ที่ `voidedAt` ถูกตัดออก — จอที่แปลงเองจะนับเงินที่ยกเลิกแล้ว
       * เป็นเงินที่รับจริงโดยไม่มีอะไรฟ้อง (ทุกบรรทัดถูกตามชนิด)
       */
      expect(code).toContain('computeOrderMoneyFromSerialized(')
    })

    it(`[blocker] ${s.name} — ห้ามเขียนเงื่อนไขเรื่องเงินเอง`, () => {
      /**
       * แพตเทิร์นที่ห้าม = การ **ตัดสินใจ** จากตัวเลขเงินนอกไลบรารี
       * (การ *แสดงผล* เช่น `money.fullyPaid ? สีเขียว : สีเหลือง` ยังทำได้ ไม่อยู่ในรายการนี้)
       */
      for (const banned of [
        /outstanding\s*[><]/,
        /depositReceived\s*[=!><]/,
        /depositAgreed\s*[><]/,
        /totalReceived\s*[><]/,
        /appointmentStatus\s*===\s*'COMPLETED'/,
        /appointmentStatus\s*===\s*'NO_SHOW'/,
      ]) {
        expect(code, `ห้ามตัดสินเองด้วย ${banned} — ย้ายไป chat-order-actions.ts`).not.toMatch(
          banned,
        )
      }
    })

    it(`[blocker] ${s.name} — ต้องแมป action ด้วย Record เพื่อให้ tsc บังคับความครบ`, () => {
      /**
       * `Record<typeof a.key, () => void>` ทำให้การเพิ่มปุ่มใหม่ในไลบรารีแล้วลืมต่อสายที่จอนี้
       * กลายเป็น `tsc` แดง แทนที่จะเป็นปุ่มที่หายไปเงียบ ๆ จากจอเดียว
       * — `switch` ที่มี `default` หรือ `if/else` ยาว ๆ ให้ผลตรงกันข้าม
       */
      expect(code, 'ต้องแมปด้วย Record ไม่ใช่ if/else').toMatch(
        /Record<\s*typeof\s+\w+\.key\s*,/,
      )
    })

    it(`[blocker] ${s.name} — ต้องส่ง shopId ของเธรดเข้าไป ไม่พึ่ง activeShopId`, () => {
      /**
       * เธรดของร้าน B เปิดได้ขณะ active อยู่ร้าน A (BR-UNI-07) — จอที่ไม่ส่ง `shopId`
       * จะได้ปุ่มที่กดกี่ครั้งก็ไม่ผ่าน (บทเรียน iShip retry 2026-08-06)
       */
      expect(code, 'ต้องส่ง shopId ให้ชีตรับเงิน').toMatch(/shopId=\{shopId\}/)
      expect(code, 'ต้องส่ง shopId ให้ตัวปิดผลนัด').toMatch(/markServedFlow\([\s\S]{0,200}shopId/)
    })
  }

  it('[blocker] ทั้งสองจอต้อง mount ชีตครบทุกตัวที่ปุ่มของมันเปิด', () => {
    /**
     * 🛑 `Record<typeof a.key, …>` บังคับให้ **มี handler** ครบ แต่ไม่ได้บังคับว่า handler นั้น
     * เปิดอะไรได้จริง — จอที่ตั้ง state แล้วลืม render ชีต จะได้ปุ่มที่กดแล้ว "ไม่มีอะไรเกิดขึ้น"
     * ซึ่งเงียบกว่าปุ่มที่พังด้วยซ้ำ (ไม่มี error ไม่มี toast ไม่มีอะไรให้ผู้ใช้รายงาน)
     */
    for (const s of SURFACES) {
      const code = stripComments(read(s.path))
      for (const sheet of ['RecordPaymentSheet', 'StartWalkInSheet', 'AppointmentSummarySheet']) {
        /**
         * 🛑 ต้องเป็น regex ที่มี `\b` **ห้าม `toContain`** — `toContain('<StartWalkInSheet')`
         * ผ่านกับ `<StartWalkInSheetX` ด้วย (substring) ⇒ ด่านที่พิสูจน์ด้วย mutation แล้วเขียว
         * ทั้งที่ชีตหายไปจากจอจริง คลาสเดียวกับด่านนับหัวใน service-queue-isolation
         */
        expect(code, `${s.name}: ต้อง render <${sheet}`).toMatch(new RegExp(`<${sheet}\\b`))
      }
    }
  })

  it('[blocker] ชีต walk-in ต้องคิดเวลาด้วย walkInWindow ตอนกด ไม่ประกอบเอง', () => {
    /**
     * BR-SQ-21 — เวลาเริ่มต้องเป็น "เวลาที่กด" และต้องปัดวินาทีทิ้ง
     * ถ้าประกอบ `new Date()` เองในตัวส่ง จะได้ 13:04:37.812 ซึ่งทำให้งานสองใบที่ดูต่อกันพอดี
     * ไม่ต่อกันจริงในสายตาของ EXCLUDE constraint · และถ้าคิดตอน "เปิดชีต" แทน "ตอนกด"
     * เวลาที่บันทึกจะเป็นเวลาที่เปิดจอ ไม่ใช่เวลาที่เริ่มงานจริง
     */
    const code = stripComments(read('src/app/(paces)/seller/(chat)/_components/StartWalkInSheet.tsx'))
    expect(code, 'ต้องเรียก walkInWindow').toContain('walkInWindow(')
    expect(code, 'ต้องคิดเวลาตอนกด (new Date() ในตัวส่ง)').toMatch(
      /handleStart[\s\S]{0,600}walkInWindow\(new Date\(\)/,
    )
    expect(code, 'ห้ามประกอบ ISO เองนอก walkInWindow').not.toMatch(
      /start:\s*new Date\(\)\.toISOString\(\)/,
    )
  })

  it('[blocker] ปุ่ม "ส่งสรุปนัด" ต้องไม่โผล่คู่กับ "แจ้งมัดจำ" บนการ์ดเดียว', () => {
    /**
     * ทั้งสองปุ่มเปิด **ชีตเดียวกัน** (`AppointmentSummarySheet`) เพราะการ์ดสรุปนัดมีบรรทัด
     * "มัดจำที่ตกลงไว้" อยู่ในนั้นแล้ว — สองใบบนการ์ดเดียวคือปุ่มที่ทำงานเหมือนกันแต่คนละคำ
     * ซึ่งอ่านได้ว่าเป็นคนละอย่าง
     */
    for (const s of SURFACES) {
      const code = stripComments(read(s.path))
      expect(code, `${s.name}: ต้องกันปุ่มซ้ำด้วยการเช็ค REQUEST_DEPOSIT`).toMatch(
        /REQUEST_DEPOSIT['"]?\s*\)/,
      )
    }
  })
})

describe('แก้ไขรายการในบิลจากแชท (หัวหน้า: "ต้องจัดการสินค้าได้ด้วย")', () => {
  it('[blocker] ทั้งสองจอต้องเปิดฟอร์มแก้ไขใบเดิมได้ — ไม่ใช่มีแค่เดสก์ท็อป', () => {
    /**
     * 🛑 กลไกมีครบมานานแล้ว (`openDraft({ editOrderToken })` → `OrderCreateForm` ในหน้าต่างลอย)
     * และแผงขวาเดสก์ท็อปใช้อยู่จริง — **ที่ขาดคือปุ่มบนมือถือ** ไม่ใช่ความสามารถ
     * คอมเมนต์เก่าในแถบมือถือเขียนว่า "ร้านคิวงานไม่มีหน้าต่างให้เปิด" ซึ่งเลิกจริงไปแล้ว
     * แต่ไม่มีใครกลับไปอ่าน ⇒ ฟีเจอร์ถูกมองว่า "ยังทำไม่ได้" ทั้งที่ทำได้ครึ่งหนึ่งอยู่แล้ว
     */
    for (const s of SURFACES) {
      const code = stripComments(read(s.path))
      expect(code, `${s.name}: ต้องเปิดฟอร์มแก้ไขด้วย editOrderToken`).toContain('editOrderToken:')
    }
  })

  it('[blocker] ต้องใช้ฟอร์มเดิม ห้ามสร้างทางแก้ไขเส้นที่สอง', () => {
    /**
     * ยอดรวมที่เปลี่ยนต้องไหลไปถึงยอดค้างทันที (BR-SQ-31) ซึ่งได้ฟรีเพราะทุกจออ่านจาก
     * `computeOrderMoney` ตัวเดียว — เส้นทางแก้ไขที่สองจะหลุดจากกติกานั้นโดยไม่มีอะไรฟ้อง
     */
    for (const s of SURFACES) {
      const code = stripComments(read(s.path))
      expect(code, `${s.name}: ต้องเรียกผ่าน openDraft`).toMatch(/openDraft\(\{[\s\S]{0,400}editOrderToken/)
    }
  })
})
