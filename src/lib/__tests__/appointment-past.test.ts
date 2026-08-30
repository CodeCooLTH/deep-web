import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isAppointmentPast } from '@/lib/appointments'

/**
 * [blocker] เลยเวลานัดแล้ว — จอต้องบอกก่อนกด ไม่ใช่บอกหลังกด
 *
 * 🛑 `requestAppointmentReschedule()` บล็อกที่ `now >= serviceEnd` แล้วตอบ `APPOINTMENT_PAST`
 * แต่จอ **ยังโชว์ปุ่ม "ขอเลื่อนนัด"** ⇒ ผู้ซื้อกดปุ่มที่ไม่มีวันสำเร็จ แล้วเพิ่งรู้จาก
 * ข้อความ error ว่า "เลยเวลานัดไปแล้ว"
 *
 * เป็นคลาสเดียวกับที่ `classifyRetryUX` ถูกสร้างมาลบทิ้ง — *"ข้อความที่เชิญให้กด
 * สิ่งที่ไม่มีวันผ่าน"* · และเป็นอาการที่แย่กว่าไม่บอกอะไรเลย เพราะเสียการกดไปเปล่า ๆ
 *
 * 🛑 แดง = ห้าม merge
 */
const AC = readFileSync(
  join(process.cwd(), 'src/app/(marketing)/o/[token]/AppointmentCard.tsx'),
  'utf8',
)
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

const SVC = readFileSync(join(process.cwd(), 'src/services/appointment.service.ts'), 'utf8')

describe('[blocker] isAppointmentPast', () => {
  const NOW = new Date('2026-08-16T12:00:00+07:00')

  it('เลยปลายนัดแล้ว → true', () => {
    expect(isAppointmentPast('2026-08-16T11:00:00+07:00', NOW)).toBe(true)
  })

  it('🛑 อยู่ในช่วงนัด (เริ่มแล้วแต่ยังไม่จบ) → false — "ถึงเวลาแล้ว" คนละเรื่องกับ "เลยเวลาแล้ว"', () => {
    /* ถ้าตัดสินด้วยเวลาเริ่ม ลูกค้าที่กำลังนั่งอยู่ในร้านจะถูกบอกว่าเลยเวลาแล้ว
       และปุ่มขอเลื่อนจะหายไปทั้งที่ server ยังรับอยู่ */
    expect(isAppointmentPast('2026-08-16T13:00:00+07:00', NOW)).toBe(false)
  })

  it('ถึงปลายนัดพอดี → true (เส้นเดียวกับ backend คือ >=)', () => {
    expect(isAppointmentPast('2026-08-16T12:00:00+07:00', NOW)).toBe(true)
  })

  it('ค่าที่แปลงเป็นเวลาไม่ได้ / ไม่มีค่า → false (fail-open)', () => {
    /* เดาว่า "เลยแล้ว" จะไปซ่อนปุ่มของใบที่ยังใช้ได้ ซึ่งเสียหายกว่าปล่อยให้กดแล้ว server ปฏิเสธ */
    expect(isAppointmentPast(null, NOW)).toBe(false)
    expect(isAppointmentPast(undefined, NOW)).toBe(false)
    expect(isAppointmentPast('ไม่ใช่วันที่', NOW)).toBe(false)
  })
})

