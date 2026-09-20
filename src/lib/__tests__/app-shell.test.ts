import { describe, expect, it } from 'vitest'

import { APP_UA_MARKER, isPaymentRestricted, isSignUpRestricted, resolveAppShell } from '@/lib/app-shell'

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

/** UA ที่แอปส่งจริง — WKWebView ต่อ `applicationNameForUserAgent` ไว้ท้ายสุด */
const APP_UA = {
  iphone: `${UA.iphoneWebView} ${APP_UA_MARKER}/1.0`,
  ipad: `${UA.ipad} ${APP_UA_MARKER}/1.0`,
  android: `${UA.android} ${APP_UA_MARKER}/1.0`,
  /** iPadOS ที่ตั้ง "Request Desktop Website" — อ่านแพลตฟอร์มจาก UA ไม่ออก แต่ยังรู้ว่าอยู่ในแอป */
  desktopMode: `${UA.mac} ${APP_UA_MARKER}/1.0`,
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

/**
 * [blocker] คำขอแรกสุดหลังติดตั้งแอปใหม่ (2026-09-20)
 *
 * คุกกี้ `deep_shell` ถูกเขียนด้วยจาวาสคริปต์ในหน้าเว็บ ⇒ เกิด **หลัง** เซิร์ฟเวอร์เรนเดอร์
 * หน้าแรกไปแล้ว ⇒ จอแรกที่คนตรวจของ Apple เห็นหลังติดตั้ง เคยถูกเรนเดอร์แบบเบราว์เซอร์
 * ซึ่งมีลิงก์ "สมัครสมาชิก" ติดมาด้วย = สิ่งที่ Apple สั่งให้เอาออก (3.1.1)
 *
 * ยืนยันกับ prod 2026-09-20 ก่อนแก้: ยิงคำขอที่ไม่มีคุกกี้ได้หน้าที่มีคำนั้น · มีคุกกี้ไม่มี
 */
describe('[blocker] คำขอแรกหลังติดตั้ง — ยังไม่มีคุกกี้ แต่ต้องรู้ว่าอยู่ในแอป', () => {
  it('🛑 UA มี marker แต่ไม่มีคุกกี้ → ต้องเป็น ios ไม่ใช่ web', () => {
    expect(resolveAppShell(undefined, APP_UA.iphone), 'iPhone ติดตั้งใหม่').toBe('ios')
    expect(resolveAppShell(undefined, APP_UA.ipad), 'iPad ติดตั้งใหม่').toBe('ios')
  })

  it('🛑 จอแรกหลังติดตั้งต้องซ่อนทั้งปุ่มสมัครและช่องทางจ่ายเงิน', () => {
    const shell = resolveAppShell(undefined, APP_UA.ipad)
    expect(isSignUpRestricted(shell), 'ลิงก์สมัครสมาชิก = สิ่งที่ Apple สั่งให้เอาออก').toBe(true)
    expect(isPaymentRestricted(shell)).toBe(true)
  })

  it('แอป Android ที่ยังไม่มีคุกกี้ → android (ไม่ใช่ ios)', () => {
    expect(resolveAppShell(undefined, APP_UA.android)).toBe('android')
  })

  it('แอปที่อ่านแพลตฟอร์มจาก UA ไม่ออก → ios (fail-closed เหมือนเดิม)', () => {
    expect(resolveAppShell(undefined, APP_UA.desktopMode)).toBe('ios')
  })

  it('🛑 คุกกี้ยังต้องใช้ได้เองโดยไม่มี marker — build เก่าที่ปล่อยไปแล้วยังไม่มี marker', () => {
    expect(resolveAppShell('app', UA.iphoneWebView)).toBe('ios')
    expect(resolveAppShell('app', UA.mac)).toBe('ios')
  })

  it('🛑 เบราว์เซอร์ปกติต้องไม่ถูกเข้าใจผิดว่าเป็นแอป', () => {
    for (const ua of Object.values(UA)) {
      expect(resolveAppShell(undefined, ua), ua).toBe('web')
    }
    expect(resolveAppShell(undefined, ''), 'UA ว่าง').toBe('web')
  })

  it('🛑 เทียบตัวพิมพ์ตรงตัว — ยอมรับค่าที่เราไม่เคยส่งคือเปิดช่องให้ชนโดยบังเอิญ', () => {
    expect(resolveAppShell(undefined, `${UA.iphoneWebView} deepsellerapp/1.0`)).toBe('web')
    expect(resolveAppShell(undefined, `${UA.iphoneWebView} DEEPSELLERAPP/1.0`)).toBe('web')
  })

  it('🛑 marker ต้องตรงกับที่แอปส่งจริง (สัญญาข้ามรีโป)', async () => {
    const fs = await import('fs')
    const appFile = '/Users/pongsakorn/Desktop/deep-seller-app/src/features/webview/SellerWebView.tsx'
    let src: string | null = null
    try {
      src = fs.readFileSync(appFile, 'utf8')
    } catch {
      /* เครื่อง CI ไม่มีรีโปแอปวางข้าง ๆ — ข้ามได้ ฝั่งแอปมีเทสปักค่าเดียวกันไว้เอง */
    }
    if (src) {
      expect(src, 'แอปต้องประกาศ marker ตัวเดียวกัน').toContain(`const APP_UA_MARKER = '${APP_UA_MARKER}'`)
      expect(src, 'และต้องส่งออกไปจริงผ่าน applicationNameForUserAgent').toContain(
        'applicationNameForUserAgent={APP_USER_AGENT_SUFFIX}',
      )
    }
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
