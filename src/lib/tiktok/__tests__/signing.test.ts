import { describe, it, expect } from 'vitest'
import { buildSignature } from '@/lib/tiktok/shop-open-api'

// เทสชุดนี้ล็อกสูตร `sign` ของ TikTok Shop Open API ไว้ — feature 00020
//
// ที่มา: หน้าเอกสารทางการ "Sign your API request"
// (partner.tiktokshop.com/docv2/page/sign-your-api-request, อ่านผ่าน browser เพราะหน้าเป็น
// JS-rendered) — ยืนยันตรงกับ code sample ภาษา Go/Java ของ TikTok เอง
//
// ขอบเขตของเทสชุดนี้: พิสูจน์ว่า **implementation ของเราไม่เปลี่ยนพฤติกรรม** (regression lock)
// + ครอบกฎย่อยทุกข้อของสูตร. มันไม่ได้พิสูจน์ว่า TikTok จะรับลายเซ็นนี้จริง —
// ข้อนั้นพิสูจน์ได้ด้วยการเรียก API จริงเท่านั้น (บทเรียน feedback_spike_must_match_production_path)

const APP_SECRET = 'test_app_secret'
const PATH = '/customer_service/202309/conversations/7494560109732334262/messages'

describe('buildSignature — fixed vector (regression lock)', () => {
  it('ค่าคงที่: POST + query 3 ตัว + body → ลายเซ็นต้องไม่เปลี่ยน', () => {
    const body = JSON.stringify({ type: 'TEXT', content: JSON.stringify({ content: 'hi' }) })
    expect(body).toBe('{"type":"TEXT","content":"{\\"content\\":\\"hi\\"}"}')

    const sign = buildSignature({
      path: PATH,
      query: { app_key: '38abcd', timestamp: 1623812664, shop_cipher: 'GCP_XF90ig' },
      method: 'POST',
      body,
      contentType: 'application/json',
      appSecret: APP_SECRET,
    })

    // คำนวณจากสูตร: HMAC-SHA256( secret + path + "app_key38abcd" + "shop_cipherGCP_XF90ig"
    //                            + "timestamp1623812664" + body + secret , secret )
    expect(sign).toBe('666acf2e1c1c689bb496e4b0d30b3fe04fe0fff4641e19aa614fcf4ee7124f07')
  })

  it('คืน hex ความยาว 64 ตัวอักษรเสมอ (SHA-256)', () => {
    const sign = buildSignature({ path: PATH, query: { app_key: 'a' }, method: 'GET', appSecret: APP_SECRET })
    expect(sign).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('buildSignature — กฎย่อยของสูตร', () => {
  const base = { path: PATH, method: 'GET' as const, appSecret: APP_SECRET }

  it('ลำดับ key ใน object ไม่มีผล — เรียงตามตัวอักษรก่อนต่อ string เสมอ', () => {
    const a = buildSignature({ ...base, query: { app_key: 'k', shop_cipher: 'c', timestamp: 1 } })
    const b = buildSignature({ ...base, query: { timestamp: 1, app_key: 'k', shop_cipher: 'c' } })
    expect(a).toBe(b)
  })

  it('ตัด `sign` ออกจากการคำนวณ (ไม่งั้นจะเซ็นค่าตัวเองแบบวนซ้ำ)', () => {
    const withoutSign = buildSignature({ ...base, query: { app_key: 'k' } })
    const withSign = buildSignature({ ...base, query: { app_key: 'k', sign: 'ควรถูกละเลย' } })
    expect(withSign).toBe(withoutSign)
  })

  it('ตัด `access_token` และ `x-tts-access-token` ออก (token ไม่เข้าลายเซ็น — เอกสารทางการระบุชัด)', () => {
    const clean = buildSignature({ ...base, query: { app_key: 'k' } })
    expect(buildSignature({ ...base, query: { app_key: 'k', access_token: 'AAA' } })).toBe(clean)
    expect(buildSignature({ ...base, query: { app_key: 'k', 'x-tts-access-token': 'BBB' } })).toBe(clean)
  })

  it('path มีผลต่อลายเซ็น (ถูกต่อไว้หน้าสุด)', () => {
    const q = { app_key: 'k' }
    const a = buildSignature({ ...base, query: q, path: '/a/b' })
    const b = buildSignature({ ...base, query: q, path: '/a/c' })
    expect(a).not.toBe(b)
  })

  it('body มีผลกับ POST', () => {
    const q = { app_key: 'k' }
    const a = buildSignature({ ...base, method: 'POST', query: q, body: '{"x":1}', contentType: 'application/json' })
    const b = buildSignature({ ...base, method: 'POST', query: q, body: '{"x":2}', contentType: 'application/json' })
    expect(a).not.toBe(b)
  })

  it('multipart/form-data → **ไม่** ต่อ body (ตามสูตร)', () => {
    const q = { app_key: 'k' }
    const withBody = buildSignature({
      ...base, method: 'POST', query: q, body: 'ไบต์ของไฟล์', contentType: 'multipart/form-data; boundary=xyz',
    })
    const noBody = buildSignature({ ...base, method: 'POST', query: q, contentType: 'multipart/form-data; boundary=xyz' })
    expect(withBody).toBe(noBody)
  })

  it('ค่าที่เป็น array ถูกข้าม (ตาม sample ทางการที่ concat เฉพาะค่า scalar)', () => {
    const clean = buildSignature({ ...base, query: { app_key: 'k' } })
    expect(buildSignature({ ...base, query: { app_key: 'k', ids: ['1', '2'] } })).toBe(clean)
  })

  it('ค่า undefined ถูกข้าม — ต้องไม่เข้าลายเซ็นเพราะไม่ได้ถูกส่งออกไปจริง', () => {
    const clean = buildSignature({ ...base, query: { app_key: 'k' } })
    expect(buildSignature({ ...base, query: { app_key: 'k', shop_cipher: undefined } })).toBe(clean)
  })

  it('app_secret ต่างกัน → ลายเซ็นต่างกัน (secret เป็นทั้ง salt และ key)', () => {
    const q = { app_key: 'k' }
    expect(buildSignature({ ...base, query: q })).not.toBe(
      buildSignature({ ...base, query: q, appSecret: 'another_secret' }),
    )
  })

  it('timestamp ต่างกัน → ลายเซ็นต่างกัน (กัน replay)', () => {
    const a = buildSignature({ ...base, query: { app_key: 'k', timestamp: 1623812664 } })
    const b = buildSignature({ ...base, query: { app_key: 'k', timestamp: 1623812665 } })
    expect(a).not.toBe(b)
  })
})
