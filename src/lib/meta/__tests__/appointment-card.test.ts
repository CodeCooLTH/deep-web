/**
 * [blocker] การ์ดสรุปนัด — Generic Template ของ Messenger/IG (ส่วนขยาย 00024, 2026-08-11)
 *
 * เพดานของ Meta ไม่ใช่คำแนะนำ: เกิน 80 ตัว **Meta ตัดเองแบบไม่บอก** (จุดตัดจะไปกินวันนัด)
 * และคีย์ที่ผิดรูปทำให้ Meta **ปฏิเสธทั้งข้อความ** ไม่ใช่แค่ตกส่วนนั้น
 */

import { describe, it, expect } from 'vitest'
import { buildAppointmentSummary } from '../../appointment-summary'
import { buildMetaAppointmentCard } from '../appointment-card'
import { META_SUBTITLE_MAX, META_TITLE_MAX } from '../product-card'

const summary = (over?: Partial<Parameters<typeof buildAppointmentSummary>[0]>) =>
  buildAppointmentSummary({
    serviceStart: '2026-08-14T06:00:00.000Z',
    serviceEnd: '2026-08-14T07:00:00.000Z',
    serviceName: 'ล้างแอร์ 2 เครื่อง',
    resourceName: 'ช่างเอ',
    customerName: 'คุณขวัญใจ',
    phone: '085-331-5378',
    totalText: '฿1,200',
    depositText: null,
    ...over,
  })

const el = (s = summary(), url = 'https://deepthailand.app/o/T1') =>
  (buildMetaAppointmentCard(s, url).payload as { elements: Record<string, unknown>[] }).elements[0]

describe('buildMetaAppointmentCard', () => {
  it('เป็น generic template ใบเดียว', () => {
    const p = buildMetaAppointmentCard(summary(), 'https://x.test/o/T1')
    expect(p.type).toBe('template')
    expect((p.payload as { template_type: string }).template_type).toBe('generic')
    expect((p.payload as { elements: unknown[] }).elements).toHaveLength(1)
  })

  it('[สำคัญ] ไม่มีคีย์ image_url เลย — การ์ดนัดไม่มีรูป และค่าว่างทำให้ Meta ตกทั้งข้อความ', () => {
    expect(Object.keys(el())).not.toContain('image_url')
  })

  it('subtitle มีวันและเวลา (สิ่งที่ลูกค้าต้องอ่านให้ได้แม้เหลือบมอง)', () => {
    const s = el().subtitle as string
    expect(s).toContain('13:00')
    expect(s).toContain('14:00')
  })

  it('title/subtitle ไม่เกินเพดานแม้ชื่อบริการยาวผิดปกติ', () => {
    const long = summary({ serviceName: 'ล้างแอร์รุ่นพิเศษ'.repeat(40) })
    const e = el(long)
    expect((e.title as string).length).toBeLessThanOrEqual(META_TITLE_MAX)
    expect((e.subtitle as string).length).toBeLessThanOrEqual(META_SUBTITLE_MAX)
  })

  it('[สำคัญ] ตัด subtitle แล้ววันนัดต้องยังอยู่ — จุดตัดห้ามกินสิ่งที่การ์ดนี้มีไว้เพื่อบอก', () => {
    const long = summary({ serviceName: 'ล้างแอร์รุ่นพิเศษ'.repeat(40) })
    expect(el(long).subtitle as string).toContain('ส.ค.')
  })

  it('มีปุ่มเดียวชี้ลิงก์ที่ผู้เรียกส่งมา (เพดาน Meta คือ ≤3 ปุ่ม)', () => {
    const b = el(summary(), 'https://deepthailand.app/o/ABC').buttons as {
      type: string
      url: string
      title: string
    }[]
    expect(b).toHaveLength(1)
    expect(b[0].type).toBe('web_url')
    expect(b[0].url).toBe('https://deepthailand.app/o/ABC')
    expect(b[0].title.length).toBeLessThanOrEqual(20)
  })
})
