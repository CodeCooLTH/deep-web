import { describe, expect, it } from 'vitest'
import { MAX_PICK_SHOPS, bindCodeRequest, canCreateCode, classifyPollStatus, createHint, initialSelection, isPickDisabled, pickedShopsSummary, shopTypeLabel, togglePick } from '../bind-wizard-rules'

const ok = { selectedIds: ['a'], acknowledged: true, busy: false, available: true }
const ids = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`)

describe('canCreateCode', () => {
  it('ครบเงื่อนไข = กดได้', () => expect(canCreateCode(ok)).toBe(true))
  it('ไม่เลือกร้าน = กดไม่ได้', () => expect(canCreateCode({ ...ok, selectedIds: [] })).toBe(false))
  it('ไม่ติ๊กรับทราบ = กดไม่ได้', () => expect(canCreateCode({ ...ok, acknowledged: false })).toBe(false))
  it('กำลังส่ง = กดไม่ได้', () => expect(canCreateCode({ ...ok, busy: true })).toBe(false))
  it('ฟีเจอร์ไม่พร้อม = กดไม่ได้', () => expect(canCreateCode({ ...ok, available: false })).toBe(false))
  it('ขอบ 10 ร้านกดได้ · 11 กดไม่ได้', () => {
    expect(canCreateCode({ ...ok, selectedIds: ids(MAX_PICK_SHOPS) })).toBe(true)
    expect(canCreateCode({ ...ok, selectedIds: ids(MAX_PICK_SHOPS + 1) })).toBe(false)
  })
})

describe('initialSelection / togglePick', () => {
  it('ร้านเดียว = preselect · 0 หรือหลายร้าน = ว่าง', () => {
    expect(initialSelection([{ id: 'x' }])).toEqual(['x'])
    expect(initialSelection([])).toEqual([])
    expect(initialSelection([{ id: 'x' }, { id: 'y' }])).toEqual([])
  })
  it('สลับเลือก/ถอด', () => {
    expect(togglePick(['a'], 'b')).toEqual(['a', 'b'])
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b'])
  })
  it('ครบเพดานแล้วเพิ่มไม่ได้ แต่ถอดได้', () => {
    const full = ids(MAX_PICK_SHOPS)
    expect(togglePick(full, 'new')).toEqual(full)
    expect(togglePick(full, 's0')).toHaveLength(MAX_PICK_SHOPS - 1)
  })
  it('isPickDisabled: เฉพาะแถวที่ยังไม่ติ๊กตอนครบเพดาน', () => {
    const full = ids(MAX_PICK_SHOPS)
    expect(isPickDisabled(full, 'new')).toBe(true)
    expect(isPickDisabled(full, 's3')).toBe(false)
    expect(isPickDisabled(ids(9), 'new')).toBe(false)
  })
})

describe('shopTypeLabel', () => {
  it('ใช้ SHOP_VERTICALS', () => {
    expect(shopTypeLabel({ vertical: 'ONLINE_SALES', kind: 'BUSINESS' })).toBe('ขายออนไลน์')
    expect(shopTypeLabel({ vertical: 'SERVICE_QUEUE', kind: 'BUSINESS' })).toBe('สินค้าและบริการ')
    expect(shopTypeLabel({ vertical: 'LODGING', kind: 'BUSINESS' })).toBe('บ้านพัก')
  })
  it('PERSONAL ชนะ vertical · vertical แปลก = ตกค่าตั้งต้น', () => {
    expect(shopTypeLabel({ vertical: 'LODGING', kind: 'PERSONAL' })).toBe('บัญชีส่วนตัว')
    expect(shopTypeLabel({ vertical: 'GENERAL', kind: 'BUSINESS' })).toBe('ขายออนไลน์')
  })
})

describe('pickedShopsSummary / createHint', () => {
  it('สรุปร้าน', () => {
    expect(pickedShopsSummary(['A'])).toBe('ร้านที่รวม: A')
    expect(pickedShopsSummary(['A', 'B', 'C'])).toBe('ร้านที่รวม: A และอีก 2 ร้าน')
  })
  it('hint: ไม่เลือกร้านก่อน แล้วค่อยรับทราบ', () => {
    expect(createHint({ selectedIds: [], acknowledged: false })).toBe('ต้องเลือกอย่างน้อย 1 ร้าน')
    expect(createHint({ selectedIds: ['a'], acknowledged: false })).toBe('ติ๊กรับทราบก่อนสร้างโค้ด')
    expect(createHint({ selectedIds: ['a'], acknowledged: true })).toBeNull()
  })
})

describe('bindCodeRequest (create-once)', () => {
  it('ยังไม่มี groupId + create → /bind-code พร้อม shopIds + acknowledged', () => {
    expect(bindCodeRequest({ groupId: null, selected: ['a', 'b'], mode: 'create' })).toEqual({
      url: '/api/line-report/bind-code',
      body: { shopIds: ['a', 'b'], acknowledged: true },
    })
  })
  it('มี groupId แล้ว → /groups/{id}/bind-code เสมอ ทุกโหมด · body ว่าง ไม่พก shopIds', () => {
    for (const mode of ['create', 'resume', 'rebind'] as const) {
      expect(bindCodeRequest({ groupId: 'g1', selected: ['a'], mode })).toEqual({ url: '/api/line-report/groups/g1/bind-code', body: {} })
    }
  })
  it('resume/rebind ที่ไม่มี groupId = null (ไม่ยิงสร้างกลุ่มใหม่)', () => {
    expect(bindCodeRequest({ groupId: null, selected: ['a'], mode: 'resume' })).toBeNull()
    expect(bindCodeRequest({ groupId: null, selected: ['a'], mode: 'rebind' })).toBeNull()
  })
})

describe('classifyPollStatus', () => {
  it('จัดประเภท', () => {
    expect(classifyPollStatus(0)).toBe('NETWORK')
    expect(classifyPollStatus(401)).toBe('DENIED')
    expect(classifyPollStatus(403)).toBe('DENIED')
    expect(classifyPollStatus(404)).toBe('GONE')
    expect(classifyPollStatus(429)).toBe('BUSY')
    expect(classifyPollStatus(500)).toBe('BUSY')
    expect(classifyPollStatus(503)).toBe('BUSY')
  })
})
