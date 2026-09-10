/**
 * [blocker] กู้คืนธุรกรรมที่ StoreKit ส่งกลับมาเอง (feature 00064)
 *
 * 🛑 นี่คือตรรกะที่ **พังแล้วเงียบที่สุด** ในฟีเจอร์นี้ — ไม่มีใครกดปุ่มอะไร ไม่มีใครเห็นอะไร
 * ถ้ามันไม่ทำงาน อาการที่ผู้ใช้เจอคือ "จ่ายเงินแล้วของไม่มา" ซึ่งเขาจะไม่รายงานว่าเป็นบั๊ก
 * ของฟีเจอร์กู้คืน เขาจะรายงานว่าโดนโกง
 *
 * บทเรียนที่ทำให้ต้องมีไฟล์นี้: `SellerWebView` เคยส่ง `() => {}` เข้า `startIapListeners`
 * ⇒ กลไกกู้คืนทั้งก้อน "มีอยู่ในโค้ดครบทุกบรรทัด แต่ไม่เคยถูกเรียก" อยู่หลายสัปดาห์
 * โดย tsc/build/เทส/grep ผ่านหมด
 */
import { describe, expect, it, vi } from 'vitest'

import { recoverPurchases, shouldAnnounceRecovery } from '@/lib/iap-recovery'
import { decideVerifyOutcome } from '@/lib/iap-verify-outcome'
import type { IapPurchase } from '@/lib/iap-bridge-protocol'

const item = (n: number): IapPurchase => ({ jws: `jws-${n}`, transactionId: `${2000000000 + n}` })

describe('[blocker] กติกาปิด/ไม่ปิดธุรกรรม', () => {
  it('2xx → ปิด และได้สิทธิ์', () => {
    expect(decideVerifyOutcome({ status: 200 })).toEqual({ shouldFinish: true, granted: true })
  })

  it('🛑 4xx → ปิดทิ้ง แต่ **ไม่ได้สิทธิ์** — สองคำถามนี้ห้ามยุบเป็นธงเดียว', () => {
    expect(decideVerifyOutcome({ status: 409 })).toEqual({ shouldFinish: true, granted: false })
  })

  it('🛑 5xx → **ห้ามปิด** ฝั่งเราเพี้ยนชั่วคราว ลองใหม่ได้', () => {
    expect(decideVerifyOutcome({ status: 503 })).toEqual({ shouldFinish: false, granted: false })
  })

  it('🛑 เน็ตหลุด → ห้ามปิด (ยังไม่มีใครตัดสินใจอะไรเลย)', () => {
    expect(decideVerifyOutcome('NETWORK_ERROR')).toEqual({ shouldFinish: false, granted: false })
  })

  it('ปิดธุรกรรม = ไม่ถูกส่งกลับมาอีกตลอดกาล ⇒ เคสที่ยังลองใหม่ได้ต้องไม่ปิดสักเคส', () => {
    for (const res of [{ status: 500 }, { status: 502 }, { status: 599 }, 'NETWORK_ERROR' as const]) {
      expect(decideVerifyOutcome(res).shouldFinish, `${JSON.stringify(res)} ไม่ควรปิด`).toBe(false)
    }
  })
})

describe('[blocker] ยืนยันธุรกรรมที่กู้คืนมา', () => {
  it('สำเร็จทุกใบ → ปิดครบและนับสิทธิ์ครบ', async () => {
    const finish = vi.fn()
    const report = await recoverPurchases([item(1), item(2)], {
      verify: async () => ({ status: 200 }),
      finish,
    })
    expect(report).toEqual({ granted: 2, finished: 2 })
    expect(finish.mock.calls.map((c) => c[0])).toEqual(['2000000001', '2000000002'])
  })

  it('🛑 ใบแรกถูกปฏิเสธ → ใบที่สองต้องยังได้รับการยืนยัน ห้ามหยุดทั้งชุด', async () => {
    const finish = vi.fn()
    const seen: string[] = []
    const report = await recoverPurchases([item(1), item(2)], {
      verify: async (it) => {
        seen.push(it.transactionId)
        return it.transactionId === '2000000001' ? { status: 409 } : { status: 200 }
      },
      finish,
    })
    expect(seen, 'หยุดที่ใบแรก = ใบที่ดีไม่มีวันได้รับการยืนยัน').toEqual([
      '2000000001',
      '2000000002',
    ])
    expect(report).toEqual({ granted: 1, finished: 2 })
  })

  it('🛑 5xx ใบเดียวไม่ล้มทั้งชุด และใบนั้นต้องไม่ถูกปิด', async () => {
    const finish = vi.fn()
    const report = await recoverPurchases([item(1), item(2)], {
      verify: async (it) => (it.transactionId === '2000000001' ? { status: 503 } : { status: 200 }),
      finish,
    })
    expect(report).toEqual({ granted: 1, finished: 1 })
    expect(finish).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledWith('2000000002')
  })

  it('🛑 ยิงทีละใบตามลำดับ ห้ามขนาน — ลำดับมีความหมายกับสิทธิ์ก้อนเดียวกัน', async () => {
    const order: string[] = []
    let inFlight = 0
    await recoverPurchases([item(1), item(2), item(3)], {
      verify: async (it) => {
        inFlight += 1
        expect(inFlight, 'มีคำขอซ้อนกัน = ยิงขนาน').toBe(1)
        await Promise.resolve()
        order.push(it.transactionId)
        inFlight -= 1
        return { status: 200 }
      },
      finish: () => {},
    })
    expect(order).toEqual(['2000000001', '2000000002', '2000000003'])
  })

  it('ไม่มีของค้าง → ไม่ยิงอะไรเลย', async () => {
    const verify = vi.fn()
    const report = await recoverPurchases([], { verify, finish: () => {} })
    expect(verify).not.toHaveBeenCalled()
    expect(report).toEqual({ granted: 0, finished: 0 })
  })
})

describe('[blocker] จะบอกผู้ใช้เมื่อไร', () => {
  it('สิทธิ์เปลี่ยนจริง → ต้องบอก (จอเปลี่ยนเองโดยไม่มีคำอธิบายคือของแย่กว่า)', () => {
    expect(shouldAnnounceRecovery({ granted: 1, finished: 1 })).toBe(true)
  })

  it('🛑 ไม่สำเร็จสักใบ → **เงียบ** ผู้ใช้ไม่ได้สั่งอะไร การเด้ง error ใส่คือการรบกวนล้วน ๆ', () => {
    expect(shouldAnnounceRecovery({ granted: 0, finished: 3 })).toBe(false)
    expect(shouldAnnounceRecovery({ granted: 0, finished: 0 })).toBe(false)
  })
})
