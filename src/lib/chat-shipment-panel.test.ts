import { describe, expect, it } from 'vitest'
import {
  decidePanelView,
  isViewOnlyPanelView,
  manualDoneStep,
  trackingMessage,
  orderStatusLabel,
  translateInvalidTransition,
  type PanelViewInput,
} from './chat-shipment-panel'

const base: PanelViewInput = {
  ishipState: 'READY',
  orderStatus: 'PENDING',
  ishipShipment: null,
  hasManual: false,
  senderBlocked: false,
  forceForm: false,
}
const v = (o: Partial<PanelViewInput>) => decidePanelView({ ...base, ...o })
const created = { status: 'CREATED', isDryRun: false }
const failed = { status: 'FAILED', isDryRun: false }

describe('decidePanelView', () => {
  it('ร้านเชื่อมแล้ว ยังไม่มีพัสดุ = แถบเลือก', () => expect(v({})).toBe('CHOOSE'))
  it('ไม่เชื่อม/ถูกยกเลิก = ฟอร์มส่งเองไม่มีแถบ', () => {
    expect(v({ ishipState: 'NOT_CONNECTED' })).toBe('MANUAL_ONLY')
    expect(v({ ishipState: 'DISCONNECTED' })).toBe('MANUAL_ONLY')
  })
  it('ใบ iShip จริงชนะส่งเอง', () => {
    expect(v({ ishipShipment: created, hasManual: true, orderStatus: 'SHIPPED' })).toBe('ISHIP_STATUS')
  })
  it('FAILED + ส่งเองแล้ว = มุมมอง C (FAILED ไม่นับว่ามีพัสดุ)', () => {
    expect(v({ ishipShipment: failed, hasManual: true, orderStatus: 'SHIPPED' })).toBe('MANUAL_DONE')
  })
  it('ใบจำลอง (dry-run) ไม่นับเป็นพัสดุจริง', () => {
    expect(v({ ishipShipment: { status: 'CREATED', isDryRun: true }, hasManual: true })).toBe('MANUAL_DONE')
  })
  it('FAILED ยังเปิดหน้าสถานะ แต่ส่งเองแทน (forceForm) ได้ฟอร์ม', () => {
    expect(v({ ishipShipment: failed })).toBe('ISHIP_STATUS')
    expect(v({ ishipShipment: failed, forceForm: true })).toBe('CHOOSE')
  })
  it('ไม่ใช่ PENDING และไม่มีพัสดุ = กล่อง D', () => {
    for (const s of ['DRAFTED', 'CONFIRMED', 'CANCELLED', 'SHIPPED']) {
      expect(v({ orderStatus: s })).toBe('STATUS_BLOCKED')
    }
    expect(v({ orderStatus: 'CANCELLED', ishipShipment: failed })).toBe('STATUS_BLOCKED')
  })
  it('ผู้ส่งไม่ครบ มีทางออกส่งเองแทน', () => {
    expect(v({ senderBlocked: true })).toBe('SENDER_BLOCKED')
    expect(v({ senderBlocked: true, forceForm: true })).toBe('MANUAL_ONLY')
  })
  it('มุมมองที่ไม่มีช่องกรอก = view-only', () => {
    expect(isViewOnlyPanelView('CHOOSE')).toBe(false)
    expect(isViewOnlyPanelView('MANUAL_ONLY')).toBe(false)
    expect(isViewOnlyPanelView('MANUAL_DONE')).toBe(true)
    expect(isViewOnlyPanelView('STATUS_BLOCKED')).toBe(true)
    expect(isViewOnlyPanelView('SENDER_BLOCKED')).toBe(true)
    expect(isViewOnlyPanelView('ISHIP_STATUS')).toBe(true)
  })
})

describe('decidePanelView — เคสที่ mutation ลอดได้', () => {
  it('ใบ live + forceForm + ส่งเองแล้ว ต้องไม่ตกเป็น MANUAL_DONE', () => {
    // forceForm ข้ามหน้าสถานะ แต่ live ต้องไม่ทำให้ตกเป็น MANUAL_DONE (ต้องไล่ต่อถึง CHOOSE)
    expect(v({ ishipShipment: created, hasManual: true, forceForm: true })).toBe('CHOOSE')
  })
  it('FAILED + ผู้ส่งไม่ครบ = SENDER_BLOCKED ก่อนหน้าสถานะ iShip', () => {
    expect(v({ ishipShipment: failed, senderBlocked: true })).toBe('SENDER_BLOCKED')
  })
  it('ร้านเลิกเชื่อมแต่ยังมีใบ live ค้าง = หน้าสถานะ ห้ามส่งเองซ้ำ', () => {
    expect(v({ ishipState: 'DISCONNECTED', ishipShipment: created })).toBe('ISHIP_STATUS')
    expect(v({ ishipState: 'NOT_CONNECTED', ishipShipment: created, orderStatus: 'SHIPPED' })).toBe('ISHIP_STATUS')
    expect(v({ ishipState: 'DISCONNECTED', ishipShipment: failed })).toBe('MANUAL_ONLY')
  })
})

