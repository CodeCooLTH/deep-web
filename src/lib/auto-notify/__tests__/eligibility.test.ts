import { describe, expect, it } from 'vitest'
import {
  autoNotifyStripState,
  evaluateAutoNotifyEligibility,
  isBackdatedForNotice,
  type AutoNotifyEligibilityInput,
  type AutoNotifyStripInput,
} from '../eligibility'

const ICT = (s: string) => Date.parse(`${s}+07:00`)
const NOW = ICT('2026-10-17T12:00:00.000')
const H = 3600_000

const base = (over: Partial<AutoNotifyEligibilityInput> = {}): AutoNotifyEligibilityInput => ({
  kind: 'ORDER_SUMMARY',
  vertical: 'ONLINE_SALES',
  switchEnabled: true,
  enabledAt: NOW - H,
  eventAt: NOW,
  conversationId: 'c1',
  isDryRun: false,
  ...over,
})
const why = (i: AutoNotifyEligibilityInput) => {
  const r = evaluateAutoNotifyEligibility(i)
  return r.eligible ? 'OK' : r.reason
}

describe('[blocker] evaluateAutoNotifyEligibility — เงื่อนไขร่วม', () => {
  it('ครบเงื่อนไข = ส่งได้', () => expect(why(base())).toBe('OK'))
  it('สวิตช์ปิด', () => expect(why(base({ switchEnabled: false }))).toBe('SWITCH_OFF'))
  it('เหตุการณ์ก่อน enabledAt (ขอบ: เท่ากันผ่าน, น้อยกว่า 1ms ตก) / ไม่เคยเปิด', () => {
    expect(why(base({ enabledAt: NOW }))).toBe('OK')
    expect(why(base({ enabledAt: NOW + 1 }))).toBe('BEFORE_ENABLED')
    expect(why(base({ enabledAt: null }))).toBe('BEFORE_ENABLED')
  })
  it('ไม่ผูกห้อง', () => {
    expect(why(base({ conversationId: null }))).toBe('NO_CONVERSATION')
    expect(why(base({ conversationId: '' }))).toBe('NO_CONVERSATION')
  })
  it('dry-run', () => expect(why(base({ isDryRun: true }))).toBe('DRY_RUN'))
  it('ย้อนหลัง (คนละวันไทย)', () => {
    expect(why(base({ createdAt: ICT('2026-10-16T18:00:00.000'), keyedInAt: NOW }))).toBe('BACKDATED')
  })
  it('ชนิดที่ vertical นี้ไม่มี', () => {
    expect(why(base({ vertical: 'SERVICE_QUEUE' }))).toBe('KIND_NOT_FOR_VERTICAL')
    expect(why(base({ kind: 'TRACKING', vertical: 'LODGING', trackingNo: 'TH1' }))).toBe('KIND_NOT_FOR_VERTICAL')
  })
})

describe('isBackdatedForNotice (D-13)', () => {
  it('วันเดียวกัน (คนละชั่วโมง) ไม่ใช่ย้อนหลัง', () => {
    expect(isBackdatedForNotice(ICT('2026-10-17T00:00:00.000'), ICT('2026-10-17T23:59:59.999'))).toBe(false)
  })
  it('ข้ามเที่ยงคืนไทย = ย้อนหลัง แม้ห่างกัน 1 นาที', () => {
    expect(isBackdatedForNotice(ICT('2026-10-16T23:59:30.000'), ICT('2026-10-17T00:00:30.000'))).toBe(true)
  })
  it('ใช้วันไทย ไม่ใช่ UTC: 06:00 ไทย กับ 20:00 ไทย (UTC เป็นคนละวัน/วันเดียวกัน) ', () => {
    // 2026-10-17 03:00 ICT = 10-16 20:00 UTC · 10-17 12:00 ICT = 10-17 05:00 UTC → UTC ต่างวัน แต่ไทยวันเดียวกัน
    expect(isBackdatedForNotice(ICT('2026-10-17T03:00:00.000'), ICT('2026-10-17T12:00:00.000'))).toBe(false)
  })
  it('ไม่ส่งวันที่มา = ไม่ย้อน', () => {
    expect(isBackdatedForNotice(null, NOW)).toBe(false)
    expect(isBackdatedForNotice(NOW, undefined)).toBe(false)
  })
})