describe('[blocker] การ์ดนัดหมายต้องไม่เชิญให้กดสิ่งที่ไม่มีวันผ่าน', () => {
  it('ปุ่ม "ขอเลื่อนนัด" ต้องถูกกั้นด้วยเลยเวลานัด', () => {
    const at = AC.indexOf('const showReschedule')
    expect(at, 'ต้องมีตัวกั้นปุ่มขอเลื่อน').toBeGreaterThan(-1)
    expect(AC.slice(at, at + 220), 'ต้องมี !appointmentPast').toMatch(/!appointmentPast/)
  })

  it('🛑 ปุ่ม "ยืนยันนัดหมาย" ต้อง **ไม่** ถูกกั้น — server ไม่มีด่านเวลาสำหรับการยืนยัน', () => {
    /* ลูกค้าที่มาถึงร้านสายยังกดยืนยันได้จริง · ซ่อนปุ่มนี้ = ตัดทางที่ยังใช้ได้ทิ้ง
       (ตรวจกับ `confirmAppointmentByBuyer` แล้วว่าไม่มีการเทียบ `serviceEnd`) */
    const at = AC.indexOf('const showConfirm')
    expect(at).toBeGreaterThan(-1)
    expect(AC.slice(at, at + 160), 'showConfirm ห้ามผูกกับ appointmentPast').not.toMatch(/appointmentPast/)

    const fn = SVC.slice(SVC.indexOf('export async function confirmAppointmentByBuyer'))
    const body = fn.slice(0, fn.indexOf('\nexport '))
    expect(body, 'ถ้าวันหนึ่ง server เพิ่มด่านเวลาให้การยืนยัน ต้องกลับมาแก้จอด้วย').not.toMatch(
      /serviceEnd/,
    )
  })

  it('ต้องมีแถบบอกว่าเลยเวลาแล้ว พร้อมทางออก — ไม่ใช่แค่ซ่อนปุ่มเงียบ ๆ', () => {
    /* ซ่อนปุ่มอย่างเดียว = ผู้ซื้อค้างอยู่กับจอที่ไม่มีอะไรให้ทำ และไม่รู้ว่าทำไม */
    expect(AC, 'ต้องบอกว่าเลยเวลา').toContain('เลยเวลานัดนี้มาแล้ว')
    expect(AC, 'ต้องบอกทางออก').toContain('ติดต่อร้านเพื่อนัดใหม่')
    /* 🛑 **ห้ามใช้หน้าต่างความยาวคงที่** — ไฟล์นี้แทนคอมเมนต์ด้วยช่องว่างที่ยาวเท่าเดิม
       คอมเมนต์อธิบายเหนือแถบยาวกว่า 800 ตัวอักษร ⇒ หน้าต่างไปไม่ถึงตัวกั้นเลย
       (พลาดแบบเดียวกันเป็นครั้งที่ห้าในงานนี้ — เลิกใช้ระยะ ใช้โครงแทน)

       วิธีที่ทนทาน: หาตัวกั้นที่ใกล้ที่สุดก่อนหน้า แล้วพิสูจน์ว่า **ยังไม่ถูกปิด**
       ก่อนถึงข้อความ (ไม่มี `)}` คั่นกลาง) ⇒ ข้อความอยู่ในบล็อกของตัวกั้นจริง */
    const at = AC.indexOf('เลยเวลานัดนี้มาแล้ว')
    const guard = AC.lastIndexOf('{appointmentPast && (', at)
    expect(guard, 'ต้องมีตัวกั้น {appointmentPast && (').toBeGreaterThan(-1)
    expect(AC.slice(guard, at), 'ตัวกั้นต้องยังไม่ถูกปิดก่อนถึงข้อความ').not.toContain(')}')
  })

  it('ต้องอ้างเวลานัดจริง ไม่ใช่เขียนลอย ๆ ว่าสายแล้ว', () => {
    const at = AC.indexOf('เลยเวลานัดนี้มาแล้ว')
    expect(AC.slice(at, at + 700), 'ต้องแสดงเวลานัดจาก SSOT เดียวกับแถวด้านบน').toMatch(
      /formatDateTimeTH\(appointment\.startIso\)/,
    )
  })

  it('🛑 ต้องคำนวณครั้งเดียวตอน mount — ไม่ใช่ทุก render', () => {
    /* `new Date()` ใน render body ของ client component ให้ค่าต่างกันระหว่าง SSR กับ hydrate
       ⇒ hydration mismatch · และเป็นงานที่คิดใหม่ทุก render โดยไม่ได้อะไรกลับมา */
    expect(AC).toMatch(/useState\(\(\) => isAppointmentPast\(appointment\.endIso\)\)/)
  })
})
