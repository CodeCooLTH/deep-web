import { describe, it, expect } from 'vitest'
import {
  resolveLineChannelHealth,
  isLineChannelHealthy,
  daysUntilTokenExpiry,
  webhookMatchesOrigin,
  type LineChannelHealthInput,
} from '@/lib/line/channel-health'
import { TOKEN_EXPIRING_DAYS, SECRET_MISMATCH_MIN_FAILS } from '@/lib/line/constants'

// (00025 ส่วนขยาย 2026-08-12 — AC-CH-23/24/25)
//
// เทสชุดนี้พิสูจน์ด้วย mutation แล้วทุกข้อที่ติด [blocker] — คืนตรรกะผิดกลับไปแล้วต้องแดง
// วิธีพิสูจน์เขียนไว้ที่แต่ละข้อ ให้คนถัดไปทำซ้ำได้โดยไม่ต้องเดา

const NOW = Date.parse('2026-08-12T07:00:00.000Z')
const DAY = 86_400_000

/** ช่องทางที่สุขภาพดีทุกด่าน — เทสแต่ละข้อ override เฉพาะสิ่งที่ตัวเองสนใจ */
function healthy(over: Partial<LineChannelHealthInput> = {}): LineChannelHealthInput {
  return {
    status: 'ACTIVE',
    tokenExpiresAt: null,
    inboundFailReason: null,
    inboundFailCount: 0,
    webhook: { endpoint: 'https://deepthailand.app/api/channels/line/webhook', active: true, matchesUs: true },
    ...over,
  }
}

describe('resolveLineChannelHealth — ลำดับความร้ายแรง', () => {
  it('[blocker] ผ่านทุกด่าน → HEALTHY', () => {
    expect(resolveLineChannelHealth(healthy(), NOW)).toBe('HEALTHY')
  })

  it('[blocker] status=ACTIVE อย่างเดียวไม่พอที่จะเขียว — webhook ปิดอยู่ต้องไม่ HEALTHY', () => {
    // 🛑 ข้อนี้คือหัวใจของ Verified-Means-Green: การ์ดเดิมขึ้นเขียว "เชื่อมแล้ว" ได้ทั้งที่
    // webhook ไม่เคยถูกตั้ง เพราะมันดูแค่ status
    // mutation: ลบบล็อกตรวจ webhook ออก → ข้อนี้แดงทันที
    const h = resolveLineChannelHealth(
      healthy({ webhook: { endpoint: 'https://deepthailand.app/api/channels/line/webhook', active: false, matchesUs: true } }),
      NOW,
    )
    expect(h).toBe('WEBHOOK_INACTIVE')
    expect(isLineChannelHealthy(h)).toBe(false)
  })

  it('[blocker] ยังไม่ได้ตั้ง webhook → WEBHOOK_NOT_SET', () => {
    expect(
      resolveLineChannelHealth(healthy({ webhook: { endpoint: null, active: false, matchesUs: false } }), NOW),
    ).toBe('WEBHOOK_NOT_SET')
  })

  it('[blocker] webhook ชี้ไป URL อื่น → WEBHOOK_POINTS_ELSEWHERE (ไม่ใช่ INACTIVE)', () => {
    // ลำดับสำคัญ: ชี้ผิดที่ + สวิตช์เปิด ต้องรายงานว่า "ชี้ผิดที่" ไม่ใช่เงียบ ๆ ผ่าน
    expect(
      resolveLineChannelHealth(
        healthy({ webhook: { endpoint: 'https://someone-else.example/hook', active: true, matchesUs: false } }),
        NOW,
      ),
    ).toBe('WEBHOOK_POINTS_ELSEWHERE')
  })

  it('[blocker] ลายเซ็นไม่ผ่าน ชนะทุกอย่าง แม้ token ก็ตายพร้อมกัน', () => {
    // mutation: สลับลำดับให้เช็ค status ก่อน inboundFailReason → ข้อนี้แดง
    expect(
      resolveLineChannelHealth(healthy({ status: 'TOKEN_INVALID', inboundFailReason: 'SIGNATURE_MISMATCH', inboundFailCount: 3 }), NOW),
    ).toBe('SECRET_MISMATCH')
  })

  it('[blocker] token ตาย ชนะ webhook ที่ยังไม่ได้ตั้ง', () => {
    expect(
      resolveLineChannelHealth(
        healthy({ status: 'TOKEN_INVALID', webhook: { endpoint: null, active: false, matchesUs: false } }),
        NOW,
      ),
    ).toBe('TOKEN_INVALID')
  })

  it('[blocker] webhook ผิด ชนะ token ใกล้หมดอายุ', () => {
    expect(
      resolveLineChannelHealth(
        healthy({
          tokenExpiresAt: new Date(NOW + 2 * DAY),
          webhook: { endpoint: 'https://deepthailand.app/api/channels/line/webhook', active: false, matchesUs: true },
        }),
        NOW,
      ),
    ).toBe('WEBHOOK_INACTIVE')
  })

  it('DESTINATION_NOT_FOUND ไม่ใช่ SECRET_MISMATCH — คนละสาเหตุ ห้ามกล่าวหา secret', () => {
    // เหตุนี้แปลว่า "ไม่มีแถวช่องทางที่ตรงกับ destination" ซึ่งเป็นเรื่องของช่องทางอื่น
    // ไม่ใช่ของช่องทางใบนี้ จึงต้องไม่ทำให้ใบนี้แดง
    expect(resolveLineChannelHealth(healthy({ inboundFailReason: 'DESTINATION_NOT_FOUND', inboundFailCount: 9 }), NOW)).toBe('HEALTHY')
  })
})