describe('orderStatusLabel', () => {
  it('รู้จัก = ป้ายไทย · ไม่รู้จัก = คืนค่าเดิม', () => {
    expect(orderStatusLabel('CANCELLED')).toBe('ยกเลิก')
    expect(orderStatusLabel('WEIRD')).toBe('WEIRD')
  })
})

describe('trackingMessage (preview เท่านั้น — ข้อความจริงประกอบที่ server, 00078 T14)', () => {
  it('ขนส่ง "อื่น ๆ" (มีเว้นวรรค) ไม่ขึ้น "จัดส่งด้วย อื่น ๆ"', () => {
    expect(trackingMessage('MANUAL', 'TH1', 'อื่น ๆ')).not.toContain('จัดส่งด้วย')
  })
  it('iShip แนบลิงก์ติดตาม', () => {
    const m = trackingMessage('ISHIP', 'TH1', 'Kerry Express')
    expect(m).toContain('จัดส่งด้วย Kerry Express')
    expect(m).toContain('app.iship.cloud/tracking?track=TH1')
  })
  it('ส่งเองไม่แนบลิงก์ iShip', () => {
    expect(trackingMessage('MANUAL', 'TH1', 'Kerry Express')).toBe(
      'จัดส่งด้วย Kerry Express\nเลขติดตามพัสดุ: TH1',
    )
  })
  it('ขนส่ง "อื่นๆ" ตัดบรรทัดขนส่ง', () => {
    expect(trackingMessage('MANUAL', 'TH1', 'อื่นๆ')).toBe('เลขติดตามพัสดุ: TH1')
  })
  it('iShip ไม่มีชื่อขนส่ง/ว่าง = ไม่มีบรรทัดขนส่ง แต่ยังมีลิงก์', () => {
    for (const n of [null, '', '  ']) {
      const m = trackingMessage('ISHIP', 'TH1', n)
      expect(m.startsWith('เลขติดตามพัสดุ: TH1')).toBe(true)
      expect(m).toContain('app.iship.cloud')
    }
  })
  it('preview iShip ใช้ตัวยึดตำแหน่งของ iShip', () => {
    expect(trackingMessage('ISHIP', null, 'Kerry Express')).toBe(
      'จัดส่งด้วย Kerry Express\nเลขติดตามพัสดุ: (จะแสดงหลังสร้างพัสดุสำเร็จ)\nติดตามพัสดุ: (ลิงก์จะแนบให้อัตโนมัติ)',
    )
  })
  it('preview ส่งเองอ่านขนส่งที่เลือก · "อื่นๆ" ตัดบรรทัด', () => {
    expect(trackingMessage('MANUAL', null, 'DHL')).toBe('จัดส่งด้วย DHL\nเลขติดตามพัสดุ: (เลขที่กรอกด้านบน)')
    expect(trackingMessage('MANUAL', null, 'อื่นๆ')).toBe('เลขติดตามพัสดุ: (เลขที่กรอกด้านบน)')
  })
  it('preview ส่งเองใช้ตัวยึดตำแหน่ง', () => {
    expect(trackingMessage('MANUAL', null, null)).toBe(
      'จัดส่งด้วย (ขนส่งที่เลือก)\nเลขติดตามพัสดุ: (เลขที่กรอกด้านบน)',
    )
  })
})

describe('translateInvalidTransition', () => {
  it('แปลงเป็นไทย', () => {
    expect(translateInvalidTransition('Invalid transition: SHIPPED → SHIPPED')).toContain('แจ้งจัดส่งไปแล้ว')
    expect(translateInvalidTransition('Invalid transition: CANCELLED → SHIPPED')).toBe(
      'คำสั่งซื้อนี้อยู่สถานะยกเลิก จึงบันทึกการจัดส่งไม่ได้',
    )
  })
  it('ข้อความอื่นคืน null', () => {
    expect(translateInvalidTransition('Order not found')).toBeNull()
  })
})

describe('manualDoneStep (00080)', () => {
  it('PENDING → ปุ่มจัดส่งแล้ว + ป้ายรอจัดส่ง', () => {
    expect(manualDoneStep('PENDING')).toEqual({ action: 'DISPATCH', stage: 'AWAITING_DISPATCH' })
  })
  it('SHIPPED → ปุ่มส่งสำเร็จ + ป้ายกำลังจัดส่ง', () => {
    expect(manualDoneStep('SHIPPED')).toEqual({ action: 'DELIVER', stage: 'SHIPPING' })
  })
  it('CONFIRMED / CANCELLED → ไม่มีปุ่ม', () => {
    expect(manualDoneStep('CONFIRMED').action).toBeNull()
    expect(manualDoneStep('CANCELLED').action).toBeNull()
  })
})