describe('[blocker] เงื่อนไขเฉพาะชนิด', () => {
  it('ORDER_SUMMARY: โหมดแก้ไข / ไม่ใช่ PENDING', () => {
    expect(why(base({ mode: 'EDIT' }))).toBe('EDIT_MODE')
    expect(why(base({ orderStatus: 'PENDING' }))).toBe('OK')
    expect(why(base({ orderStatus: 'CANCELLED' }))).toBe('ORDER_NOT_PENDING')
  })
  const trk = (o: Partial<AutoNotifyEligibilityInput> = {}) => base({ kind: 'TRACKING', trackingNo: 'TH1', ...o })
  it('TRACKING: ต้องมีเลข · ไม่ FAILED · ไม่ CANCELLED · แก้ไขได้', () => {
    expect(why(trk())).toBe('OK')
    expect(why(trk({ mode: 'EDIT' }))).toBe('OK')
    expect(why(trk({ trackingNo: null }))).toBe('NO_TRACKING_NO')
    expect(why(trk({ trackingNo: '  ' }))).toBe('NO_TRACKING_NO')
    expect(why(trk({ shipmentFailed: true }))).toBe('SHIPMENT_FAILED')
    expect(why(trk({ orderStatus: 'CANCELLED' }))).toBe('ORDER_CANCELLED')
  })
  const bk = (o: Partial<AutoNotifyEligibilityInput> = {}) =>
    base({ kind: 'SERVICE_BOOKED', vertical: 'SERVICE_QUEUE', serviceStart: NOW + 2 * H, ...o })
  it('SERVICE_BOOKED: ต้องมีนัด · นัดต้องอยู่หลัง now · นัดไม่จบ', () => {
    expect(why(bk())).toBe('OK')
    expect(why(bk({ serviceStart: null }))).toBe('NO_APPOINTMENT')
    expect(why(bk({ serviceStart: NOW }))).toBe('APPOINTMENT_NOT_FUTURE') // walk-in เริ่มตอนนี้ (D-3)
    expect(why(bk({ serviceStart: NOW - H }))).toBe('APPOINTMENT_NOT_FUTURE')
    expect(why(bk({ serviceStart: NOW + 1 }))).toBe('OK')
    expect(why(bk({ appointmentStatus: 'COMPLETED' }))).toBe('APPOINTMENT_TERMINAL')
    expect(why(bk({ mode: 'EDIT' }))).toBe('EDIT_MODE')
  })
  const st = (o: Partial<AutoNotifyEligibilityInput> = {}) => base({ kind: 'SERVICE_STARTED', vertical: 'SERVICE_QUEUE', ...o })
  it('SERVICE_STARTED: ไม่ปิดแล้ว · ไม่ยกเลิก · นัดไม่จบ', () => {
    expect(why(st())).toBe('OK')
    expect(why(st({ serviceClosedAt: NOW - H }))).toBe('ALREADY_CLOSED')
    expect(why(st({ orderStatus: 'CANCELLED' }))).toBe('ORDER_CANCELLED')
    expect(why(st({ appointmentStatus: 'NO_SHOW' }))).toBe('APPOINTMENT_TERMINAL')
  })
  const cl = (o: Partial<AutoNotifyEligibilityInput> = {}) =>
    base({ kind: 'SERVICE_CLOSED', vertical: 'SERVICE_QUEUE', closeOutcome: 'SERVED', ...o })
  it('SERVICE_CLOSED: เฉพาะ SERVED (NO_SHOW/ไม่ระบุ ไม่ส่ง)', () => {
    expect(why(cl())).toBe('OK')
    expect(why(cl({ closeOutcome: 'NO_SHOW' }))).toBe('NOT_SERVED')
    expect(why(cl({ closeOutcome: null }))).toBe('NOT_SERVED')
    // ปิดงานเสร็จแล้ว nowMs ต้องไม่ทำให้ตกเงื่อนไขนัดในอนาคต (ใช้เฉพาะ BOOKED)
    expect(why(cl({ serviceStart: NOW - H }))).toBe('OK')
  })
})

