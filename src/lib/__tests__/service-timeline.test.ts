import { describe, expect, it } from 'vitest'

import { getServiceTimeline, SERVICE_TIMELINE_LABELS } from '@/lib/order-display'

/**
 * เส้นทางที่ลูกค้าร้านบริการเห็นบนหน้า /o/[token] — **4 ขั้นเมื่อมีนัด · 3 ขั้นเมื่อ walk-in**
 *
 * 🛑 ชุดแรกสุด (NO_SHIPPING) เขียนว่า **"ส่งมอบแล้ว"** เป็นขั้นปัจจุบันตั้งแต่บิลยัง PENDING
 * ⇒ ลูกค้าที่จองไว้และยังไม่ได้รับบริการ เห็นคำที่อ้างสิ่งที่ยังไม่เกิด บนหน้าที่เขาใช้ตัดสินใจโอนเงิน
 * (หัวหน้า 2026-08-15: "order detail ดูไม่รู้เรื่อง")
 *
 * ชุดที่สอง (3 ขั้น) แก้คำได้แล้ว แต่ยุบ "ลูกค้ายืนยันนัด" หายไปทั้งขั้น ทั้งที่ระบบเก็บ
 * `Order.buyerConfirmedAt` มาตั้งแต่ 00024 — ผู้ซื้อจึงไม่มีทางรู้จากหน้านี้เลยว่าตัวเองยังไม่ได้กด
 *
 * 🛑 **ขั้น 2 กับขั้น 4 เป็นการ "ยืนยัน" ของลูกค้าทั้งคู่ แต่คนละเรื่อง**
 * ขั้น 2 = "ฉันจะมาตามนัด" (ย้อนได้) · ขั้น 4 = "ฉันได้รับบริการแล้ว" (**ย้อนไม่ได้** + คะแนนร้านขยับ)
 * คำบนจอจึงต้องต่างกันชัด ไม่ใช่ต่างแค่ตำแหน่ง — ไม่งั้นลูกค้ากดปิดงานถาวรตั้งแต่ยังไม่ได้รับบริการ
 */
const NOW = new Date('2026-08-16T12:00:00+07:00')
const BEFORE = '2026-08-16T18:00:00+07:00' // ยังไม่ถึงเวลานัด
const AFTER = '2026-08-16T09:00:00+07:00' // เลยเวลานัดมาแล้ว

const [BOOKED, BUYER_OK, SERVED, DONE] = SERVICE_TIMELINE_LABELS

type Args = Parameters<typeof getServiceTimeline>[0]
const run = (over: Partial<Args> = {}) =>
  getServiceTimeline({
    status: 'PENDING',
    serviceStart: BEFORE,
    appointmentStatus: 'SCHEDULED',
    hasAppointment: true,
    buyerConfirmedAt: null,
    now: NOW,
    ...over,
  })

const labels = (s: ReturnType<typeof getServiceTimeline>) => s.map((x) => x.label)
const stateOf = (s: ReturnType<typeof getServiceTimeline>, label: string) =>
  s.find((x) => x.label === label)?.state

