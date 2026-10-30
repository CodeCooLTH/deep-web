/**
 * 00086 P3 (S-6/8/9 · BRD §8.1/§8.2 · FR-011) — ปุ่มบนการ์ด "งานนี้" + กติการูป + ข้อความ error
 *
 * serviceJobCardButtons เป็นที่ตัดสินเดียวของปุ่ม (docs/conventions/ui-boolean-needs-a-testable-home.md)
 * mutation ที่ต้องแดง:
 *  - start กลับไปอ่าน canClose                     → "[blocker] start ไม่อ่าน canClose"
 *  - ถอด actorOk ออกจาก start/finish                → "ช่างล้วน: งานของคนอื่น/ยังไม่มีคนรับ เริ่ม/ทำเสร็จไม่ได้"
 *  - ถอด `isAssignee && finished` ออกจาก close      → "ช่างล้วนปิดได้เฉพาะงานตัวเองที่ทำเสร็จแล้ว"
 *  - assertServiceJobPhotoInput ไม่เช็ก REQUIRED/NONE → "กติการูป"
 */
import { describe, expect, it } from 'vitest'

import {
  SERVICE_JOB_ERROR_MESSAGE,
  SERVICE_JOB_MAX_PHOTOS,
  SERVICE_JOB_NOTE_MAX,
  SERVICE_JOB_PHOTO_MODES,
  ServiceJobAlreadyAssignedError,
  ServiceJobNotAssigneeError,
  ServiceJobPhotoRequiredError,
  ServiceJobPhotosDisabledError,
  ServiceJobTooManyPhotosError,
  assertServiceJobPhotoInput,
  serviceJobCardButtons,
  serviceJobErrorMessage,
} from '../service-job'

type In = Parameters<typeof serviceJobCardButtons>[0]
const full = (o: Partial<In> = {}): In => ({
  canStart: true,
  canClose: true,
  closable: true,
  started: false,
  notStarted: false,
  canFinish: true,
  canClaim: false,
  technicianOnly: false,
  finished: false,
  assigned: false,
  isAssignee: false,
  ...o,
})
const btn = (o: Partial<In> = {}) => serviceJobCardButtons(full(o))

describe('serviceJobCardButtons — ทุกชุดของ canStart/canFinish/canClose × ช่างล้วน × เริ่ม/เสร็จ × ของใคร', () => {
  const bools = [true, false]
  const cases: In[] = []
  for (const canStart of bools)
    for (const canFinish of bools)
      for (const canClose of bools)
        for (const technicianOnly of bools)
          for (const started of bools)
            for (const finished of bools)
              for (const owner of ['none', 'me', 'other'] as const) {
                if (finished && !started) continue // CHECK ฐาน: ทำเสร็จได้ต้องเริ่มแล้ว
                cases.push(
                  full({
                    canStart,
                    canFinish,
                    canClose,
                    technicianOnly,
                    canClaim: technicianOnly,
                    started,
                    finished,
                    assigned: owner !== 'none',
                    isAssignee: owner === 'me',
                  }),
                )
              }

  it.each(cases.map((c) => [JSON.stringify(c), c] as const))('%s', (_, c) => {
    const r = serviceJobCardButtons(c)
    const mine = !c.technicianOnly || (c.assigned === true && c.isAssignee === true)
    // [blocker] start อ่าน canStart เท่านั้น ไม่อ่าน canClose (P2 · FR-005)
    expect(r.start).toBe(c.canStart && !c.started && mine)
    expect(r.finish).toBe(c.canFinish === true && c.started && !c.finished && mine)
    expect(r.close).toBe(c.canClose && (!c.technicianOnly || (c.isAssignee === true && c.finished === true)))
    expect(r.claim).toBe(c.technicianOnly === true && !c.assigned)
    expect(r.notAssigneeNote).toBe(c.technicianOnly === true && c.assigned === true && !c.isAssignee)
    // ไม่มีปุ่มไหนขึ้นพร้อมกับกล่อง "งานนี้เป็นของ …"
    if (r.notAssigneeNote) expect([r.start, r.finish, r.close, r.claim]).toEqual([false, false, false, false])
  })
})