describe('resolveLineChannelHealth — ข้อมูลที่ยังไม่เคยตรวจ', () => {
  it('[blocker] webhook=null (ยังไม่เคยตรวจ) ต้องไม่ถูกตีเป็นความผิด', () => {
    // 🛑 ถ้าตีเป็นผิด ร้านที่เพิ่งเชื่อมเสร็จจะเห็นสีแดงทันทีทั้งที่ยังไม่มีใครตรวจอะไรเลย
    // mutation: เปลี่ยน `if (input.webhook)` เป็น `if (!input.webhook?.active)` → ข้อนี้แดง
    expect(resolveLineChannelHealth(healthy({ webhook: null }), NOW)).toBe('HEALTHY')
  })

  it('[blocker] tokenExpiresAt=null (ไม่หมดอายุ/ยังไม่เคยอ่าน) ต้องไม่เข้า TOKEN_EXPIRING', () => {
    // mutation: ถอด `if (input.tokenExpiresAt)` ออกแล้วคำนวณจาก 0 → ข้อนี้แดง
    expect(resolveLineChannelHealth(healthy({ tokenExpiresAt: null }), NOW)).toBe('HEALTHY')
  })
})

describe('resolveLineChannelHealth — เกณฑ์วันหมดอายุ', () => {
  it('[blocker] เหลือพอดีเกณฑ์ → เตือน · เหลือมากกว่าเกณฑ์ 1 วัน → ยังไม่เตือน', () => {
    // ขอบเขตของ `<=` — mutation: เปลี่ยนเป็น `<` แล้วข้อแรกแดง
    const atThreshold = healthy({ tokenExpiresAt: new Date(NOW + TOKEN_EXPIRING_DAYS * DAY) })
    const beyond = healthy({ tokenExpiresAt: new Date(NOW + (TOKEN_EXPIRING_DAYS + 1) * DAY) })
    expect(resolveLineChannelHealth(atThreshold, NOW)).toBe('TOKEN_EXPIRING')
    expect(resolveLineChannelHealth(beyond, NOW)).toBe('HEALTHY')
  })

  it('token หมดอายุไปแล้ว แต่ LINE ยังไม่ปฏิเสธ → ยังเป็นแค่ TOKEN_EXPIRING ไม่ใช่ TOKEN_INVALID', () => {
    // 🛑 คอลัมน์นี้เป็นภาพนิ่ง ณ เวลาที่เขียน — ห้ามให้มันประกาศแทน LINE ว่า token ตายแล้ว
    // ตัวตัดสินจริงคือ status ซึ่งพลิกเมื่อ LINE ปฏิเสธเราจริงเท่านั้น
    expect(resolveLineChannelHealth(healthy({ tokenExpiresAt: new Date(NOW - 5 * DAY) }), NOW)).toBe('TOKEN_EXPIRING')
  })
})

