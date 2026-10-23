import { describe, it, expect } from 'vitest'
import {
  decideAfterCreate, flashAskRows, shipmentOutcomeToast, escapeHtml,
  ISHIP_ASK_TITLE, ISHIP_ASK_HTML, ASK_CONFIRM_TEXT, ASK_CANCEL_TEXT, AFTER_CREATE_FALLBACK_ERROR,
  CHOOSE_REQUIRED, NEEDS_REVIEW_TOAST,
} from '../after-create'

describe('decideAfterCreate', () => {
  const d = (iship: 'AUTO' | 'ASK' | 'OFF', flash: 'AUTO' | 'ASK' | 'OFF') => decideAfterCreate({ iship, flash })
  it('ไม่มีเจ้าไหนเปิด = NONE', () => expect(d('OFF', 'OFF')).toEqual({ kind: 'NONE' }))
  it('iShip อย่างเดียว = เส้นทางเดิม (ตามโหมดของ iShip)', () => {
    expect(d('AUTO', 'OFF')).toEqual({ kind: 'ISHIP', mode: 'AUTO' })
    expect(d('ASK', 'OFF')).toEqual({ kind: 'ISHIP', mode: 'ASK' })
  })
  it('Flash อย่างเดียว ตามโหมด', () => {
    expect(d('OFF', 'AUTO')).toEqual({ kind: 'FLASH', mode: 'AUTO' })
    expect(d('OFF', 'ASK')).toEqual({ kind: 'FLASH', mode: 'ASK' })
  })
  it('สองเจ้า = CHOOSE เสมอ แม้ตั้ง AUTO ทั้งคู่', () => {
    for (const a of ['AUTO', 'ASK'] as const) for (const b of ['AUTO', 'ASK'] as const) expect(d(a, b)).toEqual({ kind: 'CHOOSE' })
  })
})

describe('ข้อความเดิมของ iShip ต้องไม่เปลี่ยน', () => {
  it('ค่าคงที่ตรงตัวอักษรกับก่อน 00084', () => {
    expect(ISHIP_ASK_TITLE).toBe('สร้างพัสดุที่ iShip ด้วยไหม')
    expect(ISHIP_ASK_HTML).toBe(
      'ระบบจะเปิดพัสดุกับขนส่งตามค่าที่ตั้งไว้ในหน้าตั้งค่าการจัดส่ง<br/><span class="text-danger">มีค่าใช้จ่ายจริงกับบัญชี iShip ของร้าน</span>',
    )
    expect(ASK_CONFIRM_TEXT).toBe('สร้างพัสดุ')
    expect(ASK_CANCEL_TEXT).toBe('ไม่ใช่ตอนนี้')
    expect(AFTER_CREATE_FALLBACK_ERROR).toBe('ยังสร้างพัสดุไม่ได้ — เปิดพัสดุอีกครั้งได้จากหน้าคำสั่งซื้อ')
  })
  it('toast สำเร็จ/ล้มเหลวเหมือนเดิม', () => {
    expect(shipmentOutcomeToast({ status: 'CREATED', trackingNo: 'T1' })).toEqual({ type: 'success', message: 'สร้างพัสดุแล้ว เลขติดตาม T1' })
    expect(shipmentOutcomeToast({ status: 'CREATED' })).toEqual({ type: 'success', message: 'สร้างพัสดุแล้ว' })
    expect(shipmentOutcomeToast({ status: 'FAILED' })).toEqual({ type: 'error', message: 'สร้างพัสดุไม่สำเร็จ — กดลองใหม่ได้จากหน้าคำสั่งซื้อ' })
    expect(shipmentOutcomeToast({ status: 'FAILED', lastErrorMessage: 'x' }).message).toBe('x')
  })
  it('NEEDS_REVIEW = warning ตามสเปก', () => {
    expect(shipmentOutcomeToast({ status: 'NEEDS_REVIEW' })).toEqual({ type: 'warning', message: NEEDS_REVIEW_TOAST })
    expect(NEEDS_REVIEW_TOAST).toBe('ต้องตรวจสอบพัสดุ ตรวจที่ Flash แล้วจัดการจากหน้าคำสั่งซื้อ')
    expect(CHOOSE_REQUIRED).toBe('เลือกก่อนว่าจะเปิดพัสดุกับใคร')
  })
})

describe('flashAskRows', () => {
  const f = { receiverName: 'สมชาย', phone: '0812345678', subdistrict: 'ก', district: 'ข', province: 'กรุงเทพ', postcode: '10110', weightKg: 1, cod: 890, quote: { totalBaht: 32, pricingTable: 'CONTRACT' } }
  it('ครบ', () => {
    const r = flashAskRows(f)
    expect(r.map((x) => x.label)).toEqual(['ผู้รับ', 'ส่งไป', 'น้ำหนัก', 'เก็บเงินปลายทาง', 'ค่าส่งโดยประมาณ'])
    expect(r[4].value).toBe('฿32 (ประมาณการ · ราคาสัญญา)')
  })
  it('ดึงราคาไม่ได้ = บอกตรง ๆ ไม่ใช่ ฿0 · ไม่มี COD/น้ำหนักไม่แสดงแถว', () => {
    const r = flashAskRows({ ...f, quote: null, cod: 0, weightKg: null })
    expect(r.map((x) => x.label)).toEqual(['ผู้รับ', 'ส่งไป', 'ค่าส่งโดยประมาณ'])
    expect(r[2].value).toBe('ประเมินราคาไม่ได้')
  })
  it('escapeHtml', () => expect(escapeHtml('<a>&"\'')).toBe('&#60;a&#62;&#38;&#34;&#39;'))
})
