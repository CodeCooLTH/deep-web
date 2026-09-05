/**
 * [blocker] ออเดอร์ของห้องแชทต้องไม่หายเมื่อเบอร์ลูกค้าถูกแก้ (2026-09-05)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ทำไมต้องมีด่านนี้
 *
 * user report: ร้านแก้เบอร์ที่คีย์ผิดจากหน้าแชท แล้วออเดอร์ของห้องนั้นหายไป
 *
 * `Customer.phone` unique ทั้งระบบ ⇒ เบอร์ใหม่ = Customer คนละแถว และเธรดผูกลูกค้าได้ทีละคน
 * การคีย์เบอร์ใหม่จึง **สลับ** ลูกค้าของเธรด (ไม่ใช่เพิ่ม) ⇒ ใบเก่าหลุดจากแผงทันที
 *
 * ไม่มี gate ไหนของโปรเจกต์จับได้: `tsc`/build/เทส/grep เขียวหมด เพราะคิวรี "ถูก" ทุกตัวอักษร
 * สิ่งที่ผิดคือ *คำถาม* ที่มันถาม — จับได้ตอนผู้ใช้เปิดห้องแล้วเห็นแผงว่าง
 *
 * แดง = ห้าม merge
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { resolveThreadOrderFilter } from '../chat-thread-orders'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** ตัดคอมเมนต์ก่อนสแกนเสมอ — ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้ด้วย */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

describe('resolveThreadOrderFilter [blocker]', () => {
  it('ผูกลูกค้าแล้ว → ต้องได้ทั้งของลูกค้าคนนั้นและของห้องนี้ (นี่คือตัวแก้บั๊ก)', () => {
    const f = resolveThreadOrderFilter({ customerId: 'cus-1', conversationId: 'conv-1' })
    expect(f).toEqual({ OR: [{ customerId: 'cus-1' }, { conversationId: 'conv-1' }] })
  })

  /**
   * เคสจริงหลังแก้เบอร์: เธรดถูกย้ายไปลูกค้าคนใหม่แล้ว ใบเก่ายังผูกคนเดิมอยู่ —
   * ตัวที่ดึงใบเก่ากลับมาคือ `conversationId` ไม่ใช่ `customerId`
   */
  it('ยังไม่เคยผูกลูกค้า → ยังต้องเห็นใบที่เปิดจากห้องนี้', () => {
    const f = resolveThreadOrderFilter({ customerId: null, conversationId: 'conv-1' })
    expect(f).toEqual({ OR: [{ conversationId: 'conv-1' }] })
  })

  it('มีลูกค้าแต่ไม่รู้ห้อง (ผู้เรียกนอกแชท) → กรองด้วยลูกค้าอย่างเดียว', () => {
    const f = resolveThreadOrderFilter({ customerId: 'cus-1', conversationId: null })
    expect(f).toEqual({ OR: [{ customerId: 'cus-1' }] })
  })

  /**
   * 🛑 เคสที่อันตรายที่สุดของไฟล์นี้ — ถ้าคืน `{}` หรือ `{ OR: [] }` แทน `null` ผู้เรียกที่
   * spread เข้า `where` จะได้ **ออเดอร์ทั้งร้าน** โผล่ในแผงของห้องเดียว = ข้อมูลลูกค้าคนอื่นรั่ว
   * ไม่ใช่แค่ผลลัพธ์ผิด (Prisma ตีความ `OR: []` ว่า "ไม่มีแถวไหนผ่าน" ก็จริง แต่ `{}` ไม่ใช่)
   */
  it('ไม่มีทั้งลูกค้าและห้อง → null (ห้ามคืน object ว่างให้ผู้เรียกเผลอ spread)', () => {
    expect(resolveThreadOrderFilter({ customerId: null, conversationId: null })).toBeNull()
    expect(resolveThreadOrderFilter({ customerId: undefined, conversationId: undefined })).toBeNull()
    expect(resolveThreadOrderFilter({ customerId: '', conversationId: '' })).toBeNull()
  })
})