describe('daysUntilTokenExpiry', () => {
  it('ปัดขึ้นเสมอ — เหลือ 27 วันกับอีกนิดหน่อย ต้องอ่านว่า 28 ไม่ใช่ 27', () => {
    expect(daysUntilTokenExpiry(new Date(NOW + 27 * DAY + 3_600_000), NOW)).toBe(28)
  })

  it('หมดอายุไปแล้ว → 0 ไม่ใช่เลขติดลบ', () => {
    expect(daysUntilTokenExpiry(new Date(NOW - 3 * DAY), NOW)).toBe(0)
  })
})

describe('webhookMatchesOrigin', () => {
  const US = 'https://deepthailand.app/api/channels/line/webhook'

  it('[blocker] ตรงกันแบบ normalize — trailing slash และตัวพิมพ์ใหญ่ใน host ต้องไม่ทำให้ไม่ตรง', () => {
    // 🛑 ร้านคัดลอกมาวางแล้วเผลอเติม `/` ท้ายเป็นเรื่องปกติมาก — `===` ดิบจะกล่าวหาว่า
    // "ชี้ไปที่อื่น" ทั้งที่ถูกต้องทุกประการ แล้วร้านจะไล่แก้สิ่งที่ไม่ได้พัง
    // mutation: เปลี่ยน norm() เป็น identity → ข้อนี้แดง
    expect(webhookMatchesOrigin(US + '/', US)).toBe(true)
    expect(webhookMatchesOrigin('https://DeepThailand.app/api/channels/line/webhook', US)).toBe(true)
    expect(webhookMatchesOrigin('  ' + US + '  ', US)).toBe(true)
  })

  it('[blocker] คนละโดเมน = ไม่ตรง', () => {
    expect(webhookMatchesOrigin('https://someone-else.example/api/channels/line/webhook', US)).toBe(false)
  })

  it('[blocker] path ต่างกัน = ไม่ตรง (ห้ามเทียบแค่ host)', () => {
    // เคสจริงที่เป็นไปได้: ร้านเคยตั้งชี้ไป webhook ของ Facebook ในโดเมนเดียวกัน
    expect(webhookMatchesOrigin('https://deepthailand.app/api/channels/facebook/webhook', US)).toBe(false)
  })

  it('ยังไม่ได้ตั้ง (null) = ไม่ตรง', () => {
    expect(webhookMatchesOrigin(null, US)).toBe(false)
  })

  it('[blocker] โดเมนหลัก vs seller subdomain = ตรงกัน (เคสจริงบน prod)', () => {
    // 🛑 แอปเดียวกันเสิร์ฟทั้งสองโฮสต์ และ webhook ใช้ได้จากทั้งคู่ แต่ค่าที่เราแสดงให้ร้าน
    // คัดลอกมาจาก request.nextUrl.origin ซึ่งขึ้นกับว่าตอนนั้นอยู่ subdomain ไหน
    //
    // บน prod วันนี้ OA ของ BT ตั้งไว้ที่โดเมนหลัก ขณะที่หน้าตั้งค่าอยู่บน seller.* ⇒ เทียบ
    // สตริงตรง ๆ จะขึ้น "Webhook ชี้ไปที่อื่น" ให้ร้านที่ตั้งถูกทุกอย่าง
    // mutation: ถอด .replace(/^(seller|admin)\./, '') ออก → ข้อนี้แดง
    expect(webhookMatchesOrigin(US, 'https://seller.deepthailand.app/api/channels/line/webhook')).toBe(true)
    expect(webhookMatchesOrigin('https://seller.deepthailand.app/api/channels/line/webhook', US)).toBe(true)
    expect(webhookMatchesOrigin('https://admin.deepthailand.app/api/channels/line/webhook', US)).toBe(true)
  })

  it('[blocker] โดเมนคนอื่นที่ขึ้นต้นด้วย seller. ก็ยังไม่ตรง', () => {
    // ตัด prefix แล้วต้องไม่เผลอทำให้โดเมนคนอื่นกลายเป็นของเรา
    expect(webhookMatchesOrigin('https://seller.evil.example/api/channels/line/webhook', US)).toBe(false)
  })

  it('[blocker] URL พังหรือไม่ใช่ URL = ไม่ตรง (ห้าม throw)', () => {
    // LINE คืนค่าอะไรมาก็ได้ — โยน error กลางเส้นทางเรนเดอร์หน้าตั้งค่า = ทั้งหน้าล่ม
    expect(webhookMatchesOrigin('ไม่ใช่ URL', US)).toBe(false)
    expect(webhookMatchesOrigin('', US)).toBe(false)
  })
})