describe('[blocker] autoNotifyStripState (TC-320)', () => {
  const strip = (over: Partial<AutoNotifyStripInput> = {}): AutoNotifyStripInput => {
    const { eventAt: _e, ...b } = base()
    return { ...b, channel: 'LINE', lastInboundAt: null, ...over }
  }
  const S = (o: Partial<AutoNotifyStripInput> = {}) => autoNotifyStripState(strip(o), NOW)

  it('ครบเงื่อนไข LINE/DEEP = WILL_SEND (ไม่ดูหน้าต่าง 24 ชม.)', () => {
    expect(S()).toBe('WILL_SEND')
    expect(S({ channel: 'DEEP', lastInboundAt: NOW - 100 * H })).toBe('WILL_SEND')
    expect(S({ channel: 'LINE', lastInboundAt: NOW - 100 * H })).toBe('WILL_SEND')
  })
  it('ไม่ผ่านเงื่อนไขร่วม = HIDDEN', () => {
    expect(S({ switchEnabled: false })).toBe('HIDDEN')
    expect(S({ conversationId: null })).toBe('HIDDEN')
    expect(S({ isDryRun: true })).toBe('HIDDEN')
    expect(S({ createdAt: ICT('2026-10-16T12:00:00.000'), keyedInAt: NOW })).toBe('HIDDEN')
    expect(S({ mode: 'EDIT' })).toBe('HIDDEN')
    expect(S({ enabledAt: NOW + H })).toBe('HIDDEN')
  })
  it('SERVICE_BOOKED: ไม่มีนัด / นัดไม่อยู่หลัง now = HIDDEN', () => {
    const k = { kind: 'SERVICE_BOOKED', vertical: 'SERVICE_QUEUE' } as const
    expect(S({ ...k, serviceStart: NOW + H })).toBe('WILL_SEND')
    expect(S({ ...k, serviceStart: null })).toBe('HIDDEN')
    expect(S({ ...k, serviceStart: NOW - H })).toBe('HIDDEN')
  })
  it('SERVICE_CLOSED ผล NO_SHOW = HIDDEN', () => {
    const k = { kind: 'SERVICE_CLOSED', vertical: 'SERVICE_QUEUE' } as const
    expect(S({ ...k, closeOutcome: 'SERVED' })).toBe('WILL_SEND')
    expect(S({ ...k, closeOutcome: 'NO_SHOW' })).toBe('HIDDEN')
  })
  it('Messenger/IG: 23:59 เปิด · 24:00 พอดีปิด · 24:01 ปิด · ไม่เคยมีข้อความลูกค้า = ปิด', () => {
    for (const channel of ['MESSENGER', 'INSTAGRAM'] as const) {
      expect(S({ channel, lastInboundAt: NOW - (24 * H - 60_000) })).toBe('WILL_SEND')
      expect(S({ channel, lastInboundAt: NOW - 24 * H })).toBe('WINDOW_CLOSED')
      expect(S({ channel, lastInboundAt: NOW - (24 * H + 60_000) })).toBe('WINDOW_CLOSED')
      expect(S({ channel, lastInboundAt: null })).toBe('WINDOW_CLOSED')
    }
  })
  it('HIDDEN ชนะ WINDOW_CLOSED (ไม่เข้าเงื่อนไขก็ไม่เตือนหน้าต่าง)', () => {
    expect(S({ channel: 'MESSENGER', lastInboundAt: null, switchEnabled: false })).toBe('HIDDEN')
  })
})

describe('TC-321 — แถบกับตัวส่งใช้ predicate เดียวกัน', () => {
  it('ชุดอินพุตเดียวกัน: HIDDEN ⇔ eligibility ไม่ผ่าน', () => {
    const inputs: AutoNotifyEligibilityInput[] = [
      base(),
      base({ switchEnabled: false }),
      base({ conversationId: null }),
      base({ isDryRun: true }),
      base({ mode: 'EDIT' }),
      base({ kind: 'TRACKING', trackingNo: null }),
      base({ kind: 'TRACKING', trackingNo: 'T1' }),
      base({ kind: 'SERVICE_BOOKED', vertical: 'SERVICE_QUEUE', serviceStart: NOW + H }),
      base({ kind: 'SERVICE_BOOKED', vertical: 'SERVICE_QUEUE', serviceStart: NOW - H }),
      base({ kind: 'SERVICE_CLOSED', vertical: 'SERVICE_QUEUE', closeOutcome: 'NO_SHOW' }),
    ]
    for (const i of inputs) {
      const { eventAt: _e, ...rest } = i
      const strip = autoNotifyStripState({ ...rest, eventAt: NOW, channel: 'DEEP', lastInboundAt: null }, NOW)
      expect(strip === 'HIDDEN').toBe(!evaluateAutoNotifyEligibility(i).eligible)
    }
  })
})
