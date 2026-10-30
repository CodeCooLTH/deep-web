/**
 * 00086 P3 (T6) — ชีต "เริ่มงาน / ทำเสร็จแล้ว" พร้อมรูป
 *
 * 🛑 [blocker] รูปค้าง/ล้ม หรือ บังคับรูปแต่ยังไม่มี → ห้ามยิง start/finish (สถานะงานต้องไม่เปลี่ยนโดยรูปไม่ครบ)
 * 🛑 [blocker] อัปผ่าน uploadToStorage(purpose IMAGE) เท่านั้น — ไม่ fetch endpoint อัปโหลดเอง (ตัวบีบรูปกลาง)
 * mutation ที่ต้องแดง: ลบ `failed` ออกจาก photoSheetSubmitState · ลบ needPhoto · เปลี่ยน purpose/ใส่ compress 'off'
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'

const uploadToStorage = vi.fn()
vi.mock('@/lib/upload-client', () => ({ uploadToStorage: (...a: unknown[]) => uploadToStorage(...a) }))

import ServiceJobPhotoSheet, {
  buildServiceJobStepRequest,
  photoSheetSubmitState,
  uploadServiceJobPhoto,
  type ServiceJobPhotoTile,
} from '../ServiceJobPhotoSheet'

type T = Pick<ServiceJobPhotoTile, 'status' | 'fileId'>
const done = (id: string): T => ({ status: 'done', fileId: id })
const up: T = { status: 'uploading', fileId: null }
const bad: T = { status: 'failed', fileId: null }

const req = (o: Partial<Parameters<typeof buildServiceJobStepRequest>[0]> = {}) =>
  buildServiceJobStepRequest({ orderToken: 'tok', phase: 'START', mode: 'OPTIONAL', tiles: [], note: '', submitting: false, ...o })

describe('photoSheetSubmitState / buildServiceJobStepRequest — ส่งได้เมื่อรูปครบเท่านั้น', () => {
  it('[blocker] REQUIRED ∧ 0 รูป → ปุ่ม disabled + ไม่มีคำขอ', () => {
    expect(photoSheetSubmitState({ mode: 'REQUIRED', tiles: [], submitting: false })).toMatchObject({ disabled: true, needPhoto: true })
    expect(req({ mode: 'REQUIRED' })).toBeNull()
    expect(req({ mode: 'REQUIRED', tiles: [done('a')] })).not.toBeNull()
  })
  it('[blocker] รูปล้มค้าง → ไม่มีคำขอ (start/finish ไม่ถูกยิง) แม้มีรูปอื่นสำเร็จ', () => {
    expect(photoSheetSubmitState({ mode: 'OPTIONAL', tiles: [done('a'), bad], submitting: false }).disabled).toBe(true)
    expect(req({ tiles: [done('a'), bad] })).toBeNull()
  })
  it('[blocker] รูปกำลังอัป → ไม่มีคำขอ', () => {
    expect(req({ tiles: [done('a'), up] })).toBeNull()
  })
  it('กำลังส่ง → disabled (กันกดซ้ำ)', () => {
    expect(photoSheetSubmitState({ mode: 'OPTIONAL', tiles: [], submitting: true }).disabled).toBe(true)
    expect(req({ submitting: true })).toBeNull()
  })
  it('OPTIONAL ไม่มีรูป → ส่งได้ (body ว่าง)', () => {
    const r = req()!
    expect(r.url).toBe('/api/orders/tok/start')
    expect(JSON.parse(String(r.init.body))).toEqual({})
  })
  it('ทำเสร็จ → /finish · รูปเรียงตามไทล์ · note ตัดช่องว่าง', () => {
    const r = req({ phase: 'FINISH', tiles: [done('a'), done('b')], note: '  ล้างเสร็จ  ' })!
    expect(r.url).toBe('/api/orders/tok/finish')
    expect(JSON.parse(String(r.init.body))).toEqual({ photoFileIds: ['a', 'b'], note: 'ล้างเสร็จ' })
  })
  it('NONE → ไม่ส่งคีย์รูปเลย · note ว่าง → ไม่ส่งคีย์ note', () => {
    expect(JSON.parse(String(req({ mode: 'NONE', note: '   ' })!.init.body))).toEqual({})
  })
})

describe('อัปโหลดผ่านตัวบีบรูปกลาง', () => {
  beforeEach(() => uploadToStorage.mockReset())
  it('[blocker] uploadServiceJobPhoto → uploadToStorage(file, { purpose: IMAGE }) ไม่ปิดการบีบ', async () => {
    uploadToStorage.mockResolvedValue({ fileId: 'k1' })
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    const onProgress = vi.fn()
    await expect(uploadServiceJobPhoto(file, { onProgress })).resolves.toMatchObject({ fileId: 'k1' })
    expect(uploadToStorage).toHaveBeenCalledTimes(1)
    const [f, opts] = uploadToStorage.mock.calls[0] as [File, Record<string, unknown>]
    expect(f).toBe(file)
    expect(opts.purpose).toBe('IMAGE')
    expect(opts.compress).toBeUndefined()
    expect(opts.onProgress).toBe(onProgress)
  })
  it('[grep guard] ไฟล์ชีตไม่เรียก endpoint อัปโหลดตรง และไม่มี capture', () => {
    const src = readFileSync(path.resolve(__dirname, '../ServiceJobPhotoSheet.tsx'), 'utf8')
    expect(src).not.toMatch(/\/api\/uploads?\//)
    expect(src).not.toMatch(/new FormData/)
    expect(src).not.toMatch(/\bcapture=/)
    expect(src).toMatch(/uploadToStorage\(file, \{ purpose: 'IMAGE'/)
  })
})

describe('ServiceJobPhotoSheet — markup', () => {
  const props = {
    open: true,
    onClose: () => {},
    orderToken: 'tok',
    orderLabel: 'DP2610-0012',
    summaryLine: 'ล้างแอร์ · คุณสมชาย',
    buyerVisible: true,
    onDone: () => {},
  }
  const render = (o: Partial<Parameters<typeof ServiceJobPhotoSheet>[0]>) =>
    renderToStaticMarkup(h(ServiceJobPhotoSheet, { ...props, phase: 'START', photoMode: 'OPTIONAL', ...o }))

  it('เริ่มงาน: หัว + ไทล์เพิ่มรูป accept image/* multiple ไม่มี capture + infobox แจ้ง', () => {
    const html = render({})
    expect(html).toContain('เริ่มงาน · DP2610-0012')
    expect(html).toContain('ล้างแอร์ · คุณสมชาย')
    expect(html).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*multiple/)
    expect(html).not.toContain('capture')
    expect(html).toContain('ไม่บังคับ · ลูกค้าเห็นรูปนี้')
    expect(html).toContain('แจ้งลูกค้าว่าเริ่มงานแล้ว')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
  })
  it('[blocker] REQUIRED ไม่มีรูป → ปุ่มหลัก disabled + "ถ่ายรูปอย่างน้อย 1 รูปก่อน"', () => {
    const html = render({ photoMode: 'REQUIRED' })
    expect(html).toContain('อย่างน้อย 1 รูป')
    expect(html).toContain('ถ่ายรูปอย่างน้อย 1 รูปก่อน')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*เริ่มงาน<\/button>/)
  })
  it('NONE → ไม่มีส่วนรูป มี infobox ไม่ใช้รูป · ปุ่มหลักกดได้', () => {
    const html = render({ photoMode: 'NONE' })
    expect(html).not.toContain('type="file"')
    expect(html).toContain('ไม่ใช้รูป')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*เริ่มงาน<\/button>/)
  })
  it('ทำเสร็จ: คำต่อเฟส + ส่งลิงก์รูปเมื่อลูกค้าเห็น · เห็นเฉพาะในร้านเมื่อปิดการมองเห็น', () => {
    const html = render({ phase: 'FINISH' })
    expect(html).toContain('ทำเสร็จแล้ว · DP2610-0012')
    expect(html).toContain('รูปหลังทำ')
    expect(html).toContain('ทำอะไรไปบ้าง')
    expect(html).toContain('บันทึกว่าทำเสร็จ')
    expect(html).toContain('ส่งลิงก์ดูรูปให้ลูกค้า')
    // critique P1-7 — เงื่อนไขจริง (ใบผูกแชท) ไม่ใช่ "ถ้าเปิดส่งอัตโนมัติไว้" (SERVICE_FINISHED ไม่มีสวิตช์ของตัวเอง)
    expect(html).toContain('ส่งลิงก์ดูรูปให้ลูกค้าในแชท (ถ้างานนี้มีแชทกับลูกค้า)')
    expect(html).not.toContain('ส่งลิงก์ดูรูปให้ลูกค้า (ถ้าเปิดส่งอัตโนมัติไว้)')
    // critique P2 — ปุ่มยกเลิกล้อ "ยังไม่ปิด" ของชีตปิดงาน
    expect(html).toContain('ยังไม่บันทึก')
    expect(html).not.toContain('ยังก่อน')
    const priv = render({ phase: 'FINISH', buyerVisible: false })
    expect(priv).toContain('เห็นเฉพาะในร้าน')
    expect(priv).not.toContain('ส่งลิงก์ดูรูปให้ลูกค้า')
  })
  it('เริ่มงาน: ปุ่มยกเลิก = "ยังไม่เริ่ม" (critique P2)', () => {
    const html = render({})
    expect(html).toContain('ยังไม่เริ่ม')
    expect(html).not.toContain('ยังก่อน')
  })
  it('ปิดอยู่ → ไม่ render', () => {
    expect(render({ open: false })).toBe('')
  })
})
