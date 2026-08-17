/**
 * [blocker] สรุปนัดหมาย — SSOT ของเนื้อหาและคำ (ส่วนขยาย 00024, 2026-08-11)
 *
 * ทุกเคสในไฟล์นี้ผูกกับข้อตัดสินที่มีเหตุผลเขียนไว้ใน
 * `docs/20 - Features/00024 - Service Appointment Booking/EXTENSIONS-2026-08-11.md`
 * แดง = กำลังจะส่งของผิดออกไปหาลูกค้าจริง ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APPOINTMENT_CLOSING_MAX,
  APPOINTMENT_SUMMARY_LABEL,
  DEFAULT_APPOINTMENT_CLOSING,
  appointmentRangeText,
  buildAppointmentSummary,
  isHideableAppointmentSummaryKey,
  type AppointmentSummaryInput,
} from '../appointment-summary'

/** 14 ส.ค. 2026 13:00–14:00 เวลาไทย (UTC+7) */
const START = '2026-08-14T06:00:00.000Z'
const END = '2026-08-14T07:00:00.000Z'

const BASE: AppointmentSummaryInput = {
  serviceStart: START,
  serviceEnd: END,
  serviceName: 'ล้างแอร์ 2 เครื่อง',
  resourceName: 'ช่างเอ',
  customerName: 'คุณขวัญใจ',
  phone: '085-331-5378',
  totalText: '฿1,200',
  depositText: '฿300',
}

const keys = (s: ReturnType<typeof buildAppointmentSummary>) => s.lines.map((l) => l.key)

describe('buildAppointmentSummary — วันและเวลา', () => {
  it('มีช่วงเวลาจริง ไม่ใช่คำคลุมเครือ', () => {
    const s = buildAppointmentSummary(BASE)
    expect(s.lines[0].key).toBe('when')
    expect(s.lines[0].value).toContain('13:00')
    expect(s.lines[0].value).toContain('14:00')
  })

  it('นัดทั้งวัน → "ทั้งวัน" ไม่ใช่ "00:00–00:00"', () => {
    // ทั้งวันตามนิยาม isAllDayAppointment (00:00 → 24:00 เวลาไทย)
    const s = buildAppointmentSummary({
      ...BASE,
      serviceStart: '2026-08-13T17:00:00.000Z',
      serviceEnd: '2026-08-14T17:00:00.000Z',
    })
    expect(s.lines[0].value).toContain('ทั้งวัน')
    expect(s.lines[0].value).not.toContain('00:00')
  })

  it('ไม่มีเวลาสิ้นสุด → เหลือแค่วันที่ ไม่มีขีดคั่นค้าง', () => {
    const s = buildAppointmentSummary({ ...BASE, serviceEnd: null })
    expect(s.lines[0].value).not.toContain('–')
    expect(s.lines[0].value).not.toContain('·')
  })

  it('[สำคัญ] `when` ห้ามหายไม่ว่าจะสั่งซ่อนอะไรมา — การ์ด "ยืนยันนัดหมาย" ที่ไม่มีวันนัดคือของที่ทำให้ลูกค้ามาผิดวัน', () => {
    const s = buildAppointmentSummary(BASE, {
      hiddenKeys: ['when', 'service', 'customer', 'phone', 'amount', 'deposit'],
    })
    expect(keys(s)).toEqual(['when'])
  })

  it('`when` ไม่อยู่ใน allow-list ของบรรทัดที่ซ่อนได้ (ด่านที่ API ใช้ซ้ำ)', () => {
    expect(isHideableAppointmentSummaryKey('when')).toBe(false)
    expect(isHideableAppointmentSummaryKey('phone')).toBe(true)
    expect(isHideableAppointmentSummaryKey('อะไรก็ไม่รู้')).toBe(false)
  })
})

describe('buildAppointmentSummary — บรรทัดที่ไม่มีข้อมูล', () => {
  it('ค่าว่าง = บรรทัดหายไปเลย ห้ามแสดง "—" (การ์ดนี้ออกไปหาลูกค้า)', () => {
    const s = buildAppointmentSummary({
      ...BASE,
      customerName: null,
      phone: '   ',
      depositText: null,
    })
    expect(keys(s)).toEqual(['when', 'service', 'amount'])
    expect(s.text).not.toContain('—')
  })

  it('มีแต่ชื่อคิวงาน ไม่มีชื่อบริการ → ยังได้บรรทัด "บริการ" ไม่ใช่ " · ช่างเอ"', () => {
    const s = buildAppointmentSummary({ ...BASE, serviceName: null })
    const service = s.lines.find((l) => l.key === 'service')
    expect(service?.value).toBe('ช่างเอ')
  })
})