describe('ทั้ง 2 ทางเข้าของแผงต้องใช้เกณฑ์เดียวกัน [blocker]', () => {
  const SSR = 'src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx'
  const LAZY = 'src/app/api/chat/conversations/[id]/orders/route.ts'

  it('SSR (20 ใบแรก) และ lazy-load (ใบที่ 21+) เรียก resolveThreadOrderFilter ทั้งคู่', () => {
    for (const f of [SSR, LAZY]) {
      const code = stripComments(read(f))
      expect(code, f).toMatch(/resolveThreadOrderFilter\(/)
    }
  })

  /**
   * แพตเทิร์นของบั๊กเดิม: `order.findMany` ของ **รายการ** กรองด้วย `customerId` ตรง ๆ
   * (ถ้ากลับมา รายการจะหายอีกครั้งตอนเบอร์ถูกแก้ โดยไม่มีอะไรฟ้อง)
   *
   * 🛑 ตรวจเฉพาะคิวรี "รายการ" — `order.count`/`order.aggregate` ของบล็อกสถิติ **ตั้งใจ**
   * นับตามลูกค้าอย่างเดียว (ยอดซื้อรวมของคน ไม่ใช่ของห้อง) ห้ามลากมารวมในด่านนี้
   */
  it('คิวรีรายการออเดอร์ต้องไม่กรองด้วย customerId ดิบ ๆ อีก', () => {
    const code = stripComments(read(SSR))
    const at = code.indexOf('order.findMany(')
    expect(at, 'ต้องมีคิวรีรายการใน SSR').toBeGreaterThan(-1)
    const block = code.slice(at, at + 300)
    expect(block).toContain('threadOrderFilter')
    expect(block).not.toMatch(/customerId:/)
  })

  it('service ที่ lazy-load ต่อ ต้องรับเกณฑ์เข้ามา ไม่ประกอบเอง', () => {
    const svc = stripComments(read('src/services/order.service.ts'))
    expect(svc).toMatch(/export async function getThreadPanelOrders\(/)
    // ชื่อเดิมสื่อว่า "ของลูกค้า" ซึ่งไม่ตรงกับสิ่งที่มันทำแล้ว — ห้ามกลับมา
    expect(svc).not.toContain('getOrdersByCustomer')
  })
})

/**
 * [blocker] เธรดต้องย้ายตามเบอร์ที่แก้ ไม่ว่าหน้าจอไหนเป็นคนกดบันทึก (2026-09-05)
 *
 * `updateOrder` เคยหาเธรดจาก `data.conversationId` ที่ client ส่งมาอย่างเดียว — หน้าเต็มจอ
 * `/orders/[token]/edit` ไม่เคยส่งค่านี้เลย (มันไม่รู้จักแชท) ⇒ ออเดอร์ย้ายไปลูกค้าคนใหม่ตาม
 * เบอร์ที่แก้ แต่เธรดค้างอยู่กับลูกค้าคนเก่า = **ใบที่เพิ่งแก้หายจากห้องแชททันที**
 *
 * `Order.conversationId` เป็นค่าที่ server เขียนเองตอนสร้าง จึงเชื่อได้กว่าและไม่ขึ้นกับผู้เรียก
 */
describe('updateOrder หาเธรดจากตัวออเดอร์ก่อนเสมอ [blocker]', () => {
  const SVC = 'src/services/order.service.ts'

  it('findThreadContact ต้องรับ existing.conversationId ก่อน แล้วค่อยถอยไปใช้ค่าจากผู้เรียก', () => {
    const code = stripComments(read(SVC))
    expect(code).toMatch(
      /findThreadContact\(\s*tx,\s*shopId,\s*existing\.conversationId\s*\?\?\s*data\.conversationId,?\s*\)/,
    )
  })

  it('ต้อง select conversationId ของออเดอร์เดิมมาด้วย ไม่งั้นค่าข้างบนเป็น undefined ตลอด', () => {
    const code = stripComments(read(SVC))
    const at = code.indexOf('const existing = await tx.order.findFirst(')
    expect(at, 'ต้องมีคิวรีอ่านออเดอร์เดิมใน updateOrder').toBeGreaterThan(-1)
    expect(code.slice(at, at + 900)).toMatch(/conversationId:\s*true/)
  })
})