describe('serviceJobCardButtons — เคสที่ต้องอ่านออกด้วยตา', () => {
  it('[blocker] start ไม่อ่าน canClose: เริ่มได้แต่ปิดไม่ได้ ยังมีปุ่มเริ่ม', () => {
    expect(btn({ canClose: false })).toMatchObject({ start: true, close: false })
    expect(btn({ canStart: false })).toMatchObject({ start: false, close: true })
  })

  it('ช่างล้วน · ยังไม่มีคนรับ → "รับงานนี้" แทนปุ่มเริ่ม', () => {
    expect(btn({ technicianOnly: true, canClaim: true })).toMatchObject({ claim: true, start: false, notAssigneeNote: false })
  })

  it('ช่างล้วน · งานของคนอื่น → กล่อง "งานนี้เป็นของ …" ไม่มีปุ่มเริ่ม/ทำเสร็จ/ปิด/รับ', () => {
    const r = btn({ technicianOnly: true, canClaim: true, assigned: true, isAssignee: false, started: true, finished: true })
    expect(r).toMatchObject({ start: false, finish: false, close: false, claim: false, notAssigneeNote: true, closeBlockedNote: 'NONE' })
  })

  it('ช่างล้วน · งานของตัวเอง: เริ่ม → ทำเสร็จ → ปิด (ปิดได้หลังทำเสร็จเท่านั้น · TD-004)', () => {
    const me = { technicianOnly: true, canClaim: true, assigned: true, isAssignee: true }
    expect(btn(me)).toMatchObject({ start: true, finish: false, close: false, claim: false })
    expect(btn({ ...me, started: true })).toMatchObject({ startedNote: true, finish: true, close: false })
    expect(btn({ ...me, started: true, finished: true })).toMatchObject({ finish: false, close: true, closeBlockedNote: 'NONE' })
  })

  it('FR-011: ช่างล้วนทำเสร็จแล้วแต่ไม่มีสิทธิ์ปิด → TECH_END ("ส่งงานแล้ว · รอ…ปิดงาน")', () => {
    const r = btn({ technicianOnly: true, assigned: true, isAssignee: true, started: true, finished: true, canClose: false })
    expect(r).toMatchObject({ close: false, closeBlockedNote: 'TECH_END' })
  })

  it('FR-011: คนที่ไม่ใช่ช่างล้วนและปิดไม่ได้ → NO_RIGHT · ยังไม่ทำเสร็จ → ไม่มีกล่อง', () => {
    expect(btn({ started: true, finished: true, canClose: false })).toMatchObject({ closeBlockedNote: 'NO_RIGHT' })
    expect(btn({ started: true, finished: false, canClose: false })).toMatchObject({ closeBlockedNote: 'NONE' })
  })

  it('FR-010: คนที่ปิดได้ (ไม่ใช่ช่างล้วน) ปิดก่อนเริ่ม/ก่อนทำเสร็จได้เหมือนเดิม', () => {
    expect(btn({ started: false })).toMatchObject({ close: true })
    expect(btn({ started: true, finished: false })).toMatchObject({ close: true })
  })

  it('งานปิดไม่ได้ (ปิดแล้ว/ยกเลิก) → ไม่มีอะไรเลย', () => {
    const r = btn({ closable: false, technicianOnly: true, canClaim: true, started: true, finished: true, assigned: true })
    expect(r).toEqual({ startedNote: false, start: false, finish: false, claim: false, close: false, notAssigneeNote: false, closeBlockedNote: 'NONE' })
  })

  it('isAssignee โดยไม่มีผู้รับผิดชอบ (ข้อมูลขัดกัน) ไม่ถือว่าเป็นงานของตัวเอง', () => {
    expect(btn({ technicianOnly: true, assigned: false, isAssignee: true })).toMatchObject({ start: false })
  })

  it('ไม่ส่ง input ของ P3 = ปุ่มใหม่ไม่ขึ้น (การ์ดรุ่น P2 ทำงานเหมือนเดิม)', () => {
    const r = serviceJobCardButtons({ canStart: true, canClose: true, closable: true, started: true, notStarted: false })
    expect(r).toEqual({ startedNote: true, start: false, finish: false, claim: false, close: true, notAssigneeNote: false, closeBlockedNote: 'NONE' })
  })
})

