import { describe, it, expect } from 'vitest'
import {
  flashStatusBadge, flashRowButtons, flashRowWarnings, flashKindBadge, webhookBlockState,
  connectNeedsWebhookStep, validateConnectForm, validateFlashSettings, canCopyIshipSender,
  pickupResultToShow, pickupModalState, overridableKinds, type SenderFields, type WebhookKindRow,
} from '../flash-settings-view'
import type { FlashSettings } from '@/services/flash.service'

const active = { connected: true, status: 'ACTIVE' as const, senderComplete: true, webhook: { status: 'REGISTERED' as const, registeredAt: null } }
const kind = (p: Partial<WebhookKindRow>): WebhookKindRow => ({ kind: 'status', state: 'EMPTY', action: 'SET', ...p })

describe('flash-settings-view', () => {
  it('ป้ายสถานะ: เขียวเฉพาะ ACTIVE, TOKEN_INVALID = warning ไม่ใช่แดง', () => {
    expect(flashStatusBadge({ connected: false, status: null }).tone).toBe('secondary')
    expect(flashStatusBadge({ connected: true, status: 'TOKEN_INVALID' }).tone).toBe('warning')
    expect(flashStatusBadge({ connected: true, status: 'ACTIVE' }).tone).toBe('success')
  })

  it('ปุ่มแถว: ไม่ใช่เจ้าของไม่เห็นเชื่อม/วางคีย์ใหม่ · เรียกรถหายเมื่อ key ถูกปฏิเสธ', () => {
    expect(flashRowButtons({ connected: false, status: null }, true).map((b) => b.action)).toEqual(['connect'])
    expect(flashRowButtons({ connected: false, status: null }, false)).toEqual([])
    expect(flashRowButtons({ connected: true, status: 'ACTIVE' }, true).map((b) => b.action)).toEqual(['pickup', 'settings'])
    const bad = flashRowButtons({ connected: true, status: 'TOKEN_INVALID' }, true)
    expect(bad.map((b) => b.action)).toEqual(['rekey', 'settings'])
    expect(flashRowButtons({ connected: true, status: 'TOKEN_INVALID' }, false).map((b) => b.action)).toEqual(['settings'])
    expect(flashRowButtons({ connected: true, status: 'ACTIVE' }, false)[1].label).toBe('ดูค่าที่ตั้งไว้')
  })

  it('บรรทัดเตือน: เรียบร้อย = ไม่มีเลย · ผู้ส่งไม่ครบ/webhook ค้าง = มี · ไม่ใช่เจ้าของไม่มีปุ่มแก้ผู้ส่ง', () => {
    expect(flashRowWarnings(active, true)).toEqual([])
    expect(flashRowWarnings({ ...active, senderComplete: false }, true)[0]).toMatchObject({ key: 'sender', actionLabel: 'ตั้งที่อยู่ผู้ส่ง' })
    expect(flashRowWarnings({ ...active, senderComplete: false }, false)[0].actionLabel).toBeNull()
    expect(flashRowWarnings({ ...active, webhook: { status: 'EXTERNAL', registeredAt: null } }, true)[0].key).toBe('webhook')
    expect(flashRowWarnings({ ...active, webhook: { status: 'NOT_SET', registeredAt: null } }, true)[0].text).toContain('ยังไม่ได้ตั้ง')
    // TOKEN_INVALID / ยังไม่เชื่อม = ไม่ซ้อนเตือนเพิ่ม
    expect(flashRowWarnings({ ...active, status: 'TOKEN_INVALID', senderComplete: false }, true)).toEqual([])
    expect(flashRowWarnings({ ...active, connected: false, senderComplete: false }, true)).toEqual([])
  })

  it('บล็อก webhook: REGISTERED บรรทัดเดียว · EXTERNAL เจ้าของรอรายชนิด · คนอื่นเห็นสรุปเท่านั้น', () => {
    expect(webhookBlockState('REGISTERED', null, true).kind).toBe('deep')
    expect(webhookBlockState('NOT_SET', null, true).kind).toBe('unset')
    expect(webhookBlockState('FAILED', null, false).kind).toBe('unset')
    expect(webhookBlockState('EXTERNAL', null, true).kind).toBe('loading')
    expect(webhookBlockState('EXTERNAL', null, false).kind).toBe('summary-external')
    const rows = [kind({ kind: 'status', state: 'EXTERNAL', action: 'SKIPPED', host: 'hooks.example.com' }), kind({ kind: 'price', state: 'UNKNOWN', action: 'SKIPPED' })]
    const s = webhookBlockState('EXTERNAL', rows, true)
    expect(s.kind === 'external' && s.overridable.map((k) => k.kind)).toEqual(['status'])
  })

  it('ป้ายรายชนิด: UNKNOWN ทับไม่ได้, EXTERNAL แสดงเฉพาะ host, SET/KEPT = ส่งมาที่ Deep (info ไม่ใช่เขียว)', () => {
    expect(flashKindBadge(kind({ state: 'UNKNOWN', action: 'SKIPPED' })).tone).toBe('secondary')
    expect(overridableKinds([kind({ state: 'UNKNOWN', action: 'SKIPPED' })])).toEqual([])
    expect(flashKindBadge(kind({ state: 'EXTERNAL', action: 'SKIPPED', host: 'h.example.com' })).text).toContain('h.example.com')
    expect(flashKindBadge(kind({ state: 'OTHER_DEEP', action: 'SET' }))).toEqual({ tone: 'info', text: 'ส่งมาที่ Deep' })
    expect(flashKindBadge(kind({ action: 'FAILED' })).text).toBe('ตั้งไม่สำเร็จ')
  })

  it('เชื่อมสำเร็จ: ค้างโมดัลเมื่อ EXTERNAL/FAILED เท่านั้น', () => {
    expect(connectNeedsWebhookStep({ status: 'EXTERNAL' })).toBe(true)
    expect(connectNeedsWebhookStep({ status: 'FAILED' })).toBe(true)
    expect(connectNeedsWebhookStep({ status: 'REGISTERED' })).toBe(false)
  })

  it('ฟอร์มวางคีย์: ข้อความตามสเปก', () => {
    expect(validateConnectForm({ mchId: '', secretKey: '' })).toContain('ให้ครบทั้งสองช่อง')
    expect(validateConnectForm({ mchId: 'a', secretKey: 'x'.repeat(20) })).toContain('2–32')
    expect(validateConnectForm({ mchId: 'AB1234', secretKey: 'short' })).toContain('สั้นเกินไป')
    expect(validateConnectForm({ mchId: 'AB1234', secretKey: 'abcd efgh ijkl mnop qrst' })).toContain('ช่องว่าง')
    expect(validateConnectForm({ mchId: 'AB1234', secretKey: 'x'.repeat(64) })).toBeNull()
  })

  const base: FlashSettings = {
    senderName: null, senderPhone: null, senderAddress: null, senderSubdistrict: null, senderDistrict: null,
    senderProvince: null, senderPostcode: null, defaultWeight: null, defaultWidth: null, defaultLength: null,
    defaultHeight: null, defaultCategoryId: null, optOnTime: false, optBoxShield: false, optIsInsured: false,
    optProductValue: null, defaultRemark: null, createMode: 'OFF', labelSize: 'BIG',
  }
  it('ตรวจค่าตั้งต้น: ว่างผ่านหมด · ประกันสินค้าต้องมีมูลค่า · ขนาดต้องจำนวนเต็ม', () => {
    expect(validateFlashSettings(base)).toEqual({})
    expect(validateFlashSettings({ ...base, optIsInsured: true }).optProductValue).toBeTruthy()
    expect(validateFlashSettings({ ...base, defaultWidth: 1.5 }).defaultWidth).toBeTruthy()
    expect(validateFlashSettings({ ...base, defaultWeight: 0 }).defaultWeight).toBeTruthy()
    expect(validateFlashSettings({ ...base, senderPostcode: '1011' }).senderPostcode).toBeTruthy()
    expect(validateFlashSettings({ ...base, senderPhone: '12345' }).senderPhone).toBeTruthy()
  })

  it('ปุ่มก๊อปจาก iShip: เจ้าของ + ที่อยู่ครบทั้ง 7 ช่องเท่านั้น', () => {
    const full: SenderFields = { senderName: 'ก', senderPhone: '0812345678', senderAddress: '1', senderSubdistrict: 'ต', senderDistrict: 'อ', senderProvince: 'จ', senderPostcode: '10110' }
    expect(canCopyIshipSender(true, full)).toBe(true)
    expect(canCopyIshipSender(false, full)).toBe(false)
    expect(canCopyIshipSender(true, null)).toBe(false)
    expect(canCopyIshipSender(true, { ...full, senderPostcode: null })).toBe(false)
  })

  it('เรียกรถ: ผลคำขอที่ล้ม/ปิดแล้วไม่โชว์ · สถานะโมดัลตามผู้ส่งและผลลัพธ์', () => {
    expect(pickupResultToShow(null)).toBeNull()
    expect(pickupResultToShow({ status: 'FAILED' })).toBeNull()
    expect(pickupResultToShow({ status: 'REQUESTED' })).not.toBeNull()
    const r = { id: '1', status: 'REQUESTED', ticketPickupId: null, staffName: null, staffPhone: null, timeoutAtText: null, ticketMessage: null, isDryRun: false }
    expect(pickupModalState(false, null)).toBe('incomplete')
    expect(pickupModalState(true, null)).toBe('form')
    expect(pickupModalState(false, r)).toBe('result')
  })
})
