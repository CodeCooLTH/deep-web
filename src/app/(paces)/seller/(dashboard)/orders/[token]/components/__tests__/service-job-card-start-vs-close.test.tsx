/**
 * 00086 S-5 (FR-005/FR-011) — การ์ด "งานนี้": เริ่มงาน (canStart = O4) แยกจาก ปิดงาน (canClose = memberCanCloseJob)
 *
 * 🛑 [blocker] แดงเมื่อไหร่ห้าม merge — พนักงานที่ไม่ได้ติ๊ก "ปิดงานได้" ต้องยังเริ่มงานได้
 * mutation ที่ต้องแดง: ปุ่มเริ่มงานกลับไปอ่าน canClose (serviceJobCardButtons: `start: canClose && …`)
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/orders/tok-1',
  useSearchParams: () => new URLSearchParams(),
}))

import ServiceJobCard from '../ServiceJobCard'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { serviceJobCardButtons } from '@/lib/service-job'
import { th } from '@/i18n/dictionaries/th'

const base = {
  publicToken: 'tok-1',
  orderLabel: 'DP1',
  status: 'PENDING',
  closedAtISO: null as string | null,
  startedAtISO: null as string | null,
  badge: { key: 'SCHEDULED' as never, label: 'นัดแล้ว', cls: '', icon: 'calendar' },
  hasAppointment: false,
  startISO: null,
  endISO: null,
  allDay: false,
  canManage: false,
  editHref: null,
  // 00086 P3 — ค่าตั้งต้นของชุดเดิม = เจ้าของ/บทบาทที่ไม่ใช่ช่างล้วน · ร้านตั้งรูปแบบ "ไม่บังคับ"
  finishedAtISO: null as string | null,
  assignee: null as { userId: string; name: string } | null,
  viewerUserId: 'u-me',
  technicianOnly: false,
  canAssign: false,
  canClaim: false,
  photoMode: 'OPTIONAL' as 'REQUIRED' | 'OPTIONAL' | 'NONE',
  photosBuyerVisible: false,
  startedByName: null as string | null,
  finishedByName: null as string | null,
  jobSummary: 'ล้างแอร์ · คุณสมชาย',
}
type P = Partial<typeof base> & { canStart: boolean; canClose: boolean; startedAtISO?: string | null }
const render = (p: P) =>
  renderToStaticMarkup(h(LocaleProvider, { locale: 'th', children: h(ServiceJobCard, { ...base, ...p }) }))

const START = th.autoNotify.startJob
const CLOSE_BTN = /ปิดงาน<\/button>/

describe('ServiceJobCard — เริ่มงาน vs ปิดงาน', () => {
  it('[blocker] canStart && !canClose → เห็นปุ่มเริ่มงาน ไม่เห็นปุ่มปิดงาน', () => {
    const html = render({ canStart: true, canClose: false })
    expect(html).toContain(START)
    expect(html).not.toMatch(CLOSE_BTN)
    // 00086 P3: คำแนะนำปิดงานแสดงเฉพาะคนที่มีปุ่มปิดงาน (ตัด "แจ้งเจ้าของร้าน…" — FR-011 อยู่ในกล่องหลังทำเสร็จแทน)
    expect(html).not.toContain('แจ้งเจ้าของร้านหรือคนที่ได้รับสิทธิ์ให้ปิดงาน')
  })

  it('[blocker] canStart && canClose → เห็นทั้งสองปุ่ม', () => {
    const html = render({ canStart: true, canClose: true })
    expect(html).toContain(START)
    expect(html).toMatch(CLOSE_BTN)
  })

  it('!canStart && canClose → ไม่มีปุ่มเริ่มงาน แต่ปิดงานได้', () => {
    const html = render({ canStart: false, canClose: true })
    expect(html).not.toContain(START)
    expect(html).toMatch(CLOSE_BTN)
  })

  it('ไม่มีสิทธิ์ทั้งคู่ → ไม่มีปุ่มใด', () => {
    const html = render({ canStart: false, canClose: false })
    expect(html).not.toContain(START)
    expect(html).not.toMatch(CLOSE_BTN)
  })
})

describe('serviceJobCardButtons', () => {
  const b = { closable: true, started: false, notStarted: false }
  it('[blocker] start อ่าน canStart ไม่ใช่ canClose', () => {
    // 00086 P3 เพิ่มคีย์ใหม่ — ไม่ส่ง input ใหม่ = ปุ่มใหม่ไม่ขึ้น (ชุดเต็มอยู่ใน src/lib/__tests__/service-job-buttons.test.ts)
    const p3Off = { finish: false, claim: false, notAssigneeNote: false, closeBlockedNote: 'NONE' }
    expect(serviceJobCardButtons({ ...b, canStart: true, canClose: false })).toEqual({ startedNote: false, start: true, close: false, ...p3Off })
    expect(serviceJobCardButtons({ ...b, canStart: false, canClose: true })).toEqual({ startedNote: false, start: false, close: true, ...p3Off })
  })
  it('เริ่มแล้ว → แสดงเวลาที่เริ่มแทนปุ่ม · ยังไม่ถึงนัด → ไม่มีปุ่มเริ่ม · งานปิดไม่ได้ → ไม่มีอะไร', () => {
    expect(serviceJobCardButtons({ ...b, started: true, canStart: true, canClose: false })).toMatchObject({ startedNote: true, start: false })
    expect(serviceJobCardButtons({ ...b, notStarted: true, canStart: true, canClose: true })).toMatchObject({ start: false, close: true })
    expect(serviceJobCardButtons({ ...b, closable: false, canStart: true, canClose: true })).toMatchObject({ startedNote: false, start: false, close: false, finish: false, claim: false })
  })
})

// ─── 00086 P3 (T6) — ผู้รับผิดชอบ · รับงาน · ทำเสร็จ · FR-011 ─────────────────────────────────────────────

const TECH = { canStart: true, canClose: false, technicianOnly: true, canClaim: true, canAssign: false }
// มติ user 2026-10-30: ช่างเจ้าของงานเห็นคำบอกขั้นถัดไป ไม่ใช่คำห้าม (เดิม "— คุณไม่มีสิทธิ์ปิดงาน งานของคุณจบที่ขั้นนี้")
const FR011_TECH = 'ส่งงานแล้ว · รอเจ้าของร้านหรือผู้มีสิทธิ์ปิดงาน'
const FR011_WAIT = 'ทำเสร็จแล้ว · รอเจ้าของร้านหรือคนที่มีสิทธิ์ปิดงาน'
const STARTED = '2026-10-29T03:30:00.000Z'
const FINISHED = '2026-10-29T04:10:00.000Z'
/** renderToStaticMarkup escape เครื่องหมายคำพูด — เทียบข้อความล้วน */
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&quot;|&ldquo;|&rdquo;|“|”/g, '"')

