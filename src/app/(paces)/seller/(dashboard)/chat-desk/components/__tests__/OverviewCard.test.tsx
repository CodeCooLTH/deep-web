import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OverviewCard from '../OverviewCard'
import type { DeskDaily, DeskSummary } from '@/lib/chat-desk/types'

const summary: DeskSummary = { online: 2, chatters: 4, free: 1, waiting: 3, overdue: 0, talking: 5, awaitingCapped: false }
const daily: DeskDaily = {
  status: 'OK', asOf: '2026-10-16T07:00:00.000Z', firstResponseAvgSec: 180, responseAvgSec: null,
  responseSampleCount: 0, unattributedReplyCount: 41, answeredOutsideSystemConversations: 3, resolvedToday: 0,
}
const html = (s: Partial<DeskSummary> = {}, d: DeskDaily | null = daily, filtered = false) =>
  renderToStaticMarkup(<OverviewCard summary={{ ...summary, ...s }} daily={d} filtered={filtered} />)

describe('OverviewCard (ตัวเลขไม่ครบต้องบอก)', () => {
  it('ค่าเฉลี่ยที่ไม่มีตัวอย่างเป็น "—" ไม่ใช่ 0 · ปิดงาน 0 จริงยังเป็น 0', () => {
    const h = html()
    expect(h).toContain('3 น.') // ตอบแรกเฉลี่ย 180 วิ
    expect(h).toMatch(/รอเฉลี่ย[\s\S]*?—/)
    expect(h).toMatch(/ปิดงานวันนี้[\s\S]*?tabular-nums">0</)
  })

  it('ป้ายนับไม่ครบ: n>0 แสดงจำนวนข้อความที่ไม่รวม · n=0 ไม่มีป้าย', () => {
    expect(html()).toContain('นับเฉพาะคำตอบที่ระบุได้ว่าใครตอบ · ไม่รวมคำตอบจากนอกระบบ 41 ข้อความ')
    expect(html({}, { ...daily, unattributedReplyCount: 0 })).not.toContain('ข้อความไม่รวม')
  })

  it('presence ใช้ไม่ได้: ออนไลน์/ว่างเป็น "—" (ห้าม 0/N) พร้อมป้ายเตือน', () => {
    const h = html({ online: null, free: null })
    expect(h).toContain('ตรวจสถานะออนไลน์ไม่ได้ตอนนี้')
    expect(h).not.toMatch(/0\/4/)
    expect(h).toMatch(/ออนไลน์[\s\S]*?—/)
  })

  it('daily ล้ม: 4 แถวรายวันเป็น "—" พร้อมป้าย ไม่ใช่ 0', () => {
    const h = html({}, { ...daily, status: 'UNAVAILABLE', resolvedToday: 0 })
    expect(h).toContain('ตัวเลขของวันนี้โหลดไม่ได้ตอนนี้')
    expect(h).not.toContain('ข้อความไม่รวม')
  })

  it('มีตัวกรอง = 3 แถวรายวันขึ้น "ทั้งร้าน" (TD-13) · ไม่มีตัวกรองไม่ขึ้น', () => {
    expect((html({}, daily, true).match(/· ทั้งร้าน/g) ?? []).length).toBe(3)
    expect(html()).not.toContain('ทั้งร้าน')
  })

  it('เกินเวลาตอบเป็นแดงเฉพาะ >0 · รอคำตอบถึงเพดาน = "n+" พร้อมบรรทัด 200 ห้อง', () => {
    expect(html({ overdue: 0 })).not.toContain('text-danger-ink mt-0.5')
    expect(html({ overdue: 2 })).toContain('text-danger-ink')
    const capped = html({ waiting: 200, awaitingCapped: true })
    expect(capped).toContain('200+')
    expect(capped).toContain('แสดง 200 ห้องที่รอนานสุด')
  })

  it('ปุ่ม ⓘ เป็นปุ่มจริง (aria-expanded/aria-controls) และคำอธิบายซ่อนอยู่ตอนปิด', () => {
    const h = html()
    expect(h).toContain('aria-expanded="false"')
    expect(h).toMatch(/aria-controls="[^"]+"/)
    expect(h).toContain('hidden=""')
  })
})
