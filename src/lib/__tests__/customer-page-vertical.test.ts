import { describe, expect, it } from 'vitest'
import { customerPageShowsParcels, resolveCustomerListVocab } from '../customer-directory'

describe('customerPageShowsParcels / resolveCustomerListVocab', () => {
  it('โชว์พัสดุเฉพาะ ONLINE_SALES (ว่าง/null = ONLINE_SALES)', () => {
    expect(customerPageShowsParcels('ONLINE_SALES')).toBe(true)
    expect(customerPageShowsParcels(undefined)).toBe(true)
    expect(customerPageShowsParcels(null)).toBe(true)
    expect(customerPageShowsParcels('SERVICE_QUEUE')).toBe(false)
    expect(customerPageShowsParcels('LODGING')).toBe(false)
  })

  it('คำผันตาม vertical · ค่าไม่รู้จักตกเป็นชุด ONLINE_SALES', () => {
    expect(resolveCustomerListVocab('SERVICE_QUEUE').repeatLabel).toBe('ใช้บริการซ้ำ')
    expect(resolveCustomerListVocab('LODGING').unit).toBe('บิล')
    expect(resolveCustomerListVocab('ONLINE_SALES').repeatLabel).toBe('ซื้อซ้ำ')
    expect(resolveCustomerListVocab('???')).toBe(resolveCustomerListVocab('ONLINE_SALES'))
  })
})

describe('resolveCustomerListVocab — ป้ายการ์ดสรุปโปรไฟล์ลูกค้า', () => {
  it('ONLINE_SALES และ LODGING คงคำเดิมของหน้าโปรไฟล์', () => {
    for (const v of ['ONLINE_SALES', 'LODGING', undefined]) {
      const x = resolveCustomerListVocab(v)
      expect([x.spentLabel, x.profileTotalLabel, x.profileLastLabel]).toEqual([
        'ยอดซื้อสะสม',
        'ออเดอร์ทั้งหมด',
        'ซื้อล่าสุด',
      ])
    }
  })
  it('SERVICE_QUEUE ใช้คำบริการ', () => {
    const x = resolveCustomerListVocab('SERVICE_QUEUE')
    expect([x.spentLabel, x.profileTotalLabel, x.profileLastLabel]).toEqual([
      'ยอดใช้บริการสะสม',
      'ใช้บริการทั้งหมด',
      'ใช้บริการล่าสุด',
    ])
  })
})