describe('ServiceJobCard — แถวผู้รับผิดชอบ + มอบงาน', () => {
  it('ไม่มีคนรับ → "ยังไม่มีคนรับ" · มีคนรับ → ชื่อ', () => {
    expect(render({ canStart: true, canClose: true })).toContain('ยังไม่มีคนรับ')
    const html = render({ canStart: true, canClose: true, assignee: { userId: 'u-x', name: 'สมศักดิ์' } })
    expect(html).toContain('สมศักดิ์')
    expect(html).not.toContain('ยังไม่มีคนรับ')
  })
  // critique P1-6 — ไม่ใช้คำ "พนักงาน" (lexicon lock lib/no-permission-copy.ts)
  it('canAssign → ปุ่ม "มอบงาน" (ไม่มีคนรับ) / "เปลี่ยน" (มีคนรับ) · ปิดแล้ว/ไม่มีสิทธิ์ → ไม่มีปุ่ม', () => {
    expect(render({ canStart: true, canClose: true, canAssign: true })).toContain('aria-label="มอบงานนี้"')
    expect(render({ canStart: true, canClose: true, canAssign: true, assignee: { userId: 'u-x', name: 'ก' } })).toContain('aria-label="เปลี่ยนผู้รับผิดชอบ"')
    expect(render({ canStart: true, canClose: true, canAssign: false })).not.toContain('aria-label="มอบงานนี้"')
    expect(render({ canStart: true, canClose: true, canAssign: true, closedAtISO: STARTED })).not.toContain('aria-label="มอบงานนี้"')
  })
})