describe('getServiceTimeline — ราง 4 ขั้นของร้านบริการ', () => {
  it('[blocker] ห้ามมีคำว่า "ส่งมอบ" หรือ "จัดส่ง" — ร้านบริการไม่มีของให้ส่ง', () => {
    for (const status of ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'] as const) {
      for (const appt of [null, 'SCHEDULED', 'COMPLETED', 'NO_SHOW'] as const) {
        const t = getServiceTimeline({
          status,
          serviceStart: BEFORE,
          appointmentStatus: appt,
          hasAppointment: appt != null,
          now: NOW,
        })
        for (const l of labels(t)) {
          expect(l, `${status}/${appt}`).not.toMatch(/ส่งมอบ|จัดส่ง|พัสดุ/)
        }
      }
    }
  })

  it('[blocker] ลำดับขั้นคงที่เสมอ — มีนัดได้ 4 ขั้น · walk-in ได้ 3 ขั้น (ไม่มี "ลูกค้ายืนยันนัด")', () => {
    /* 🛑 ใบ walk-in ไม่มีนัดให้ยืนยัน ⇒ ขั้นนั้นถูก **ตัดออก** ไม่ใช่แสดงจาง ๆ
       (หัวหน้าเห็นบนจอจริง 2026-08-29 แล้วสั่งตัด — ช่องที่บอกว่า "ไม่เกี่ยวกับคุณ"
       กินที่ของอีก 3 ขั้นที่เป็นเรื่องจริง โดยไม่ได้อะไรกลับมา)

       สิ่งที่ยังต้องคงที่คือ **ลำดับ** ไม่ใช่ **จำนวน** — ขั้นที่เหลือห้ามสลับที่กัน */
    const WITH_APPT = [...SERVICE_TIMELINE_LABELS]
    const WALK_IN = SERVICE_TIMELINE_LABELS.filter((l) => l !== BUYER_OK)

    for (const status of ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'] as const) {
      for (const appt of [null, 'SCHEDULED', 'CONFIRMED_BY_BUYER', 'RESCHEDULE_REQUESTED', 'COMPLETED', 'NO_SHOW'] as const) {
        for (const hasAppt of [true, false]) {
          const t = getServiceTimeline({
            status,
            serviceStart: BEFORE,
            appointmentStatus: appt,
            hasAppointment: hasAppt,
            now: NOW,
          })
          expect(labels(t), `${status}/${appt}/${hasAppt}`).toEqual(hasAppt ? WITH_APPT : WALK_IN)
        }
      }
    }
  })

  it('[blocker] ขั้น 1 เป็น done เสมอ — มีบิลแล้วถึงจะเปิดหน้านี้ได้', () => {
    for (const status of ['PENDING', 'SHIPPED', 'CONFIRMED', 'CANCELLED'] as const) {
      expect(stateOf(run({ status }), BOOKED), status).toBe('done')
    }
  })

  // ── ขั้น 2 · ลูกค้ายืนยันนัด ────────────────────────────────────────────
  it('[blocker] ไม่มีนัด → ขั้น "ลูกค้ายืนยันนัด" ต้องหายไปทั้งขั้น ไม่ใช่แสดงจาง ๆ', () => {
    /* งาน walk-in ไม่มีนัดให้ยืนยัน — ขั้นนี้ไม่มีอยู่จริงสำหรับใบนี้
       🛑 เช็ค `labels` ไม่ใช่ `stateOf` — `stateOf` คืน `undefined` ทั้งตอนที่ขั้นหายไปจริง
       และตอนที่ขั้นยังอยู่แต่เขียนป้ายผิด ⇒ ผ่านได้ด้วยเหตุผลที่ไม่ใช่สิ่งที่เทสอ้าง */
    const t = run({ hasAppointment: false, appointmentStatus: null, serviceStart: null })
    expect(labels(t)).not.toContain(BUYER_OK)
    expect(t).toHaveLength(3)
  })

  it('[blocker] walk-in ต้องไม่เหลือคำอธิบายที่พูดถึงนัด — ไม่มีขั้นแล้วก็ไม่ควรมีคำ', () => {
    /* เดิมขั้นที่ถูกตัดมี note "งานนี้ไม่ได้นัดล่วงหน้า" — ถ้าคำนั้นย้ายไปเกาะขั้นอื่น
       จะกลายเป็นคำอธิบายที่ไม่ตรงกับขั้นที่มันเกาะอยู่ (คลาสเดียวกับ note ที่ค้างบนใบยกเลิก) */
    const t = run({ hasAppointment: false, appointmentStatus: null, serviceStart: null })
    for (const s of t) expect(s.note ?? '', s.label).not.toMatch(/นัด/)
  })

  it('[blocker] มีนัด ยังไม่กด → เป็นขั้นปัจจุบัน (คนที่ต้องขยับคือลูกค้า)', () => {
    expect(stateOf(run(), BUYER_OK)).toBe('cur')
  })

  it('[blocker] buyerConfirmedAt มีค่า → done', () => {
    expect(stateOf(run({ buyerConfirmedAt: '2026-08-15T10:00:00+07:00' }), BUYER_OK)).toBe('done')
  })

  it('[blocker] appointmentStatus=CONFIRMED_BY_BUYER → done แม้ไม่มี buyerConfirmedAt', () => {
    /* สองสัญญาณนี้ควรมาคู่กัน แต่ข้อมูลเก่าก่อน 00024 มีเฉพาะสถานะ
       ยึดสัญญาณใดสัญญาณหนึ่งอย่างเดียว = ใบเก่าค้างเป็น "รอลูกค้า" ตลอดกาล */
    expect(stateOf(run({ appointmentStatus: 'CONFIRMED_BY_BUYER', buyerConfirmedAt: null }), BUYER_OK)).toBe('done')
  })

  it('[blocker] ร้านให้บริการไปแล้วแต่ลูกค้าไม่เคยกดยืนยันนัด → ขั้น 2 ต้อง "ข้าม" ไม่ใช่ค้างรอ', () => {
    /* 🛑 เคสที่พบบ่อยที่สุดในชีวิตจริง — ลูกค้าส่วนใหญ่ไม่กดยืนยันนัด แต่ก็มาตามนัด
       ถ้าปล่อยเป็น `cur`/`up` จะได้ไทม์ไลน์ที่ขั้นก่อนหน้ายังรอ ขณะที่ขั้นถัดไปเสร็จแล้ว */
    const t = run({ appointmentStatus: 'COMPLETED', buyerConfirmedAt: null, serviceStart: AFTER })
    expect(stateOf(t, SERVED)).toBe('done')
    expect(stateOf(t, BUYER_OK)).toBe('mute')
  })

  it('[blocker] ลูกค้ากดปิดงานแล้ว (CONFIRMED) แต่ไม่เคยยืนยันนัด → ขั้น 2 ต้องข้ามเช่นกัน', () => {
    const t = run({ status: 'CONFIRMED', appointmentStatus: 'SCHEDULED', buyerConfirmedAt: null })
    expect(stateOf(t, BUYER_OK)).toBe('mute')
  })

  // ── ขั้น 3 · ร้านให้บริการ ───────────────────────────────────────────────
  it('[blocker] ยังไม่ถึงเวลานัด → "ร้านให้บริการ" ต้องยังไม่ใช่ขั้นปัจจุบัน', () => {
    expect(stateOf(run({ serviceStart: BEFORE }), SERVED)).toBe('up')
  })

  it('[blocker] เลยเวลานัดมาแล้วแต่ร้านยังไม่กดปิดผล → กำลังถึงคิว', () => {
    /* ตัดสินจากเวลาที่ผ่านไป ไม่ใช่จากปุ่มที่ร้านกด — ร้านที่ยุ่งจะกดทีหลัง
       ถ้ารอปุ่ม ลูกค้าที่นั่งอยู่ในร้านจะเห็นว่า "ยังไม่ถึงคิว" ซึ่งขัดกับสิ่งที่เห็นด้วยตา */
    expect(stateOf(run({ serviceStart: AFTER }), SERVED)).toBe('cur')
  })

  it('[blocker] ปิดผลนัดแล้ว → done แม้ยังไม่ถึงเวลาที่นัดไว้', () => {
    expect(stateOf(run({ appointmentStatus: 'COMPLETED', serviceStart: BEFORE }), SERVED)).toBe('done')
  })

  it('[blocker] ลูกค้ายืนยันปิดงานแล้ว → ขั้น "ร้านให้บริการ" ต้อง done ตามไปด้วย', () => {
    /* ลูกค้ากดปิดงานได้ก็ต่อเมื่อได้รับบริการแล้ว — ร้านที่ลืมกดปิดผลนัดไม่ควรทำให้
       ไทม์ไลน์ของลูกค้าค้างย้อนหลัง */
    const t = run({ status: 'CONFIRMED', appointmentStatus: 'SCHEDULED' })
    expect(stateOf(t, SERVED)).toBe('done')
    expect(stateOf(t, DONE)).toBe('fin')
  })

  it('[blocker] งาน walk-in ที่ยังไม่ปิดผล → "ร้านให้บริการ" เป็นขั้นปัจจุบัน', () => {
    /* ไม่มีนัด = ลูกค้ายืนอยู่หน้าร้านแล้ว งานกำลังทำอยู่ ไม่ใช่ "ยังมาไม่ถึง" */
    const t = run({ hasAppointment: false, appointmentStatus: null, serviceStart: null })
    expect(stateOf(t, SERVED)).toBe('cur')
  })

  it('[blocker] ไม่มาตามนัด → ขั้น "ร้านให้บริการ" ต้องไม่ใช่ done (ไม่ได้ให้บริการ)', () => {
    const t = run({ appointmentStatus: 'NO_SHOW', serviceStart: AFTER })
    expect(stateOf(t, SERVED)).toBe('cx')
    expect(stateOf(t, DONE)).toBe('mute') // จะไม่มีการยืนยันปิดงานอีกแล้ว
  })

  // ── ขั้น 4 · ยืนยันเสร็จสิ้น ──────────────────────────────────────────────
  it('[blocker] ร้านปิดผลแล้วแต่ลูกค้ายังไม่กด → ขั้นสุดท้ายเป็นขั้นปัจจุบัน', () => {
    /* ถึงตาลูกค้าแล้ว — ถ้าเป็น `up` จะไม่มีอะไรบอกว่าเขาต้องทำอะไรต่อ */
    expect(stateOf(run({ appointmentStatus: 'COMPLETED' }), DONE)).toBe('cur')
  })

  it('[blocker] ยังไม่ได้ให้บริการ → ขั้นสุดท้ายต้องยังมาไม่ถึง', () => {
    expect(stateOf(run(), DONE)).toBe('up')
  })

  // ── ยกเลิก ──────────────────────────────────────────────────────────────
  it('[blocker] ยกเลิกตั้งแต่ยังไม่มีอะไรเกิด → หยุดที่ขั้น 2', () => {
    const t = run({ status: 'CANCELLED' })
    expect(stateOf(t, BOOKED)).toBe('done')
    expect(stateOf(t, BUYER_OK)).toBe('cx')
    expect(stateOf(t, SERVED)).toBe('mute')
    expect(stateOf(t, DONE)).toBe('mute')
  })

  it('[blocker] ยกเลิกหลังลูกค้ายืนยันนัดแล้ว → ขั้นที่ผ่านมาแล้วต้องยัง done', () => {
    /* 🛑 ขั้นที่เดินผ่านไปแล้วยังเป็นความจริง — ทาแดงทั้งเส้นทำให้ไทม์ไลน์บอกไม่ได้ว่า
       มันหยุดตรงไหน ซึ่งเป็นสิ่งเดียวที่ลูกค้าอยากรู้จากใบที่ถูกยกเลิก */
    const t = run({ status: 'CANCELLED', buyerConfirmedAt: '2026-08-15T10:00:00+07:00' })
    expect(stateOf(t, BOOKED)).toBe('done')
    expect(stateOf(t, BUYER_OK)).toBe('done')
    expect(stateOf(t, SERVED)).toBe('cx')
    expect(stateOf(t, DONE)).toBe('mute')
  })

  it('[blocker] ยกเลิก: มี cx ได้อย่างมากขั้นเดียว', () => {
    for (const appt of [null, 'SCHEDULED', 'CONFIRMED_BY_BUYER', 'COMPLETED', 'NO_SHOW'] as const) {
      for (const confirmedAt of [null, '2026-08-15T10:00:00+07:00']) {
        const t = getServiceTimeline({
          status: 'CANCELLED',
          serviceStart: BEFORE,
          appointmentStatus: appt,
          hasAppointment: appt != null,
          buyerConfirmedAt: confirmedAt,
          now: NOW,
        })
        expect(t.filter((s) => s.state === 'cx').length, `${appt}/${confirmedAt}`).toBeLessThanOrEqual(1)
        // และห้ามมี fin/cur ปนอยู่ในใบที่ยกเลิกแล้ว
        expect(t.some((s) => s.state === 'fin' || s.state === 'cur'), `${appt}/${confirmedAt}`).toBe(false)
      }
    }
  })

  // ── ความคงเส้นคงวาของทั้งเส้น ────────────────────────────────────────────
  it('[blocker] ห้ามมีขั้นที่ "รออยู่" อยู่ก่อนขั้นที่ทำเสร็จแล้ว', () => {
    /* กฎรวมของไทม์ไลน์ทั้งเส้น — จับเคสที่เทสรายขั้นข้างบนอาจไม่ครอบ
       (`mute` ไม่นับว่ารอ เพราะแปลว่า "ไม่เกี่ยวกับใบนี้/ถูกข้าม") */
    const WAITING = new Set(['cur', 'up'])
    for (const status of ['PENDING', 'SHIPPED', 'CONFIRMED'] as const) {
      for (const appt of [null, 'SCHEDULED', 'CONFIRMED_BY_BUYER', 'RESCHEDULE_REQUESTED', 'COMPLETED', 'NO_SHOW'] as const) {
        for (const start of [BEFORE, AFTER, null]) {
          for (const confirmedAt of [null, '2026-08-15T10:00:00+07:00']) {
            const t = getServiceTimeline({
              status,
              serviceStart: start,
              appointmentStatus: appt,
              hasAppointment: appt != null,
              buyerConfirmedAt: confirmedAt,
              now: NOW,
            })
            const lastDone = t.map((s) => s.state).lastIndexOf('done')
            const lastFin = t.map((s) => s.state).lastIndexOf('fin')
            const furthest = Math.max(lastDone, lastFin)
            for (let i = 0; i < furthest; i++) {
              expect(
                WAITING.has(t[i].state),
                `${status}/${appt}/${start}/${confirmedAt} — "${t[i].label}" เป็น ${t[i].state} ทั้งที่ขั้นหลังจบแล้ว`,
              ).toBe(false)
            }
          }
        }
      }
    }
  })
})

