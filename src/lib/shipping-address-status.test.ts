import { describe, it, expect } from 'vitest'
import { getLocalityStatus } from './shipping-address-status'

describe('getLocalityStatus — สถานะที่อยู่จัดส่งบนหน้าจอ', () => {
  it('ฟอร์มว่างสนิท + ยังไม่กดบันทึก → empty (ห้ามขึ้นแดงตั้งแต่ยังไม่กรอกอะไร)', () => {
    const r = getLocalityStatus(undefined)
    expect(r.state).toBe('empty')
    expect(r.hasAnyData).toBe(false)
    expect(r.recommendedGap).toBe(false)
  })

  it('ฟอร์มว่างสนิท + กดบันทึกแล้วไม่ผ่าน → incomplete (ต้องมีสัญญาณบนฟอร์ม ไม่ใช่มีแต่ toast)', () => {
    const r = getLocalityStatus({}, true)
    expect(r.state).toBe('incomplete')
    expect(r.missingRequired).toEqual(['จังหวัด', 'รหัสไปรษณีย์'])
  })

  // เคสที่ทำให้เกิดบั๊ก: วางข้อความ กทม. → ได้ตำบล/อำเภอ แต่ไม่ได้จังหวัด/รหัสไปรษณีย์
  it('มีตำบล/อำเภอ แต่ขาดจังหวัด+รหัสไปรษณีย์ → incomplete ไม่ใช่ "เลือกแล้ว"', () => {
    const r = getLocalityStatus({ subdistrict: 'คลองตัน', district: 'คลองเตย' })
    expect(r.state).toBe('incomplete')
    expect(r.missingRequired).toEqual(['จังหวัด', 'รหัสไปรษณีย์'])
    expect(r.hasAnyData).toBe(true)
  })

  it('ขาดช่องเดียว → บอกเฉพาะช่องนั้น', () => {
    expect(
      getLocalityStatus({ subdistrict: 'บางรัก', district: 'เมือง', province: 'ชลบุรี' }).missingRequired,
    ).toEqual(['รหัสไปรษณีย์'])
    expect(
      getLocalityStatus({ subdistrict: 'บางรัก', district: 'เมือง', postcode: '20000' }).missingRequired,
    ).toEqual(['จังหวัด'])
  })

  it('ครบ 4 ช่อง → complete และไม่มีคำเตือนอะไร', () => {
    const r = getLocalityStatus({
      subdistrict: 'คลองตัน',
      district: 'คลองเตย',
      province: 'กรุงเทพ',
      postcode: '10110',
    })
    expect(r.state).toBe('complete')
    expect(r.missingRequired).toEqual([])
    expect(r.recommendedGap).toBe(false)
  })

  it('มีจังหวัด+รหัสไปรษณีย์ แต่ไม่มีตำบล/อำเภอ → complete (บันทึกได้) พร้อมเตือนไว้เปิดพัสดุ', () => {
    const r = getLocalityStatus({ province: 'กรุงเทพ', postcode: '10110' })
    expect(r.state).toBe('complete')
    expect(r.recommendedGap).toBe(true)
  })

  it('ช่องว่าง/เว้นวรรคล้วน นับเป็นไม่มีค่า', () => {
    const r = getLocalityStatus({ province: '   ', postcode: '10110', subdistrict: 'คลองตัน', district: 'คลองเตย' })
    expect(r.state).toBe('incomplete')
    expect(r.missingRequired).toEqual(['จังหวัด'])
  })

  it('แก้จนครบแล้วลบจังหวัดออก → กลับเป็น incomplete ทันที (ไม่ค้างที่ complete)', () => {
    const complete = getLocalityStatus({
      subdistrict: 'คลองตัน',
      district: 'คลองเตย',
      province: 'กรุงเทพ',
      postcode: '10110',
    })
    expect(complete.state).toBe('complete')
    const after = getLocalityStatus({ subdistrict: 'คลองตัน', district: 'คลองเตย', postcode: '10110' })
    expect(after.state).toBe('incomplete')
  })
})
