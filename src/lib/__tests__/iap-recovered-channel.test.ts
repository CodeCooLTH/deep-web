/**
 * [blocker] ช่องธุรกรรมกู้คืน — แยกจากช่องคำตอบโดยตั้งใจ (feature 00064)
 *
 * 🛑 เหตุผลที่ต้องแยกช่อง: ช่องคำตอบเป็นช่องเดียวร่วมกันทั้งหน้าที่ตัวรับอ่านตอน event ยิง
 * ธุรกรรมกู้คืนที่มาถึงระหว่างผู้ใช้รอผล "กดซื้อ" จะเขียนทับคำตอบนั้นก่อนเจ้าของอ่านทัน
 * (ตัวจับคู่ `requestId` กันการ *ตีความผิด* ได้ แต่กันของ *หายไป* ไม่ได้)
 */
import { describe, expect, it } from 'vitest'

import {
  IAP_RECOVERED_EVENT,
  IAP_RESULT_EVENT,
  parseIapRecovered,
  parseIapResult,
} from '@/lib/iap-bridge-protocol'

describe('[blocker] ช่องกู้คืนต้องไม่ชนกับช่องคำตอบ', () => {
  it('🛑 ชื่อ event ต้องคนละชื่อ', () => {
    expect(IAP_RECOVERED_EVENT).not.toBe(IAP_RESULT_EVENT)
  })

  it('🛑 ตัวแปลของแต่ละช่อง ต้องไม่รับของอีกช่อง', () => {
    const result = { requestId: 'r1', ok: true, kind: 'purchase', jws: 'j', transactionId: '1' }
    const recovered = { items: [{ jws: 'j', transactionId: '1' }] }

    expect(parseIapRecovered(result), 'คำตอบไม่มี items ⇒ ต้องตก').toBeNull()
    expect(parseIapResult(recovered), 'ของกู้คืนไม่มี requestId ⇒ ต้องตก').toBeNull()
  })
})

describe('[blocker] แปลธุรกรรมกู้คืน', () => {
  it('ของครบ → ได้ครบทุกใบตามลำดับเดิม', () => {
    expect(
      parseIapRecovered({
        items: [
          { jws: 'a', transactionId: '1' },
          { jws: 'b', transactionId: '2' },
        ],
      }),
    ).toEqual([
      { jws: 'a', transactionId: '1' },
      { jws: 'b', transactionId: '2' },
    ])
  })

  it('ไม่มีของค้าง → `[]` ไม่ใช่ null (ต่างกัน: อันหนึ่งปกติ อันหนึ่งพัง)', () => {
    expect(parseIapRecovered({ items: [] })).toEqual([])
  })

  it('🛑 ใบไหนขาด `jws` → ตกทั้งใบ (พิสูจน์กับเซิร์ฟเวอร์ไม่ได้)', () => {
    expect(parseIapRecovered({ items: [{ transactionId: '1' }] })).toBeNull()
    expect(parseIapRecovered({ items: [{ jws: '', transactionId: '1' }] })).toBeNull()
  })

  it('🛑 ใบไหนขาด `transactionId` → ตกทั้งใบ (สั่งปิดไม่ได้ = วนกลับมาตลอดกาล)', () => {
    expect(parseIapRecovered({ items: [{ jws: 'a' }] })).toBeNull()
    expect(parseIapRecovered({ items: [{ jws: 'a', transactionId: '' }] })).toBeNull()
  })

  it('🛑 ใบเสียปนมาใบเดียว → ตกทั้งชุด ไม่ใช่คัดเฉพาะใบดี', () => {
    expect(
      parseIapRecovered({
        items: [{ jws: 'a', transactionId: '1' }, { jws: 'b' }],
      }),
      'คัดบางใบ = เชื่อของที่พิสูจน์ไม่ได้ครึ่งหนึ่ง',
    ).toBeNull()
  })

  it('ของที่ไม่ใช่รูปร่างนี้เลย → null ไม่ throw (ตัวเรียกอยู่ใน event handler)', () => {
    for (const junk of [null, undefined, 'x', 7, [], {}, { items: 'nope' }, { items: [null] }]) {
      expect(() => parseIapRecovered(junk)).not.toThrow()
      expect(parseIapRecovered(junk)).toBeNull()
    }
  })

  it('🛑 ห้ามเติมค่าเริ่มต้นให้เอง — ของที่มาจาก window ถูกเขียนทับได้', () => {
    const got = parseIapRecovered({ items: [{ jws: 'a', transactionId: '1', extra: 'ignored' }] })
    expect(got).toEqual([{ jws: 'a', transactionId: '1' }])
  })
})
