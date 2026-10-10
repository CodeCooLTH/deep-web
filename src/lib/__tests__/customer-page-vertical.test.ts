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
