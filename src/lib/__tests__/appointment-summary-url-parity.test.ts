import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * [blocker] พรีวิว "สรุปนัด" ต้องประกอบด้วยข้อมูลชุดเดียวกับข้อความที่ส่งจริง
 *
 * ## บั๊กที่ด่านนี้กัน
 *
 * สรุปนัดถูกประกอบ **2 ที่**: ชีตพรีวิวฝั่งผู้ขาย (`AppointmentSummarySheet`) กับ route ที่ส่งจริง
 * (`/api/chat/conversations/[id]/messages`) ทั้งคู่เรียก `buildAppointmentSummary()` ตัวเดียวกัน
 * — แต่ **ตัวเลือก `url` เคยส่งแค่ฝั่ง route** ⇒ ผู้ขายเห็นข้อความไม่มีลิงก์ กดส่ง แล้วลูกค้าได้
 * ข้อความที่มีลิงก์ต่อท้าย. ลิงก์นั้นคือสิ่งที่ลูกค้าใช้ตรวจบิล/แนบสลิป/กดยืนยัน — พรีวิวที่ไม่มี
 * มันคือพรีวิวที่โกหกในเรื่องที่สำคัญที่สุดของข้อความนั้น
 *
 * 🛑 **หัวไฟล์ `appointment-summary.ts` เขียนกฎนี้ไว้เองแล้ว แต่ไม่มีอะไรบังคับ** — และนั่นคือ
 * เหตุผลที่มันหลุด: กฎที่ "เขียนไว้" ยังไม่ใช่กฎที่ "บังคับได้"
 * (`docs/conventions/rule-must-be-enforced-not-described.md`)
 *
 * ## ทำไมเป็นเทสที่สแกนซอร์ส
 *
 * ความผิดพลาดอยู่ที่ **การประกอบพารามิเตอร์ ณ จุดเรียก** ไม่ใช่ในฟังก์ชัน — เทสที่เรียก
 * `buildAppointmentSummary()` เองจะเขียวตลอดไม่ว่าจุดเรียกจริงส่งอะไรมา (เทสที่ mock
 * เพื่อนบ้านทิ้งยืนยันได้แค่ว่าตัวเองทำงานถูก) และรีโปนี้ไม่มี jsdom ให้ render จริง
 *
 * 🛑 แดง = ห้าม merge
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกคือไฟล์ที่เขียนคำเตือนของกฎนั้นไว้ด้วย */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const PREVIEW = 'src/app/(paces)/seller/(chat)/_components/AppointmentSummarySheet.tsx'
const SEND = 'src/app/api/chat/conversations/[id]/messages/route.ts'

describe('[blocker] สรุปนัด — พรีวิวกับข้อความที่ส่งจริงต้องใช้ลิงก์ตัวเดียวกัน', () => {
  for (const rel of [PREVIEW, SEND]) {
    it(`${rel.split('/').pop()} ประกอบลิงก์จาก publicOrderUrl() ไม่ใช่ต่อสตริงเอง`, () => {
      const code = stripComments(read(rel))
      expect(code, `${rel}: ต้อง import publicOrderUrl`).toMatch(
        /import \{[^}]*publicOrderUrl[^}]*\} from ["']@\/lib\/public-order-url["']/,
      )
      expect(code, `${rel}: ต้องเรียก publicOrderUrl(`).toMatch(/publicOrderUrl\(/)

      /**
       * ห้ามประกอบ path ของหน้าออเดอร์เองในสองไฟล์นี้ — จุดที่พลาดง่ายที่สุดคือคนเติมฟีเจอร์
       * ทีหลังแล้วเขียน `` `${base}/o/${token}` `` ตรงนั้นเลยเพราะสั้นกว่า แล้วสองฝั่งแยกจากกัน
       * อีกครั้งโดยไม่มีอะไรฟ้อง (`/api/o/...` ของ SMS เป็นคนละเส้นทาง จึงไม่ถูกจับ)
       */
      expect(code, `${rel}: ห้ามต่อ path /o/ เองในไฟล์นี้`).not.toMatch(/["'`]\/o\/\$\{/)
    })
  }

  /**
   * ทั้งคู่ต้องส่ง `url` เข้า `buildAppointmentSummary` จริง ไม่ใช่แค่มี import ค้างไว้
   *
   * ตรวจ "อยู่ในระยะของการเรียกเดียวกัน" ไม่ใช่แค่ "มีคำว่า url ที่ไหนสักแห่งในไฟล์" —
   * ไฟล์ทั้งสองยาวหลายร้อยบรรทัดและมีคำว่า url อยู่ด้วยเหตุผลอื่นเต็มไปหมด
   */
  for (const rel of [PREVIEW, SEND]) {
    it(`${rel.split('/').pop()} ส่ง url เข้า buildAppointmentSummary จริง`, () => {
      const code = stripComments(read(rel))
      const callAt = code.indexOf('buildAppointmentSummary(')
      expect(callAt, `${rel}: ต้องเรียก buildAppointmentSummary`).toBeGreaterThan(-1)

      /* หน้าต่างนับจากจุดเรียก — ครอบ argument ทั้งสองก้อนของการเรียกนั้นโดยไม่กินการเรียกอื่น
         (ชีตเรียก 2 ครั้ง: ครั้งที่สองตั้งใจไม่ส่ง url เพราะใช้หา "บรรทัดที่มีข้อมูล" เท่านั้น) */
      const window = code.slice(callAt, callAt + 1200)
      expect(window, `${rel}: การเรียกแรกต้องมี url:`).toMatch(/\burl:/)
    })
  }
})
