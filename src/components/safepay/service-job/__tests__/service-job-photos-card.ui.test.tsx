/**
 * 00086 P3 (T7) — การ์ด "รูปก่อน-หลัง / บันทึกงาน" + รูปย่อในประวัติ + ชีตมอบงาน (markup)
 * mutation ที่ต้องแดง: หัวการ์ดไม่อ่าน photoMode · ป้าย "ลูกค้าเห็น" ไม่ดู mode≠NONE · ไม่มี record แล้วยัง render ·
 *   ผูกรูปกับทุกแถว SERVICE_STARTED แทนแถวล่าสุด · ไม่ตัด desc เมื่อผูกรูปแล้ว
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => h('img', { alt: p.alt as string, src: p.src as string }) }))

import ServiceJobPhotosCard from '../ServiceJobPhotosCard'
import AssigneeSheet, { assignErrorFollowUp } from '../AssigneeSheet'
import { serviceJobFacts, toServiceJobRecordViews, type ServiceJobRecordView } from '../service-job-facts'
import ActivityActorAvatar from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/ActivityActorAvatar'
import ShippingActivity, { linkServiceJobRecords } from '@/app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingActivity'
import type { OrderEventView } from '@/lib/order-event'

const BEFORE: ServiceJobRecordView = {
  phase: 'BEFORE', note: 'โคมเหลือง\nมีรอยร้าว', fileIds: ['k/1.jpg', 'k/2.jpg'], createdAtISO: '2026-10-29T03:30:00.000Z', createdByName: 'สมศักดิ์',
}
const AFTER: ServiceJobRecordView = {
  phase: 'AFTER', note: null, fileIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], createdAtISO: '2026-10-29T04:30:00.000Z', createdByName: 'สมศักดิ์',
}
const card = (o: Partial<Parameters<typeof ServiceJobPhotosCard>[0]> = {}) =>
  renderToStaticMarkup(
    h(ServiceJobPhotosCard, { records: [BEFORE], photoMode: 'OPTIONAL', buyerVisible: true, assigneeName: 'สมศักดิ์', closed: false, finished: false, ...o }),
  )

describe('ServiceJobPhotosCard', () => {
  it('ไม่มี record → ไม่ render', () => {
    expect(card({ records: [] })).toBe('')
  })
  it('หัว "รูปก่อน-หลัง" + ป้าย "ลูกค้าเห็น" · ปิดการมองเห็น → "เห็นเฉพาะในร้าน"', () => {
    const html = card()
    expect(html).toContain('รูปก่อน-หลัง')
    expect(html).toContain('ลูกค้าเห็น')
    expect(card({ buyerVisible: false })).toContain('เห็นเฉพาะในร้าน')
  })
  it('NONE → หัว "บันทึกงาน" + "เห็นเฉพาะในร้าน" แม้ธงเห็นเปิด', () => {
    const html = card({ photoMode: 'NONE' })
    expect(html).toContain('บันทึกงาน')
    expect(html).not.toContain('รูปก่อน-หลัง')
    expect(html).toContain('เห็นเฉพาะในร้าน')
  })
  it('ก่อนทำ: เวลา · โดย {ชื่อ} + รูปย่อทุกใบ (label รูปก่อนทำ) + บันทึก', () => {
    const html = card()
    expect(html).toContain('· โดย สมศักดิ์')
    expect(html).toContain('ดูรูปก่อนทำ 1')
    expect(html).toContain('ดูรูปก่อนทำ 2')
    expect(html).toContain('src="/api/files/k/1.jpg"')
    expect(html).toContain('โคมเหลือง')
  })
  it('หลังทำว่าง ∧ ยังไม่ปิด → รอ {ชื่อ} กด "ทำเสร็จแล้ว" · ไม่มีคนรับ → รอผู้รับผิดชอบ', () => {
    // critique P1-1 — เว้นวรรครอบชื่อ (เดิมติดกันเป็น "รอQA86P3 ช่างเอกด")
    expect(card()).toMatch(/รอ สมศักดิ์ กด (&ldquo;|“)ทำเสร็จแล้ว(&rdquo;|”)/)
    expect(card()).not.toContain('รอสมศักดิ์')
    expect(card({ assigneeName: null })).toContain('รอ ผู้รับผิดชอบ กด')
  })
  it('MINOR-1: ทำเสร็จแล้วแต่ไม่มีบันทึกหลังทำ → "ไม่มีบันทึกหลังทำ" ไม่ใช่ "รอ…กด ทำเสร็จแล้ว"', () => {
    const html = card({ finished: true })
    expect(html).toContain('ไม่มีบันทึกหลังทำ')
    expect(html).not.toContain('ทำเสร็จแล้ว')
    expect(html).not.toContain('รอสมศักดิ์')
    // มีบันทึกหลังทำ → แสดงบันทึกตามเดิม (ข้อความว่างไม่โผล่)
    expect(card({ finished: true, records: [BEFORE, AFTER] })).not.toContain('ไม่มีบันทึกหลังทำ')
  })
  it('หลังทำว่าง ∧ ปิดแล้ว (ข้ามขั้น) → ไม่มีส่วนหลังทำ', () => {
    expect(card({ closed: true })).not.toContain('หลังทำ')
  })
  it('มีแค่หลังทำ → ก่อนทำ "ไม่มีบันทึก"', () => {
    const html = card({ records: [AFTER] })
    expect(html).toContain('ไม่มีบันทึก')
    expect(html).toContain('ดูรูปหลังทำ 6')
  })
})

describe('toServiceJobRecordViews / serviceJobFacts', () => {
  it('แปลง Date → ISO · ตัด phase แปลก · note ว่าง = null', () => {
    const v = toServiceJobRecordViews([
      { phase: 'BEFORE', note: '  ', fileIds: ['x', 3], createdAt: new Date('2026-10-29T03:30:00Z'), createdBy: { displayName: 'ก' } },
      { phase: 'WHAT', note: 'x', fileIds: [], createdAt: new Date() },
    ])
    expect(v).toEqual([{ phase: 'BEFORE', note: null, fileIds: ['x'], createdAtISO: '2026-10-29T03:30:00.000Z', createdByName: 'ก' }])
    expect(toServiceJobRecordViews(undefined)).toEqual([])
  })
  it('ผู้รับผิดชอบ + ชื่อคนเริ่ม/ทำเสร็จล่าสุด (events ใหม่→เก่า) + บรรทัดบริการ·ลูกค้า', () => {
    const f = serviceJobFacts(
      { assignedUser: { id: 'u1', displayName: 'สมศักดิ์' }, items: [{ name: 'ล้างแอร์' }, { name: 'เติมน้ำยา' }], buyerName: 'คุณสมชาย' },
      [
        { type: 'SERVICE_FINISHED', actorLabel: 'วิชัย' },
        { type: 'SERVICE_STARTED', actorLabel: 'สมศักดิ์' },
        { type: 'SERVICE_STARTED', actorLabel: 'เก่า' },
      ],
    )
    expect(f.assignee).toEqual({ userId: 'u1', name: 'สมศักดิ์' })
    expect(f.startedByName).toBe('สมศักดิ์')
    expect(f.finishedByName).toBe('วิชัย')
    expect(f.jobSummary).toBe('ล้างแอร์, เติมน้ำยา · คุณสมชาย')
  })
  it('ไม่มีผู้รับผิดชอบ → null · ชื่อว่าง → "สมาชิกร้าน"', () => {
    expect(serviceJobFacts({}, []).assignee).toBeNull()
    expect(serviceJobFacts({ assignedUser: { id: 'u2', displayName: null } }, []).assignee).toEqual({ userId: 'u2', name: 'สมาชิกร้าน' })
  })
})

const ev = (id: string, type: OrderEventView['type'], meta: OrderEventView['meta'] = {}): OrderEventView => ({
  id, type, meta, occurredAtISO: '2026-10-29T04:30:00.000Z', actorLabel: 'สมศักดิ์', actorAvatar: null,
})

describe('ประวัติ — รูปย่อผูกกับเริ่ม/ทำเสร็จล่าสุด', () => {
  const events = [
    ev('e3', 'SERVICE_FINISHED', { photoCount: 6 }),
    ev('e2', 'SERVICE_STARTED', { photoCount: 2, hasNote: true }),
    ev('e1', 'SERVICE_STARTED', { photoCount: 1 }),
    ev('e0', 'SERVICE_ASSIGNED', { assigneeNameSnapshot: 'สมศักดิ์' }),
  ]
  it('linkServiceJobRecords: STARTED ล่าสุด ↔ BEFORE · FINISHED ↔ AFTER · ไม่มี record = ว่าง', () => {
    const m = linkServiceJobRecords(events, [BEFORE, AFTER])
    expect(m.get('e2')).toBe(BEFORE)
    expect(m.get('e3')).toBe(AFTER)
    expect(m.has('e1')).toBe(false)
    expect(linkServiceJobRecords(events, undefined).size).toBe(0)
  })
  it('render: รูปย่อ ≤4 + "+2" · ผูกแล้วไม่มี desc "รูป N รูป" · แถวไม่ผูกยัง desc เดิม · มอบงานใช้คำเดิม', () => {
    const html = renderToStaticMarkup(h(ShippingActivity, { events, serviceJobRecords: [BEFORE, AFTER] }))
    expect(html).toContain('ดูรูปหลังทำ 4')
    expect(html).not.toContain('ดูรูปหลังทำ 5')
    expect(html).toContain('+2')
    expect(html).not.toContain('รูป 6 รูป')
    expect(html).not.toContain('รูป 2 รูป · มีบันทึก')
    expect(html).toContain('รูป 1 รูป') // แถวเก่าที่ไม่ผูก
    expect(html).toContain('มอบงานให้ สมศักดิ์')
    expect(html).toContain('line-clamp-3')
  })
  it('ไม่ส่ง records (ร้านอื่น/ของเดิม) → desc เดิมทุกแถว ไม่มีรูปย่อ', () => {
    const html = renderToStaticMarkup(h(ShippingActivity, { events }))
    expect(html).toContain('รูป 6 รูป')
    expect(html).not.toContain('ดูรูป')
  })
})

// critique P2 — รูปโปรไฟล์ภายนอกโหลดไม่ขึ้น ⇒ ตัวอักษรแรก (ไม่มี DOM env ในเทส ⇒ render รูปปกติ + ด่าน source ของ onError)
describe('ประวัติ — รูปผู้กระทำโหลดไม่ขึ้น', () => {
  it('มีรูป ⇒ <img> ผ่าน ActivityActorAvatar · onError สลับเป็นวงกลมตัวอักษรแรก', () => {
    const html = renderToStaticMarkup(
      h(ActivityActorAvatar, { src: 'https://scontent.example/x.jpg', label: 'สมศักดิ์' }),
    )
    expect(html).toContain('<img')
    const src = readFileSync(
      path.resolve(__dirname, '../../../../app/(paces)/seller/(dashboard)/orders/[token]/components/ActivityActorAvatar.tsx'),
      'utf8',
    )
    expect(src).toMatch(/onError=\{\(\) => setFailed\(true\)\}/)
    expect(src).toContain("label.charAt(0).toUpperCase()")
    const sa = readFileSync(
      path.resolve(__dirname, '../../../../app/(paces)/seller/(dashboard)/orders/[token]/components/ShippingActivity.tsx'),
      'utf8',
    )
    expect(sa).toContain('<ActivityActorAvatar src={ev.actorAvatar}')
    expect(sa).not.toContain('<Image')
  })
})

describe('AssigneeSheet — markup', () => {
  const render = (currentUserId: string | null) =>
    renderToStaticMarkup(
      h(AssigneeSheet, { open: true, onClose: () => {}, orderToken: 't', orderLabel: 'DP1', currentUserId, onDone: () => {} }),
    )
  // critique P1-5 — คำเดียวกับการ์ด "งานนี้" ("ยังไม่มีคนรับ") + บรรทัดสองบอกว่าช่างรับเองได้
  it('แถวเป็นปุ่ม aria-pressed · "ยังไม่มีคนรับ" มาก่อนและถูกเลือกเมื่อยังไม่มีคนรับ · ไม่มีประโยค "ระบบแจ้งช่าง"', () => {
    const html = render(null)
    expect(html).toContain('มอบงาน · DP1')
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*ยังไม่มีคนรับ(?:(?!<\/button>)[\s\S])*ช่างกด &quot;รับงานนี้&quot; เองได้/)
    expect(html).not.toContain('ยังไม่ระบุ')
    expect(html).not.toContain('type="radio"')
    expect(html).not.toContain('ระบบแจ้ง')
    expect(html).toContain('animate-pulse') // กำลังโหลดรายชื่อ
  })
  it('มีคนรับแล้ว → "ยังไม่มีคนรับ" ไม่ถูกเลือก', () => {
    expect(render('u1')).toMatch(/<button[^>]*aria-pressed="false"[^>]*>(?:(?!<\/button>)[\s\S])*ยังไม่มีคนรับ/)
  })
})

describe('AssigneeSheet — โหมดเลือกของฟอร์มสร้าง + ช่วงเวลา (มติ 2026-10-30)', () => {
  it('onSelect = หัว "เลือกผู้รับผิดชอบ" (ไม่ใช่ "มอบงาน · …") · ไม่มีเลขงาน', () => {
    const html = renderToStaticMarkup(
      h(AssigneeSheet, { open: true, onClose: () => {}, shopId: 's1', currentUserId: null, onSelect: () => {} }),
    )
    expect(html).toContain('>เลือกผู้รับผิดชอบ<')
    expect(html).not.toContain('มอบงาน ·')
  })
  it('มีช่วงเวลา = บรรทัด "ช่วงงาน HH:mm–HH:mm · … · คนที่ว่างขึ้นก่อน" · ไม่มี = ไม่มีบรรทัด', () => {
    const win = { from: new Date('2031-03-05T07:00:00Z'), to: new Date('2031-03-05T09:00:00Z') }
    const withWin = renderToStaticMarkup(
      h(AssigneeSheet, { open: true, onClose: () => {}, orderToken: 't', orderLabel: 'DP1', currentUserId: null, onDone: () => {}, window: win }),
    )
    expect(withWin).toMatch(/ช่วงงาน 14:00–16:00 · [^<]+ · คนที่ว่างขึ้นก่อน/)
    const noWin = renderToStaticMarkup(
      h(AssigneeSheet, { open: true, onClose: () => {}, orderToken: 't', orderLabel: 'DP1', currentUserId: null, onDone: () => {} }),
    )
    expect(noWin).not.toContain('ช่วงงาน')
  })
  it('[blocker] โหมดเลือกไม่ยิง API มอบงาน — onSelect คืนก่อน fetch /assign', () => {
    const src = readFileSync(path.resolve(__dirname, '../AssigneeSheet.tsx'), 'utf8')
    const pick = src.slice(src.indexOf('async function pick'), src.indexOf('const sameDay'))
    expect(pick.indexOf('props.onSelect(')).toBeGreaterThan(-1)
    expect(pick.indexOf('props.onSelect(')).toBeLessThan(pick.indexOf('/assign`'))
    expect(pick.slice(pick.indexOf('props.onSelect('), pick.indexOf('/assign`'))).toMatch(/onClose\(\)\s*return/)
  })
})

describe('AssigneeSheet — ร้านยังไม่มีคนในฝ่ายช่าง (critique P1-6)', () => {
  // รายชื่อว่างต้อง fetch ก่อนจึง render ไม่ได้ใน static markup — ล็อกที่ source แทน
  it('[grep guard] บอกทางไปต่อ · ไม่มีคำ "พนักงาน"', () => {
    const src = readFileSync(path.resolve(__dirname, '../AssigneeSheet.tsx'), 'utf8')
    expect(src).toContain('ร้านยังไม่มีคนในฝ่ายช่าง · ตั้งบทบาทได้ที่หน้าทีมงาน')
    expect(src).not.toContain('พนักงาน')
  })
})

describe('AssigneeSheet — มอบงานไม่สำเร็จแล้วทำอะไรต่อ (MINOR-4)', () => {
  it('400 ASSIGNEE_NOT_TECHNICIAN → โหลดรายชื่อช่างใหม่', () => {
    expect(assignErrorFollowUp(400, 'ASSIGNEE_NOT_TECHNICIAN')).toBe('RELOAD_STAFF')
  })
  it('409 SERVICE_JOB_ALREADY_CLOSED → รีเฟรชผู้เรียก (onDone) + ปิดชีต', () => {
    expect(assignErrorFollowUp(409, 'SERVICE_JOB_ALREADY_CLOSED')).toBe('REFRESH')
  })
  it('รหัสอื่น/สถานะไม่ตรง → toast อย่างเดียว', () => {
    expect(assignErrorFollowUp(400, 'VALIDATION_ERROR')).toBeNull()
    expect(assignErrorFollowUp(500, undefined)).toBeNull()
    expect(assignErrorFollowUp(409, 'ASSIGNEE_NOT_TECHNICIAN')).toBeNull()
  })
  it('[grep guard] pick() ใช้ผลของ assignErrorFollowUp ทั้งสองทาง', () => {
    const src = readFileSync(path.resolve(__dirname, '../AssigneeSheet.tsx'), 'utf8')
    expect(src).toMatch(/next === 'RELOAD_STAFF'\) setReloadKey/)
    expect(src).toMatch(/next === 'REFRESH'\) \{\s*onDone\(\)/)
  })
})
