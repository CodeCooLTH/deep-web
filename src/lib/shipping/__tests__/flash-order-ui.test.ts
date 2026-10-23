import { describe, it, expect } from 'vitest'
import {
  FLASH_COD_NOTICE, codNoticeText, entryMode, flashOffered, singleTierSegments, providerOf, isLinkMethod,
  methodFor, shipmentLock, initialMethod, showEntrySegmented, flashFailedView, pnoFormatError, pnoStep,
  linkErrorText, cancelOutcome, flashItemNotices, flashPriceState, flashPriceBadge, flashPriceSubline,
  markerReasonLine, PROVIDER_CHOICES,
} from '../flash-order-ui'

describe('ป้าย COD ถาวร', () => {
  it('ข้อความตรงตัว BRD และแสดงเฉพาะ Flash + COD', () => {
    expect(FLASH_COD_NOTICE).toBe('Flash ไม่แจ้งการโอนเงิน COD — ตรวจยอดกับ Flash แล้วกดยืนยันรับเงินเอง')
    expect(codNoticeText('FLASH', 890)).toBe(FLASH_COD_NOTICE)
    expect(codNoticeText('FLASH', 0)).toBeNull()
    expect(codNoticeText('ISHIP', 890)).toBeNull()
  })
})

describe('ชั้นเลือกผู้ให้บริการ', () => {
  it('entryMode: สองชั้นเฉพาะเมื่อเชื่อมทั้งสอง', () => {
    expect(entryMode(true, true)).toBe('both')
    expect(entryMode(true, false)).toBe('iship')
    expect(entryMode(false, true)).toBe('flash')
    expect(entryMode(false, false)).toBe('manual-only')
  })
  it('flashOffered: key ถูกปฏิเสธยังเสนอ (แผงบอกให้วางคีย์ใหม่) แต่ถอนแล้วไม่เสนอ', () => {
    expect(flashOffered('READY')).toBe(true)
    expect(flashOffered('TOKEN_INVALID')).toBe(true)
    expect(flashOffered('DISCONNECTED')).toBe(false)
    expect(flashOffered('NOT_CONNECTED')).toBe(false)
    expect(flashOffered(undefined)).toBe(false)
  })
  it('ร้าน iShip เจ้าเดียว: segmented เดิมทุกตัวอักษร', () => {
    expect(singleTierSegments('iship').map((s) => s.label)).toEqual(['ส่งเอง', 'สร้างพัสดุ iShip', 'เลือกจาก iShip'])
    expect(singleTierSegments('flash').map((s) => s.label)).toEqual(['ส่งเอง', 'สร้างพัสดุ Flash', 'ผูกเลขพัสดุ Flash'])
  })
  it('ป้ายช่อง Flash ชั้น 1 เต็ม', () => {
    expect(PROVIDER_CHOICES.map((c) => c.label)).toEqual(['ส่งเอง', 'iShip', 'Flash (บัญชีของร้านเอง)'])
  })
  it('providerOf / methodFor / isLinkMethod ไปกลับได้', () => {
    for (const m of ['MANUAL', 'ISHIP', 'ISHIP_LINK', 'FLASH', 'FLASH_LINK'] as const) {
      expect(methodFor(providerOf(m)!, isLinkMethod(m))).toBe(m)
    }
    expect(providerOf(null)).toBeNull()
  })
  it('ไม่ preselect เมื่อมีสองเจ้าและยังไม่มีพัสดุ', () => {
    expect(initialMethod('both', shipmentLock(null))).toBeNull()
    expect(initialMethod('iship', shipmentLock(null))).toBe('MANUAL')
    expect(initialMethod('flash', shipmentLock(null))).toBe('MANUAL')
  })
  it('มีพัสดุ live → เข้าโหมดของเจ้านั้น ซ่อนแถบเลือก', () => {
    const live = shipmentLock({ provider: 'FLASH', status: 'CREATED', isDryRun: false })
    expect(initialMethod('both', live)).toBe('FLASH')
    expect(showEntrySegmented('both', live)).toBe(false)
    expect(initialMethod('both', shipmentLock({ provider: 'ISHIP', status: 'CREATED', isDryRun: false }))).toBe('ISHIP')
  })
  it('iShip ใบล้มเหลวคงพฤติกรรมเดิม (MANUAL + แถบเลือกยังอยู่) · Flash ล้มเหลวเข้า FLASH', () => {
    const failedIship = shipmentLock({ provider: 'ISHIP', status: 'FAILED' })
    expect(initialMethod('iship', failedIship)).toBe('MANUAL')
    expect(showEntrySegmented('iship', failedIship)).toBe(true)
    const failedFlash = shipmentLock({ provider: 'FLASH', status: 'FAILED' })
    expect(initialMethod('both', failedFlash)).toBe('FLASH')
    expect(showEntrySegmented('both', failedFlash)).toBe(true)
  })
  it('NEEDS_REVIEW ล็อกแถบเลือก (กันเปิดใบที่สองก่อนจัดการ)', () => {
    const review = shipmentLock({ provider: 'FLASH', status: 'NEEDS_REVIEW' })
    expect(showEntrySegmented('both', review)).toBe(false)
    expect(initialMethod('both', review)).toBe('FLASH')
  })
  it('ใบจำลอง (dry-run) ไม่ใช่ live', () => {
    expect(shipmentLock({ provider: 'ISHIP', status: 'CREATED', isDryRun: true }).kind).toBe('none')
  })
  it('ร้านไม่เชื่อมเจ้าไหน ไม่มีแถบเลือก', () => {
    expect(showEntrySegmented('manual-only', shipmentLock(null))).toBe(false)
  })
})