/**
 * บรรทัดอธิบายใต้ป้าย — ที่ที่สถานะซึ่ง "ไม่คู่ควรกับขั้นของตัวเอง" ไปอยู่
 *
 * 🛑 ตรวจ prod 2026-08-28: `RESCHEDULE_REQUESTED` และ `NO_SHOW` เป็น 0 ใบทั้งคู่
 * แต่โค้ดผลิตได้ทั้งสองค่า — "ยังไม่เคยเกิด" ไม่ใช่ "เกิดไม่ได้"
 */
describe('getServiceTimeline — บรรทัดอธิบาย (note)', () => {
  const noteOf = (s: ReturnType<typeof getServiceTimeline>, label: string) =>
    s.find((x) => x.label === label)?.note

  it('[blocker] ลูกค้าขอเลื่อนนัด → ต้องบอกบนจอ ไม่ใช่เงียบไปเป็น "รออยู่"', () => {
    const t = run({ appointmentStatus: 'RESCHEDULE_REQUESTED' })
    expect(noteOf(t, BUYER_OK)).toBe('ลูกค้าขอเลื่อนนัด')
  })

  it('[blocker] ไม่มาตามนัด → ต้องบอกเหตุผล ไม่ใช่แค่ทาสีว่าไม่สำเร็จ', () => {
    const t = run({ appointmentStatus: 'NO_SHOW', serviceStart: AFTER })
    expect(noteOf(t, SERVED)).toBe('ไม่มาตามนัด')
  })

  it('[blocker] งาน walk-in → ขั้นแรกที่ผู้ใช้เห็นต่อจาก "จองบริการ" คือ "ร้านให้บริการ"', () => {
    /* เดิมขั้นที่ถูกตัดถูกแทนด้วยคำว่า "งานนี้ไม่ได้นัดล่วงหน้า" — ตอนนี้ไม่มีทั้งขั้นและคำ
       ⇒ ต้องพิสูจน์ว่ารางยัง *เดินต่อได้ถูก* ไม่ใช่แค่ว่าขั้นหายไป */
    const t = run({ hasAppointment: false, appointmentStatus: null, serviceStart: null })
    expect(labels(t)).toEqual([BOOKED, SERVED, DONE])
  })

  it('[blocker] ใบที่ยกเลิกแล้ว ห้ามเหลือคำที่สั่งให้ผู้ใช้รอ/ทำอะไรต่อ', () => {
    /* คำอย่าง "รอยืนยันว่าจะมาตามนัด" เขียนไว้ตอนใบยังเดินอยู่ — ติดมากับใบที่ยกเลิกแล้ว
       คือบอกให้ผู้ใช้รอสิ่งที่จะไม่เกิดขึ้นอีก */
    for (const appt of [null, 'SCHEDULED', 'CONFIRMED_BY_BUYER', 'RESCHEDULE_REQUESTED', 'NO_SHOW'] as const) {
      const t = getServiceTimeline({
        status: 'CANCELLED',
        serviceStart: BEFORE,
        appointmentStatus: appt,
        hasAppointment: appt != null,
        now: NOW,
      })
      for (const s of t) {
        if (s.state === 'done') continue
        expect(s.note, `${appt} — "${s.label}"`).toBeUndefined()
      }
    }
  })

  it('[blocker] ราง **ไม่ผลิตเวลา** — เวลาแสดงที่การ์ดที่เป็นเจ้าของเรื่อง', () => {
    /* 🛑 เคยมี `atIso` ต่อขั้น แล้วถอดออก 2026-08-28 ด้วยเหตุผล 3 ข้อพร้อมกัน:
       · **ซ้ำ** — เวลาที่บิลถูกเปิดอยู่ในแถวสถานะแล้ว · เวลาที่ลูกค้ายืนยันนัดอยู่ใน
         การ์ดนัดหมายแล้ว ("คุณยืนยันนัดนี้แล้ว เมื่อ …")
       · **เล็กเกินอ่าน** — ในราง 4 คอลัมน์ที่จอ 360 มันเป็นข้อความเล็กสุดในหน้า (9px)
       · **มีได้แค่ 2 ใน 4 ขั้น** — ขั้น "ร้านให้บริการ" ไม่มีคอลัมน์เก็บเวลาในสคีมาเลย
         ⇒ รางที่ครึ่งหนึ่งมีเวลาครึ่งหนึ่งไม่มี อ่านเป็นข้อมูลหาย ไม่ใช่ข้อมูลที่ไม่มี

       ด่านนี้กันไม่ให้ใครเติมกลับโดยไม่ได้แก้ทั้ง 3 ข้อ */
    const step = run()[0] as Record<string, unknown>
    expect(step.atIso, 'รางต้องไม่มีฟิลด์เวลา').toBeUndefined()

    /* และต้องไม่มีขั้นไหนมีเลย ไม่ใช่แค่ขั้นแรก */
    const all = run({ appointmentStatus: 'COMPLETED', buyerConfirmedAt: '2026-08-15T03:00:00.000Z' })
    for (const s of all as unknown as Record<string, unknown>[]) {
      expect(s.atIso, `"${s.label}" ต้องไม่มีเวลา`).toBeUndefined()
    }
  })
})