describe('กติการูป (assertServiceJobPhotoInput)', () => {
  const ten = Array.from({ length: SERVICE_JOB_MAX_PHOTOS }, (_, i) => `f${i}`)
  it('REQUIRED: ไม่มีรูป → PhotoRequired · มีรูปผ่าน', () => {
    expect(() => assertServiceJobPhotoInput('REQUIRED', [])).toThrow(ServiceJobPhotoRequiredError)
    expect(() => assertServiceJobPhotoInput('REQUIRED', ['a'])).not.toThrow()
  })
  it('OPTIONAL: มี/ไม่มีรูปผ่าน', () => {
    expect(() => assertServiceJobPhotoInput('OPTIONAL', [])).not.toThrow()
    expect(() => assertServiceJobPhotoInput('OPTIONAL', ten)).not.toThrow()
  })
  it('NONE: มีรูป → PhotosDisabled · ไม่มีรูปผ่าน', () => {
    expect(() => assertServiceJobPhotoInput('NONE', ['a'])).toThrow(ServiceJobPhotosDisabledError)
    expect(() => assertServiceJobPhotoInput('NONE', [])).not.toThrow()
  })
  it('เกิน 10 → TooManyPhotos (ทุกโหมด)', () => {
    for (const m of SERVICE_JOB_PHOTO_MODES) expect(() => assertServiceJobPhotoInput(m, [...ten, 'x'])).toThrow(ServiceJobTooManyPhotosError)
  })
  it('ค่าคงที่ตรง CHECK ของฐาน (migration 20261027100400/100500)', () => {
    expect(SERVICE_JOB_PHOTO_MODES).toEqual(['REQUIRED', 'OPTIONAL', 'NONE'])
    expect(SERVICE_JOB_MAX_PHOTOS).toBe(10)
    expect(SERVICE_JOB_NOTE_MAX).toBe(1000)
  })
})

describe('ข้อความ error (ภาษาธุรกิจ · ใส่ชื่อคน)', () => {
  it('ทุกรหัสของ error ใหม่มีคำไทย', () => {
    for (const code of [
      'SERVICE_JOB_NOT_ASSIGNEE',
      'SERVICE_JOB_UNASSIGNED',
      'SERVICE_JOB_NOT_STARTED',
      'SERVICE_JOB_NOT_FINISHED',
      'SERVICE_JOB_ALREADY_ASSIGNED',
      'SERVICE_JOB_PHOTO_REQUIRED',
      'SERVICE_JOB_PHOTOS_DISABLED',
      'SERVICE_JOB_PHOTO_MISSING',
      'SERVICE_JOB_TOO_MANY_PHOTOS',
      'ASSIGNEE_NOT_TECHNICIAN',
    ]) {
      expect(SERVICE_JOB_ERROR_MESSAGE[code], code).toMatch(/[ก-๙]/)
    }
  })
  it('NOT_ASSIGNEE ใส่ชื่อ + คำกริยาตามการกระทำ (FR-009 "งานนี้เป็นของ …")', () => {
    expect(serviceJobErrorMessage('SERVICE_JOB_NOT_ASSIGNEE', { assigneeName: 'ช่างนิด' })).toBe(
      'งานนี้เป็นของ ช่างนิด · เริ่มงานได้เฉพาะผู้รับผิดชอบ',
    )
    expect(serviceJobErrorMessage('SERVICE_JOB_NOT_ASSIGNEE', { assigneeName: 'ช่างนิด', action: 'CLOSE' })).toBe(
      'งานนี้เป็นของ ช่างนิด · ปิดงานได้เฉพาะผู้รับผิดชอบ',
    )
    expect(serviceJobErrorMessage('SERVICE_JOB_NOT_ASSIGNEE', { assigneeName: '  ' })).toBe(SERVICE_JOB_ERROR_MESSAGE.SERVICE_JOB_NOT_ASSIGNEE)
  })
  it('ALREADY_ASSIGNED ใส่ชื่อคนที่รับไปแล้ว', () => {
    expect(serviceJobErrorMessage('SERVICE_JOB_ALREADY_ASSIGNED', { assigneeName: 'ช่างต้น' })).toBe('มีคนรับงานนี้แล้ว · ช่างต้น')
  })
  it('error class พกชื่อ/รหัสไว้ให้ route', () => {
    const e = new ServiceJobNotAssigneeError('ช่างนิด', 'FINISH')
    expect([e.message, e.assigneeName, e.action]).toEqual(['SERVICE_JOB_NOT_ASSIGNEE', 'ช่างนิด', 'FINISH'])
    expect(new ServiceJobAlreadyAssignedError(null).message).toBe('SERVICE_JOB_ALREADY_ASSIGNED')
  })
})

// 00086 FR-011 — ไม่มี O5 ไม่พูดเรื่องเงินในชีตปิดงาน
describe('serviceCloseFootnote', () => {
  it('เห็นเงิน = ข้อความเดิมตรงตัว · ไม่เห็นเงิน = ไม่มีคำว่าการเงิน', async () => {
    const { serviceCloseFootnote } = await import('@/lib/service-job')
    expect(serviceCloseFootnote(true)).toBe('ปิดงานแล้วยอดเข้าการเงินร้านทันที · ลูกค้ายืนยันรับบริการเพื่อขึ้นหน้าร้านและรีวิว')
    expect(serviceCloseFootnote(false)).toBe('ลูกค้ายืนยันรับบริการเพื่อขึ้นหน้าร้านและรีวิว')
    expect(serviceCloseFootnote(false)).not.toContain('การเงิน')
  })
})