describe('flashFailedView', () => {
  it('ปุ่มทึบมีใบเดียว/ไม่มีใบ ตามหมวด', () => {
    expect(flashFailedView('UPSTREAM_TIMEOUT', true)).toMatchObject({ kind: 'retry', solid: 'retry', ghostRetry: false, offerSelfShip: true })
    expect(flashFailedView('SENDER_ADDRESS_INVALID', true)).toMatchObject({ kind: 'fix-sender', solid: 'edit-sender', ghostRetry: true })
    expect(flashFailedView('SENDER_OUT_OF_AREA', false).kind).toBe('fix-sender')
    expect(flashFailedView('RECEIVER_ADDRESS_INVALID', true)).toMatchObject({ kind: 'fix-receiver', solid: 'edit-receiver' })
    expect(flashFailedView('POSTCODE_INVALID', true).kind).toBe('fix-receiver')
  })
  it('1008 COD: ไม่มีปุ่มทึบ (BR-FLASH-27) มี ghost ลองใหม่ + ส่งเองแทน', () => {
    expect(flashFailedView('COD_NOT_ENABLED', true)).toMatchObject({ kind: 'cod', solid: 'none', ghostRetry: true, offerSelfShip: true })
  })
  it('key: เจ้าของเห็นปุ่มวางคีย์ใหม่ ไม่ใช่เจ้าของเห็นข้อความ และไม่มีปุ่มลองใหม่ทั้งคู่', () => {
    expect(flashFailedView('SIGN_INVALID', true)).toMatchObject({ solid: 'rekey', ghostRetry: false, nonOwnerHint: null })
    expect(flashFailedView('MERCHANT_NOT_FOUND', false)).toMatchObject({ solid: 'none', ghostRetry: false, nonOwnerHint: 'แจ้งเจ้าของร้านให้วางคีย์ใหม่' })
  })
  it('รหัสไม่รู้จัก/null → retry; INVALID_REQUEST ใช้ข้อความจริงของใบ', () => {
    expect(flashFailedView(null, true).kind).toBe('retry')
    expect(flashFailedView('WHATEVER', true).kind).toBe('retry')
    expect(flashFailedView('INVALID_REQUEST', true, 'มูลค่าที่เอาประกันไม่ถูกต้อง')).toMatchObject({ kind: 'fix-data', message: 'มูลค่าที่เอาประกันไม่ถูกต้อง' })
  })
})