describe('ServiceJobCard — ช่างล้วน (BRD §8.1/§8.2)', () => {
  it('[blocker] ยังไม่มีคนรับ → "รับงานนี้" แทนปุ่มเริ่มงาน', () => {
    const html = render(TECH)
    expect(html).toContain('รับงานนี้')
    expect(text(html)).toContain('งานจะย้ายไปอยู่ใน "งานของฉัน"')
    expect(html).not.toContain(`${START} · ถ่ายรูปก่อนทำ`)
  })
  it('[blocker] งานของคนอื่น → กล่อง "งานนี้เป็นของ {ชื่อ} · เริ่มงานได้เฉพาะผู้รับผิดชอบ" ไม่มีปุ่มเริ่ม/รับ', () => {
    const html = render({ ...TECH, assignee: { userId: 'u-other', name: 'วิชัย' } })
    expect(html).toContain('งานนี้เป็นของ วิชัย · เริ่มงานได้เฉพาะผู้รับผิดชอบ')
    expect(html).not.toContain('รับงานนี้</button>')
    expect(html).not.toContain(`${START} · ถ่ายรูปก่อนทำ`)
  })
  it('งานของตัวเอง → ปุ่ม "เริ่มงาน · ถ่ายรูปก่อนทำ" (โหมดรูป) / "เริ่มงาน" (ไม่ใช้รูป)', () => {
    const mine = { ...TECH, assignee: { userId: 'u-me', name: 'ฉัน' } }
    expect(render(mine)).toContain(`${START} · ถ่ายรูปก่อนทำ`)
    const none = render({ ...mine, photoMode: 'NONE' })
    expect(none).not.toContain('ถ่ายรูปก่อนทำ')
    expect(none).toMatch(new RegExp(`${START}</button>`))
  })
  it('เริ่มแล้ว (ของตัวเอง) → "เริ่มงานเมื่อ … · โดย {ชื่อ}" + ปุ่ม "ทำเสร็จแล้ว · ถ่ายรูปหลังทำ"', () => {
    const html = render({ ...TECH, assignee: { userId: 'u-me', name: 'ฉัน' }, startedAtISO: STARTED, startedByName: 'ฉัน' })
    expect(html).toContain('· โดย ฉัน')
    expect(html).toContain('ทำเสร็จแล้ว · ถ่ายรูปหลังทำ')
  })
  it('[blocker FR-011] ทำเสร็จแล้ว ∧ ไม่มีสิทธิ์ปิด → ข้อความ FR-011 ตรงตัว ไม่มีปุ่มปิด/ทำเสร็จ', () => {
    const html = render({
      ...TECH, assignee: { userId: 'u-me', name: 'ฉัน' }, startedAtISO: STARTED, finishedAtISO: FINISHED, finishedByName: 'ฉัน',
    })
    expect(text(html)).toContain(FR011_TECH)
    // critique P1-1 — เว้นวรรคระหว่างชื่อกับ "ทำเสร็จเมื่อ" · P1-2 — ไม่ต่อ "· รอปิดงาน" ซ้ำกับป้าย/กล่อง FR-011
    expect(text(html)).toContain('ฉัน ทำเสร็จเมื่อ')
    expect(text(html)).not.toContain('ฉันทำเสร็จเมื่อ')
    expect(text(html)).not.toContain('น. · รอปิดงาน')
    expect(html).not.toMatch(CLOSE_BTN)
    expect(html).not.toContain('ทำเสร็จแล้ว · ถ่ายรูปหลังทำ')
  })
  it('ช่างที่ติ๊กปิดงานได้ · งานของตัวเอง ทำเสร็จแล้ว → ปุ่มปิดงาน · ยังไม่ทำเสร็จ → ไม่มีปุ่มปิด', () => {
    const mine = { ...TECH, canClose: true, assignee: { userId: 'u-me', name: 'ฉัน' }, startedAtISO: STARTED }
    expect(render(mine)).not.toMatch(CLOSE_BTN)
    expect(render({ ...mine, finishedAtISO: FINISHED })).toMatch(CLOSE_BTN)
  })
})

describe('ServiceJobCard — บทบาทอื่น (เจ้าของ/ตอบแชท) ทำแทนได้ทุกใบ', () => {
  it('งานของช่างคนอื่น → ยังเริ่มงานได้ ไม่มีกล่อง "งานนี้เป็นของ"', () => {
    const html = render({ canStart: true, canClose: true, assignee: { userId: 'u-other', name: 'วิชัย' } })
    expect(html).toContain(`${START} · ถ่ายรูปก่อนทำ`)
    expect(html).not.toContain('งานนี้เป็นของ')
    expect(html).not.toContain('รับงานนี้')
  })
  it('ทำเสร็จแล้ว ∧ ไม่มีสิทธิ์ปิด (เช่น ตอบแชทที่ไม่ได้ติ๊ก) → "ทำเสร็จแล้ว · รอ…" ไม่ใช่คำของช่างเจ้าของงาน', () => {
    const html = render({ canStart: true, canClose: false, startedAtISO: STARTED, finishedAtISO: FINISHED })
    expect(text(html)).toContain(FR011_WAIT)
    expect(html).not.toContain(FR011_TECH)
  })
  it('[FR-010] ผู้ปิดได้ ปิดก่อนทำเสร็จได้ (ไม่ต้องรอทำเสร็จ)', () => {
    expect(render({ canStart: true, canClose: true, startedAtISO: STARTED })).toMatch(CLOSE_BTN)
  })
})