describe('buildAppointmentSummary — คำที่ห้ามเพี้ยน (HR16)', () => {
  it('มัดจำต้องเรียกว่า "มัดจำที่ตกลงไว้" — ป้ายนี้ติดให้ *ข้อตกลง* ไม่ใช่เงินที่เข้าแล้ว (BR-SQ-02)', () => {
    expect(APPOINTMENT_SUMMARY_LABEL.deposit).toBe('มัดจำที่ตกลงไว้')
    const s = buildAppointmentSummary(BASE)
    expect(s.text).toContain('มัดจำที่ตกลงไว้: ฿300')
  })

  it('[สำคัญ] สูตรช่วงเวลาต้องมีที่เดียว — OrderProgressBar ต้อง import appointmentRangeText ไม่ใช่เขียนเอง', () => {
    const src = readFileSync(
      join(
        process.cwd(),
        'src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/OrderProgressBar.tsx',
      ),
      'utf8',
    )
    expect(src).toMatch(/import\s*\{[^}]*appointmentRangeText[^}]*\}\s*from\s*'@\/lib\/appointment-summary'/)
    // ห้ามมีสูตรของตัวเองกลับมา (isAllDayAppointment เป็นแกนของสูตรนั้น)
    expect(src).not.toMatch(/isAllDayAppointment\s*\(/)
  })

  it('appointmentRangeText รับ Date และ string แล้วได้ผลเท่ากัน', () => {
    expect(appointmentRangeText(new Date(START), new Date(END))).toBe(
      appointmentRangeText(START, END),
    )
  })
})

describe('buildAppointmentSummary — ข้อความล้วนและ compact', () => {
  it('ไม่มี emoji (HR12) — ข้อความที่ร้านพิมพ์เองมี แต่ของเรามีไอคอนจริงบนการ์ด', () => {
    const s = buildAppointmentSummary(BASE)
    expect(s.text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u)
  })

  it('ข้อความล้วนขึ้นต้นด้วยหัวข้อ แล้วมีทุกบรรทัดในรูป "ป้าย: ค่า"', () => {
    const s = buildAppointmentSummary(BASE)
    const rows = s.text.split('\n')
    expect(rows[0]).toBe('ยืนยันนัดหมาย')
    for (const line of s.lines) {
      expect(s.text).toContain(`${line.label}: ${line.value}`)
    }
  })

  it('ต่อลิงก์ท้ายข้อความเมื่อผู้เรียกส่ง url มา', () => {
    const s = buildAppointmentSummary(BASE, { url: 'https://x.test/o/T1' })
    expect(s.text.trimEnd().endsWith('https://x.test/o/T1')).toBe(true)
  })

  it('compact ≤80 เสมอ (เพดาน subtitle ของ Meta) แม้ชื่อบริการยาวผิดปกติ', () => {
    const s = buildAppointmentSummary({ ...BASE, serviceName: 'บริการ'.repeat(60) })
    // compact ดิบอาจยาวได้ — สัญญาคือ "ผู้เรียกฝั่ง Meta ตัดได้เสมอ" จึงเช็คว่ามีวันเวลานำหน้า
    // เพื่อให้จุดตัดไม่กินวันนัดทิ้ง (ตัวตัดจริงคือ truncateForMeta ในการ์ดของ Meta)
    expect(s.compact.startsWith(s.lines[0].value)).toBe(true)
  })
})

describe('buildAppointmentSummary — ข้อความท้าย', () => {
  it('ไม่ส่ง closing มา → ใช้คำตั้งต้น', () => {
    expect(buildAppointmentSummary(BASE).closing).toBe(DEFAULT_APPOINTMENT_CLOSING)
  })

  it('ส่ง null มา → ไม่มีบรรทัดปิดท้ายเลย', () => {
    const s = buildAppointmentSummary(BASE, { closing: null })
    expect(s.closing).toBeNull()
    expect(s.text).not.toContain(DEFAULT_APPOINTMENT_CLOSING)
  })

  it('ส่งช่องว่างล้วน → ถือว่าไม่มี', () => {
    expect(buildAppointmentSummary(BASE, { closing: '   ' }).closing).toBeNull()
  })

  it('ยาวเกินเพดาน → ตัด ไม่ใช่ปล่อยผ่าน', () => {
    const s = buildAppointmentSummary(BASE, { closing: 'ก'.repeat(500) })
    expect(s.closing?.length).toBe(APPOINTMENT_CLOSING_MAX)
  })
})