describe('resolveLineChannelHealth — เกณฑ์ความน่าเชื่อของสัญญาณ "secret ไม่ตรง"', () => {
  it('[blocker] ลายเซ็นไม่ผ่านครั้งเดียว ต้องไม่พลิกการ์ดเป็น SECRET_MISMATCH', () => {
    // 🛑 นี่คือด่านความปลอดภัย ไม่ใช่การปรับความไว: `x-line-signature` เป็น authentication
    // เพียงอย่างเดียวของ webhook ⇒ คำขอที่ลายเซ็นไม่ผ่าน = คำขอที่ยังไม่ผ่านการยืนยันตัวตน
    // ใครที่รู้ `destination` (bot userId กึ่งสาธารณะ) ก็ยิงเข้ามาได้
    // ถ้าครั้งเดียวพลิกได้ = คนนอกสั่งให้ร้านเห็น "Channel secret ไม่ตรง" เท็จ ๆ แล้วร้านจะไป
    // ไล่แก้ credential ที่ไม่ได้พัง
    // mutation: ถอด `&& input.inboundFailCount >= SECRET_MISMATCH_MIN_FAILS` ออก → ข้อนี้แดง
    expect(
      resolveLineChannelHealth(healthy({ inboundFailReason: 'SIGNATURE_MISMATCH', inboundFailCount: 1 }), NOW),
    ).toBe('HEALTHY')
  })

  it('[blocker] ถึงเกณฑ์พอดี → SECRET_MISMATCH (ขอบเขต >= ไม่ใช่ >)', () => {
    expect(
      resolveLineChannelHealth(
        healthy({ inboundFailReason: 'SIGNATURE_MISMATCH', inboundFailCount: SECRET_MISMATCH_MIN_FAILS }),
        NOW,
      ),
    ).toBe('SECRET_MISMATCH')
  })

  it('[blocker] ตัวนับสูงแต่ ingest ล่าสุดสำเร็จ (reason=null) → ไม่ใช่ SECRET_MISMATCH', () => {
    // ตัวนับต้องถูกอ่าน "คู่กับ" เหตุผลเสมอ — ตัวเลขลอย ๆ ไม่ได้แปลว่าอะไร
    expect(resolveLineChannelHealth(healthy({ inboundFailReason: null, inboundFailCount: 99 }), NOW)).toBe('HEALTHY')
  })
})