describe('ผูกเลขพัสดุ', () => {
  it('รูปแบบเลข 6–32 ตัวอักษร/ตัวเลข ไม่มีช่องว่าง', () => {
    expect(pnoFormatError('TH0123456789')).toBeNull()
    expect(pnoFormatError('  TH0123456789 ')).toBeNull()
    expect(pnoFormatError('TH 01')).not.toBeNull()
    expect(pnoFormatError('AB12')).not.toBeNull()
    expect(pnoFormatError('')).not.toBeNull()
    expect(pnoFormatError('A'.repeat(33))).not.toBeNull()
  })
  it('ปุ่มยืนยันผูก (ready) ปรากฏหลังตรวจเลขตัวที่พิมพ์อยู่เท่านั้น', () => {
    expect(pnoStep({ pno: 'TH0123456789', previewedPno: null, checking: false })).toBe('enter')
    expect(pnoStep({ pno: 'TH0123456789', previewedPno: null, checking: true })).toBe('checking')
    expect(pnoStep({ pno: 'TH0123456789', previewedPno: 'TH0123456789', checking: false })).toBe('ready')
    expect(pnoStep({ pno: ' TH0123456789 ', previewedPno: 'TH0123456789', checking: false })).toBe('ready')
    // แก้เลขหลังตรวจ → ต้องตรวจใหม่
    expect(pnoStep({ pno: 'TH0123456780', previewedPno: 'TH0123456789', checking: false })).toBe('enter')
    expect(pnoStep({ pno: '', previewedPno: '', checking: false })).toBe('enter')
  })
  it('ข้อความผิดพลาดตามสเปก', () => {
    expect(linkErrorText(422, 'NOT_MERCHANT_PARCEL')).toBe('เลขนี้ไม่ใช่ของบัญชี Flash ของร้านนี้ ตรวจว่าคัดลอกถูกใบ')
    expect(linkErrorText(404, 'PARCEL_NOT_FOUND')).toBe('Flash ไม่พบเลขพัสดุนี้ ตรวจตัวอักษรอีกครั้ง')
    expect(linkErrorText(409, 'PNO_TAKEN')).toBe('เลขนี้ผูกกับคำสั่งซื้ออื่นใน Deep แล้ว ตรวจเลขอีกครั้ง')
    expect(linkErrorText(504, 'UPSTREAM_TIMEOUT')).toBe('ติดต่อ Flash ไม่ได้ตอนนี้ ลองตรวจเลขอีกครั้ง')
    expect(linkErrorText(502, null)).toBe('ติดต่อ Flash ไม่ได้ตอนนี้ ลองตรวจเลขอีกครั้ง')
    expect(linkErrorText(409, 'OTHER', 'ข้อความเซิร์ฟเวอร์')).toBe('ข้อความเซิร์ฟเวอร์')
  })
})

describe('cancelOutcome', () => {
  it('1015 (409 NOT_CANCELLABLE) = taken → Swal ไม่ใช่ toast', () => {
    expect(cancelOutcome(true, 200, null)).toBe('cancelled')
    expect(cancelOutcome(false, 409, 'NOT_CANCELLABLE')).toBe('taken')
    expect(cancelOutcome(false, 409, 'INVALID_STATE')).toBe('error')
    expect(cancelOutcome(false, 500, null)).toBe('error')
  })
})

describe('ฟอร์มสร้าง', () => {
  it('รายการเกิน 10 → แจ้งรวม · จำนวนเกิน 999 → บล็อก', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `n${i}`, qty: 1 }))
    expect(flashItemNotices(many)).toEqual({ overflow: true, blockedBy: null })
    expect(flashItemNotices(many.slice(0, 10)).overflow).toBe(false)
    expect(flashItemNotices([{ name: 'ถุงผ้า', qty: 1000 }]).blockedBy).toBe('ถุงผ้า')
    expect(flashItemNotices([{ name: 'ถุงผ้า', qty: 999 }]).blockedBy).toBeNull()
  })
  it('สถานะแถวราคา', () => {
    expect(flashPriceState({ ready: false, loading: false, hasQuote: false, hasError: false })).toBe('incomplete')
    expect(flashPriceState({ ready: true, loading: true, hasQuote: false, hasError: false })).toBe('loading')
    expect(flashPriceState({ ready: true, loading: true, hasQuote: true, hasError: false })).toBe('quote')
    expect(flashPriceState({ ready: true, loading: false, hasQuote: false, hasError: true })).toBe('error')
  })
  it('ตกราคามาตรฐาน ห้ามติดป้ายราคาสัญญา', () => {
    expect(flashPriceBadge('CONTRACT').label).toBe('ราคาสัญญา')
    expect(flashPriceBadge('STANDARD').label).toBe('ราคามาตรฐาน')
    expect(flashPriceSubline('STANDARD')).toContain('ใช้ราคามาตรฐาน Flash ยังไม่ตอบราคาสัญญาของบัญชีนี้')
  })
})

describe('markerReasonLine', () => {
  const traces = [
    { occurredAt: '2026-10-22T08:00:00Z', statusDesc: 'ผู้รับขอเลื่อนวันรับ' },
    { occurredAt: '2026-10-22T10:00:00Z', statusDesc: 'ผู้รับไม่อยู่หรือติดต่อไม่ได้' },
  ]
  it('ใช้ statusDesc ของเหตุการณ์ล่าสุดเมื่อ issue เท่านั้น', () => {
    expect(markerReasonLine('issue', traces)).toBe('Flash บันทึกว่า: ผู้รับไม่อยู่หรือติดต่อไม่ได้')
    expect(markerReasonLine('in_transit', traces)).toBeNull()
    expect(markerReasonLine('issue', [])).toBeNull()
    expect(markerReasonLine('issue', null)).toBeNull()
    expect(markerReasonLine('issue', [{ occurredAt: '2026-10-22T10:00:00Z', statusDesc: null }])).toBeNull()
  })
})
