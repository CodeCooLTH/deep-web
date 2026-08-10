import { describe, expect, it } from 'vitest'

import { isPaymentRestricted, resolveAppShell } from '@/lib/app-shell'

/**
 * เกณฑ์นี้ตัดสินว่า "ผู้ขายคนไหนเห็นปุ่มเติมเงิน" ซึ่งผูกกับการผ่าน/ไม่ผ่าน App Store
 * (Guideline 3.1.1 — rejection 2026-08-04) จึงต้องมีเทสคุมทุกช่อง ไม่ใช่เชื่อว่าเขียนถูก
 */

const UA = {
  iphoneWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127 Safari/537.36',
}

describe('resolveAppShell', () => {
  it('[blocker] ไม่มี cookie = เว็บเสมอ แม้ UA จะเป็น iPhone', () => {
    // 🛑 หัวใจของทั้งเรื่อง: กฎ Apple ครอบ "ของในแอป" ไม่ได้ครอบเว็บ ผู้ขายที่เปิด Safari
    // บนมือถือต้องเติมเงินได้ตามปกติ ถ้าเทสนี้แดง = เราไปตัดสินด้วย "เป็นมือถือไหม" แล้ว
    expect(resolveAppShell(undefined, UA.iphoneWebView)).toBe('web')
    expect(resolveAppShell(undefined, UA.android)).toBe('web')
    expect(resolveAppShell(undefined, UA.mac)).toBe('web')
  })

  it('[blocker] อยู่ในแอปบน iPhone/iPad → ios', () => {
    expect(resolveAppShell('app', UA.iphoneWebView)).toBe('ios')
    expect(resolveAppShell('app', UA.ipad)).toBe('ios')
  })

  it('อยู่ในแอปบน Android → android (Play ยังไม่ปล่อย จึงยังไม่ถูกจำกัด)', () => {
    expect(resolveAppShell('app', UA.android)).toBe('android')
  })

  it('อยู่ในแอปแต่อ่าน UA ไม่ออก → ถือเป็น ios (fail-closed)', () => {
    // iPadOS ที่เปิด "Request Desktop Website" รายงานตัวเป็น Macintosh — เดาผิดทางนี้เสียแค่
    // ผู้ขายบางคนต้องไปเติมที่เว็บ แต่เดาผิดอีกทาง = คนตรวจ Apple เห็นปุ่มจ่ายเงินแล้วตีกลับทั้งรอบ
    expect(resolveAppShell('app', UA.mac)).toBe('ios')
    expect(resolveAppShell('app', '')).toBe('ios')
  })

  it('cookie ค่าอื่นที่ไม่ใช่ "app" ไม่นับ', () => {
    // กันคนตั้งค่าเองมั่ว ๆ / cookie เก่าค้างจากระบบอื่น
    expect(resolveAppShell('web', UA.iphoneWebView)).toBe('web')
    expect(resolveAppShell('', UA.iphoneWebView)).toBe('web')
  })
})

describe('isPaymentRestricted', () => {
  it('[blocker] iOS ต้องถูกจำกัด — นี่คือเหตุผลที่ฟีเจอร์นี้เกิดมา', () => {
    expect(isPaymentRestricted('ios')).toBe(true)
  })

  it('[blocker] เว็บต้องไม่ถูกจำกัด', () => {
    // ถ้าเทสนี้แดง = ผู้ขายทุกคนบนเว็บเติมเงินไม่ได้ = รายได้หยุดทั้งระบบ
    expect(isPaymentRestricted('web')).toBe(false)
  })

  it('Android ยังไม่ถูกจำกัด (ยังไม่ปล่อยบน Play)', () => {
    // 🛑 ก่อนส่งขึ้น Google Play ต้องกลับมาแก้เทสนี้พร้อมกับ PAYMENT_RESTRICTED_SHELLS
    // — Google Play Billing มีกฎเดียวกันเป๊ะสำหรับสินค้าดิจิทัล
    expect(isPaymentRestricted('android')).toBe(false)
  })
})
